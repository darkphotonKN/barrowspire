package gameserver

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* What members are told (FS-NCC9J R5, R21). After a change, the pod that made it looks every
* recipient up in the presence index, through the runner so changes are told in the order they
* were made, then tells the ones it holds itself and sends one party_update letter to each other
* pod that holds any. A recipient with no presence entry is offline and hears nothing; they read
* the party on their return (R6). Notices for a player on another pod go the same way.
**/

// partyUpdate is one party_update to tell: the party as it now stands, why, and whom it is about.
type partyUpdate struct {
	party   partystore.Party
	reason  constants.PartyUpdateReason
	subject uuid.UUID
	// set for a removed player's final update or an arrival read: it goes to this player alone
	to uuid.UUID
	// a removed player's final update: told as built whatever its age, as they are in no newer
	// party. Marked, never inferred from who it is for: a player kicked while their arrival read
	// was in flight is in no newer party either (code review round 4, HIGH)
	final bool
	// the change ended the party: the pods that hear it let it go
	ended bool
}

func updateOf(p partystore.Party, reason constants.PartyUpdateReason, subject uuid.UUID) partyUpdate {
	return partyUpdate{party: p, reason: reason, subject: subject}
}

// recipients are who hear n: its one player, or every member.
func (n partyUpdate) recipients() []uuid.UUID {
	if n.to != uuid.Nil {
		return []uuid.UUID{n.to}
	}
	return memberIDs(n.party)
}

// announce tells every recipient of each item, in order, wherever they stand.
func (r *partyRegistry) announce(ctx context.Context, items ...partyUpdate) {
	if r.cfg.presence == nil || !r.courier.open() {
		r.deliver(items, nil)
		return
	}
	seen := make(map[uuid.UUID]struct{})
	var ids []uuid.UUID
	for _, n := range items {
		for _, id := range append(n.recipients(), memberIDs(n.party)...) {
			if _, dup := seen[id]; !dup {
				seen[id] = struct{}{}
				ids = append(ids, id)
			}
		}
	}
	onRunner(ctx, r.run,
		func(c context.Context) (map[uuid.UUID]partypresence.Found, error) {
			return r.cfg.presence.LookupIDs(c, ids)
		},
		func(where map[uuid.UUID]partypresence.Found, err error) {
			if errors.Is(err, errPartyRunnerBehind) {
				// telling the members now would overtake the changes still queued, so the re-read
				// tells them; a player told alone (removed, arriving) is told here, as nothing
				// later would reach them
				slog.Warn("party update left to the next re-read: runner behind")
				r.deliver(alone(items), nil)
				return
			}
			if err != nil {
				slog.Warn("party members not looked up, telling only this pod's", "error", err)
			}
			r.deliver(items, where)
		},
	)
}

func memberIDs(p partystore.Party) []uuid.UUID {
	ids := make([]uuid.UUID, len(p.Members))
	for i, m := range p.Members {
		ids[i] = m.PlayerID
	}
	return ids
}

// deliver tells each item's recipients this pod holds, and sends the rest's pods a letter each.
func (r *partyRegistry) deliver(items []partyUpdate, where map[uuid.UUID]partypresence.Found) {
	here := make(map[uuid.UUID]types.WorldType)
	for _, p := range r.directory.PresentPlayers() {
		here[p.ID] = p.World
	}
	for _, n := range items {
		whole := n.to == uuid.Nil
		if !n.ended && !n.final && r.cache.newer(n.party) {
			// the rule: a player is never shown a party older than the newest this pod knows. A
			// whole update older than the cache is not told (the newer one is, or will be); one to
			// a single player (an arrival sync) is sent as the newest party instead, which drops
			// the party on their screen if a change since removed them. Only a removed player's
			// final update goes out as built.
			if whole {
				slog.Debug("party update older than the cache, not told", "party_id", n.party.ID)
				continue
			}
			n.party, _ = r.cache.party(n.party.ID)
		}
		msg := r.updateMessage(n, here, where)
		told := r.courier.tell(n.recipients(), here, where, partyUpdateLetter{Party: n.party, Ended: n.ended, Whole: whole, Final: n.final, Message: msg.Payload})
		if whole && !n.ended && everyMemberHereTold(n.party, here, told) {
			r.cache.markTold(n.party.ID, n.party.Version)
		}
	}
}

// resync tells every member present here the newest party this pod knows, reason sync: a letter
// about it was lost, or a change was never told here (I-NCC9J-3 review). The party is marked told
// only if every one of them was.
func (r *partyRegistry) resync(_ context.Context, p partystore.Party) {
	newest, cached := r.cache.party(p.ID)
	if !cached {
		return
	}
	here := make(map[uuid.UUID]types.WorldType)
	for _, present := range r.directory.PresentPlayers() {
		here[present.ID] = present.World
	}
	told := make(map[uuid.UUID]struct{})
	for _, m := range newest.Members {
		if _, present := here[m.PlayerID]; !present {
			continue
		}
		item := partyUpdate{party: newest, reason: constants.PartyUpdateSync, subject: m.PlayerID, to: m.PlayerID}
		msg := r.updateMessage(item, here, nil)
		for id := range r.courier.tell([]uuid.UUID{m.PlayerID}, here, nil, partyUpdateLetter{Party: newest, Message: msg.Payload}) {
			told[id] = struct{}{}
		}
	}
	if everyMemberHereTold(newest, here, told) {
		r.cache.markTold(newest.ID, newest.Version)
	}
}

