package gameserver

import (
	"context"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* Party chat (FS-XGW7H): a party line is stamped once on the sender's pod, told at once to the
* members this pod seats, and carried to the rest by one presence read, off the hub's loop through
* the party runner, and one party_chat letter to each other pod that read names. The receiving pod
* hands the line to the players the letter names, without asking its own party cache: the sender's
* pod decided the audience (R13).
*
* Who is in the party is the sender's pod's party cache, read on the loop with no Redis call (R5).
* Nothing is kept, nothing retried, and no log line carries the text (R11, R16; ADR-0033).
**/

// chatParty is what the relay needs from the party side: the party a speaker is in as this pod
// caches it, and a way to carry a stamped line to the members this pod does not seat.
type chatParty interface {
	partyOfSpeaker(playerID uuid.UUID) (partyID uuid.UUID, members []uuid.UUID, in bool)
	carryPartyLine(ctx context.Context, partyID uuid.UUID, away []uuid.UUID, line types.Message)
}

// partyAudience is who a party line is for: the party, and every member, the sender included (R7).
type partyAudience struct {
	id      uuid.UUID
	members []uuid.UUID
}

// partyAudienceOf is the party the speaker is in, if this pod's cache knows one (R3, R5).
func (r *chatRelay) partyAudienceOf(playerID uuid.UUID) (partyAudience, bool) {
	id, members, in := r.party.partyOfSpeaker(playerID)
	return partyAudience{id: id, members: members}, in
}

// relayParty tells a stamped party line to the members seated here at once, through the writer
// queues, and hands the rest to the party side to carry to their pods (R8, R9). The members here
// never wait on Redis.
func (r *chatRelay) relayParty(ctx context.Context, party partyAudience, line types.Message) {
	seated := make(map[uuid.UUID]struct{})
	for _, id := range r.audience.SeatedPlayerIDs() {
		seated[id] = struct{}{}
	}
	var here, away []uuid.UUID
	for _, id := range party.members {
		if _, ok := seated[id]; ok {
			here = append(here, id)
		} else {
			away = append(away, id)
		}
	}
	if len(here) > 0 {
		if err := r.sender.BroadcastToPlayerList(here, line); err != nil {
			// a full writer queue or a connection gone since: that member misses it (R8)
			slog.Debug("party line not delivered to every member here", "party_id", party.id, "error", err)
		}
	}
	if len(away) > 0 {
		r.party.carryPartyLine(ctx, party.id, away, line)
	}
}

// partyOfSpeaker is the party the cache knows the player in, and its members. On the loop.
func (r *partyRegistry) partyOfSpeaker(playerID uuid.UUID) (uuid.UUID, []uuid.UUID, bool) {
	p, in := r.cache.partyOf(playerID)
	if !in {
		return uuid.Nil, nil, false
	}
	return p.ID, memberIDs(p), true
}

// carryPartyLine finds where the members not seated here stand, in one presence read through the
// runner, and sends each other pod holding any of them one party_chat letter (R9, R10). A pod that
// reaches no other by configuration carries nothing, quietly (R12); a read that fails, or that the
// runner has no room for, carries nothing either, with one Warn, and is never retried (R11).
func (r *partyRegistry) carryPartyLine(ctx context.Context, partyID uuid.UUID, away []uuid.UUID, line types.Message) {
	if r.cfg.presence == nil || !r.courier.open() {
		return
	}
	onRunner(ctx, r.run,
		func(c context.Context) (map[uuid.UUID]partypresence.Found, error) {
			return r.cfg.presence.LookupIDs(c, away)
		},
		func(where map[uuid.UUID]partypresence.Found, err error) {
			if err != nil {
				slog.Warn("party line told to this pod's members only: members elsewhere not looked up", "party_id", partyID, "error", err)
				return
			}
			r.courier.sendPartyChat(partyID, away, where, line.Payload)
		},
	)
}

// heardPartyChat tells a party line from another pod to each addressee seated here in a world.
// The letter decides who hears it; this pod's cache neither vetoes nor adds (R13).
func (r *partyRegistry) heardPartyChat(to []uuid.UUID, message map[string]interface{}) {
	seated := r.directory.SeatedConns()
	msg := types.Message{Action: string(constants.ActionChat), Payload: message}
	for _, id := range to {
		if _, ok := seated[id]; !ok {
			slog.Debug("party chat letter for a player not seated here skipped", "player_id", id)
			continue
		}
		if err := r.sender.SendMessageToPlayer(id, msg); err != nil {
			slog.Debug("party chat letter not delivered", "player_id", id, "error", err)
		}
	}
}

// sendPartyChat sends one party_chat letter to each other pod where names any of away, addressed
// to those it holds. A member found on this pod arrived after the line was told and misses it; one
// found nowhere is offline (R10). A letter that cannot be published is dropped with a Warn (R11).
func (c *partyCourier) sendPartyChat(partyID uuid.UUID, away []uuid.UUID, where map[uuid.UUID]partypresence.Found, message map[string]interface{}) {
	var pods []string
	to := make(map[string][]string)
	for _, id := range away {
		found, present := where[id]
		if !present || found.PodID == c.podID {
			continue
		}
		if _, seen := to[found.PodID]; !seen {
			pods = append(pods, found.PodID)
		}
		to[found.PodID] = append(to[found.PodID], id.String())
	}
	for _, podID := range pods {
		c.inbox.send(podID, letter{Kind: letterPartyChat, Payload: map[string]interface{}{
			"to":      to[podID],
			"message": message,
		}}, func() {
			slog.Warn("party chat letter not sent", "party_id", partyID, "pod_id", podID)
		})
	}
}

// receivePartyChat reads a party_chat letter's addressees and line and hands them on. A letter
// missing either is skipped with a Warn that carries no text.
func (c *partyCourier) receivePartyChat(l letter) {
	raw, _ := l.Payload["to"].([]interface{})
	to := make([]uuid.UUID, 0, len(raw))
	for _, v := range raw {
		s, _ := v.(string)
		if id, err := uuid.Parse(s); err == nil {
			to = append(to, id)
		}
	}
	message, _ := l.Payload["message"].(map[string]interface{})
	if len(to) == 0 || message == nil {
		slog.Warn("pod inbox party chat skipped: incomplete", "addressees", len(to), "has_message", message != nil)
		return
	}
	c.on.chat(to, message)
}
