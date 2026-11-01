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
	// set for a removed player's final update or a sync (an arrival read, a reconcile, the update
	// listing nobody): it goes to this player alone
	to uuid.UUID
	// a removed player's final update: told as built whatever its age, as they are in no newer
	// party. Marked, never inferred from who it is for: a player kicked while their arrival read
	// was in flight is in no newer party either (code review round 4, HIGH)
	final bool
	// the change ended the party, or no party stands for the player (noPartyUpdate): the pods that
	// hear it let it go, and it lists nobody
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
				// telling the members now would overtake the changes still queued, and with no
				// presence lookup a sync would name nobody's pod; the next reconcile tells them all.
				// A removed player's final update is told here: its reason would be lost
				slog.Warn("party update left to the next reconcile: runner behind")
				r.deliver(finals(items), nil)
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
	here := r.presentHere()
	for _, n := range items {
		whole := n.to == uuid.Nil
		// the rule: a player is never shown a party older than the newest this pod knows. A whole
		// update older than the cache is not told (the newer one is, or will be); a sync to one
		// player goes out only as it was built (current). Only a removed player's final update
		// goes out whatever its age.
		if whole && !n.ended && r.cache.newer(n.party) {
			slog.Debug("party update older than the cache, not told", "party_id", n.party.ID)
			continue
		}
		if !whole && !n.final && !r.current(n) {
			continue
		}
		msg := r.updateMessage(n, here, where)
		letterTo := where
		if n.party.ID == uuid.Nil {
			// the update listing nobody is for a player held here; one gone since needs none
			letterTo = nil
		}
		for id := range r.courier.tell(n.recipients(), here, letterTo, partyUpdateLetter{Party: n.party, Ended: n.ended, Final: n.final, Message: msg.Payload}) {
			r.cache.saw(id, n.party)
		}
	}
}

// current reports whether a sync made a moment ago still holds as it is about to go out: the
// cache still has its party at the version it was built from, and the player's record does not
// already show it. A sync overtaken by a change is not sent: whatever changed the party tells the
// player (a write's own update, a letter, the reconcile after a re-read), and the next reconcile
// tells anyone it missed. So a change is told once, and never after a sync of itself (code review
// rounds 6 and 7).
func (r *partyRegistry) current(n partyUpdate) bool {
	if !n.ended {
		held, cached := r.cache.party(n.party.ID)
		if !cached || held.Version != n.party.Version || !hasMember(held, n.to) {
			return false
		}
	}
	return !r.cache.showing(n.to, n.party)
}

// show tells players held here the party they are to be shown, reason sync: a player newly
// seated (R6), or one whose screen differs from the cache after a re-read (R21a). Through announce
// like any update, so each member's pod and world come from the presence index (R21).
func (r *partyRegistry) show(ctx context.Context, views []partyView) {
	items := make([]partyUpdate, 0, len(views))
	for _, v := range views {
		if !v.inParty {
			items = append(items, noPartyUpdate(v.playerID))
			continue
		}
		items = append(items, partyUpdate{party: v.party, reason: constants.PartyUpdateSync, subject: v.playerID, to: v.playerID})
	}
	r.announce(ctx, items...)
}

// noPartyUpdate tells a player they are in no party: an update listing nobody, with an empty party
// and leader id (R21). Ended, since no party stands for them: it is told whatever the cache holds.
func noPartyUpdate(playerID uuid.UUID) partyUpdate {
	return partyUpdate{reason: constants.PartyUpdateSync, subject: playerID, to: playerID, ended: true}
}

// presentHere is every player this pod holds, with the world each stands in.
func (r *partyRegistry) presentHere() map[uuid.UUID]types.WorldType {
	here := make(map[uuid.UUID]types.WorldType)
	for _, p := range r.directory.PresentPlayers() {
		here[p.ID] = p.World
	}
	return here
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
			"party_id":   idOrEmpty(n.party.ID),
			"leader_id":  idOrEmpty(n.party.Leader),
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
	for _, id := range l.To {
		if err := r.sender.SendMessageToPlayer(id, msg); err != nil {
			slog.Debug("party update letter for a player not here dropped", "player_id", id, "error", err)
			continue
		}
		r.cache.saw(id, l.Party)
	}
}

// idOrEmpty is id as a string, or empty for no id: the update listing nobody names no party and
// no leader (R21).
func idOrEmpty(id uuid.UUID) string {
	if id == uuid.Nil {
		return ""
	}
	return id.String()
}

// finals are the removed players' final updates among items.
func finals(items []partyUpdate) []partyUpdate {
	var out []partyUpdate
	for _, n := range items {
		if n.final {
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