// updateMessage is n as a party_update: the party as it stands, each member with the pod holding
// them and the world they stand in, each open invite as a reserved slot, why, and whom it is
// about. size is the cap, not the count. FS-NCC9J R21; FS-R82NV R21, R32.
func (r *partyRegistry) updateMessage(n partyUpdate, here map[uuid.UUID]types.WorldType, where map[uuid.UUID]partypresence.Found) types.Message {
	members := make([]map[string]interface{}, 0, len(n.party.Members))
	reserved := make([]map[string]interface{}, 0, len(n.party.Reserved))
	if !n.ended {
		for _, m := range n.party.Members {
			podID, world := "", ""
			if w, held := here[m.PlayerID]; held {
				podID, world = r.cfg.podID, string(w)
			} else if found, present := where[m.PlayerID]; present {
				podID, world = found.PodID, found.World
			}
			members = append(members, map[string]interface{}{
				"player_id": m.PlayerID.String(),
				"name":      m.Name,
				"class":     m.Class,
				"joined_at": m.JoinedAt.UTC().Format(time.RFC3339),
				"where":     world,
				"pod_id":    podID,
				// away arrives with FS-NCC9J R17 (slice 4)
				"online": true,
			})
		}
		for _, res := range r.cache.openReservations(n.party) {
			reserved = append(reserved, map[string]interface{}{
				"name":       res.TargetName,
				"expires_at": res.ExpiresAt.UTC().Format(time.RFC3339),
			})
		}
	}
	return types.Message{
		Action: string(constants.ActionPartyUpdate),
		Payload: map[string]interface{}{
			"party_id":   n.party.ID.String(),
			"leader_id":  n.party.Leader.String(),
			"members":    members,
			"reserved":   reserved,
			"size":       r.cfg.size,
			"reason":     string(n.reason),
			"subject_id": n.subject.String(),
		},
	}
}

// heardUpdate is a party_update letter from another pod: the cache takes the party, and each
// addressed player this pod holds is told (R5). A letter older than the party this pod already
// holds arrived out of order and is dropped, so nobody is shown an older party; only a removed
// player's final update is told whatever its age, as in deliver.
func (r *partyRegistry) heardUpdate(l partyUpdateLetter) {
	if l.Ended {
		r.cache.drop(l.Party.ID)
	} else if taken := r.cache.put(l.Party); !taken && !l.Final {
		slog.Debug("party update letter older than the cache dropped", "party_id", l.Party.ID)
		return
	}
	msg := types.Message{Action: string(constants.ActionPartyUpdate), Payload: l.Message}
	told := make(map[uuid.UUID]struct{}, len(l.To))
	for _, id := range l.To {
		if err := r.sender.SendMessageToPlayer(id, msg); err != nil {
			slog.Debug("party update letter for a player not here dropped", "player_id", id, "error", err)
			continue
		}
		told[id] = struct{}{}
	}
	if l.Whole && !l.Ended {
		here := make(map[uuid.UUID]types.WorldType)
		for _, p := range r.directory.PresentPlayers() {
			here[p.ID] = p.World
		}
		if everyMemberHereTold(l.Party, here, told) {
			r.cache.markTold(l.Party.ID, l.Party.Version)
		}
	}
}

// everyMemberHereTold reports whether every member of p present on this pod is among told: only
// then is the party told here, and the re-read need not sync it (code review round 2).
func everyMemberHereTold(p partystore.Party, here map[uuid.UUID]types.WorldType, told map[uuid.UUID]struct{}) bool {
	for _, m := range p.Members {
		if _, present := here[m.PlayerID]; !present {
			continue
		}
		if _, ok := told[m.PlayerID]; !ok {
			return false
		}
	}
	return true
}

// alone are the items addressed to one player each.
func alone(items []partyUpdate) []partyUpdate {
	var out []partyUpdate
	for _, n := range items {
		if n.to != uuid.Nil {
			out = append(out, n)
		}
	}
	return out
}

// noticeAnywhere tells a player who is not the one asking something about their party, by code,
// on whatever pod holds them.
func (r *partyRegistry) noticeAnywhere(ctx context.Context, playerID uuid.UUID, code constants.PartyNoticeCode, name string) {
	if err := r.sender.SendMessageToPlayer(playerID, partyNotice(code, name)); err == nil {
		return
	}
	if r.cfg.presence == nil || !r.courier.open() {
		slog.Debug("party notice for a player not here dropped", "code", code, "player_id", playerID)
		return
	}
	onRunner(ctx, r.run,
		func(c context.Context) (map[uuid.UUID]partypresence.Found, error) {
			return r.cfg.presence.LookupIDs(c, []uuid.UUID{playerID})
		},
		func(where map[uuid.UUID]partypresence.Found, err error) {
			found, present := where[playerID]
			if err != nil || !present {
				slog.Debug("party notice for a player not found dropped", "code", code, "player_id", playerID, "error", err)
				return
			}
			r.courier.noticeAt(found, code, name)
		},
	)
}
