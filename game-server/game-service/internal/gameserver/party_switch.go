package gameserver

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Changing character and the party (FS-NCC9J §Change: Changing character leaves the party, owner
* 2026-11-12). Going back to the roster keeps the party (C8); choosing a character there is the
* switch. The character the party holds for the player (by name and class: character names are
* unique) stays in it (C10); another takes them out of it exactly as party_leave would (C1's
* removal, C2, C3, C7), and is refused while their party's run is under way here (C12). Who the
* party holds is read from this pod's cache when it holds the party, else from the player's record,
* else, for a player whose record is gone, from Redis once they are seated (C13). The roster is
* sent the party, locked while its run is under way here, so it can mark the party's character and
* ask before a switch (C9).
**/

// switchVerdict is whether an entry changes the player's character, as far as the loop can tell.
type switchVerdict int

const (
	switchNo switchVerdict = iota
	switchYes
	// no character on the player's record and no party cached for them: told once Redis is read
	switchUnknown
)

// sameCharacter reports whether character is the one m, a party member, joined as. Character names
// are unique, case aside, among live characters; the class guards against a name freed and taken
// again.
func sameCharacter(m partystore.Member, character types.CharacterInPlay) bool {
	return strings.EqualFold(m.Name, character.Name) && strings.EqualFold(m.Class, character.Class)
}

// memberIn is playerID's member entry in p.
func memberIn(p partystore.Party, playerID uuid.UUID) (partystore.Member, bool) {
	for _, m := range p.Members {
		if m.PlayerID == playerID {
			return m, true
		}
	}
	return partystore.Member{}, false
}

// cachedMember is the member entry this pod's cache holds for playerID: read on the loop, no Redis
// call. False when the cache holds no party of theirs, which is not to say they are in none.
func (r *partyRegistry) cachedMember(playerID uuid.UUID) (partystore.Member, bool) {
	p, in := r.cache.partyOf(playerID)
	if !in {
		return partystore.Member{}, false
	}
	return memberIn(p, playerID)
}

// switchLocked reports whether a player standing outside any run may not change character because
// their party is in its run on this pod, where party_leave is refused locked (FS-BJNYC R19). A
// player inside the run is left to the run's own refusal (FS-BDA7X R7). Read on the loop from the
// cache and this pod's record of the run, no Redis call; a party in its run here is always cached,
// its delvers seated here. C12.
func (r *partyRegistry) switchLocked(ctx context.Context, playerID uuid.UUID) bool {
	if r.closed || r.directory.InRun(playerID) {
		return false
	}
	p, in := r.cache.partyOf(playerID)
	return in && r.locked(ctx, p)
}

// switched is told, on the loop, that playerID was just seated on conn as character, an entry the
// hub judged a switch (byRecord: another character than the one on their record) or could not
// judge (their record held no character and the cache no party of theirs). The party record decides:
// the character it holds for them stays (C10); another leaves the party (C7, C13). A player in no
// party who changed character by their record has every open invite to them spent (C2).
func (r *partyRegistry) switched(ctx context.Context, playerID uuid.UUID, conn *websocket.Conn, character types.CharacterInPlay, byRecord bool) {
	if r.closed || r.cfg.store == nil {
		return
	}
	decide := func(p partystore.Party, in bool) {
		if in {
			if m, listed := memberIn(p, playerID); listed && sameCharacter(m, character) {
				return
			}
			r.leaveOnSwitch(ctx, playerID, conn, p.ID)
			return
		}
		if byRecord {
			r.spendInvitesTo(ctx, playerID)
		}
	}
	if p, in := r.cache.partyOf(playerID); in {
		decide(p, true)
		return
	}
	// no pod of this party's need hold it: read from Redis, off the loop
	type peeked struct {
		party partystore.Party
		in    bool
	}
	onRunner(ctx, r.run,
		func(c context.Context) (peeked, error) {
			p, in, err := r.cfg.store.Peek(c, playerID)
			return peeked{party: p, in: in}, err
		},
		func(res peeked, err error) {
			if err != nil {
				slog.Warn("party of a player changing character not read, left to their record's expiry", "player_id", playerID, "error", err)
				return
			}
			decide(res.party, res.in)
		},
	)
}

// leaveOnSwitch takes a player who changed character out of partyID as party_leave would (C1):
// their party's open ready check is cancelled left, naming them (C3; FS-BJNYC R10), and the
// removal script runs; and every invite to them is spent as their decline (C2). Nothing is refused
// to them: a removal or decline Redis could not make is logged, and their record, refreshed by no
// pod for the old character, removes them when it expires (C6).
func (r *partyRegistry) leaveOnSwitch(ctx context.Context, playerID uuid.UUID, conn *websocket.Conn, partyID uuid.UUID) {
	if check := r.checks[partyID]; check != nil && !check.starting {
		if m := check.member(playerID); m != nil {
			r.cancelCheck(check, constants.ReadyCheckReasonLeft, []string{m.name})
		}
	}
	r.removeOnSwitch(ctx, conn, partystore.RemoveArgs{PartyID: partyID, PlayerID: playerID})
	r.spendInvitesTo(ctx, playerID)
}

// removeOnSwitch runs the removal script for a player who changed character. The others are told
// as for party_leave (left, then who leads if the lead passed); the leaver is sent their last
// update on the connection they entered on.
func (r *partyRegistry) removeOnSwitch(ctx context.Context, conn *websocket.Conn, args partystore.RemoveArgs) {
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.RemoveResult, error) { return r.cfg.store.Remove(c, args) },
		func(res partystore.RemoveResult, err error) {
			if err != nil {
				slog.Warn("party member not removed on changing character, left to their record's expiry", "party_id", args.PartyID, "player_id", args.PlayerID, "error", err)
				return
			}
			if res.Refusal != "" {
				slog.Debug("party member already gone on changing character", "party_id", args.PartyID, "player_id", args.PlayerID, "refusal", res.Refusal)
				return
			}
			slog.Info("Party member left on changing character", "party_id", args.PartyID, "player_id", args.PlayerID, "ended", res.Ended)
			leaver := args.PlayerID
			final := partyUpdate{party: res.Party, reason: constants.PartyUpdateLeft, subject: leaver, to: leaver, final: true}
			if res.Ended {
				r.cache.drop(args.PartyID)
				final = partyUpdate{party: partystore.Party{ID: args.PartyID, Leader: leaver}, reason: constants.PartyUpdateLeft, subject: leaver, to: leaver, ended: true}
			} else {
				r.cache.put(res.Party)
				items := []partyUpdate{updateOf(res.Party, constants.PartyUpdateLeft, leaver)}
				if res.Succeeded {
					items = append(items, updateOf(res.Party, constants.PartyUpdateLeader, res.Party.Leader))
				}
				r.announce(ctx, items...)
			}
			if err := r.sender.SendMessageToConn(conn, r.updateMessage(final, r.presentHere(), nil)); err != nil {
				slog.Debug("last party update not delivered to a player who changed character", "player_id", leaver, "error", err)
			}
		},
	)
}

// spendInvitesTo spends every open invite to playerID as their decline, read off the loop; one
// lapsed or answered meanwhile is refused by the script and ignored.
func (r *partyRegistry) spendInvitesTo(ctx context.Context, playerID uuid.UUID) {
	onRunner(ctx, r.run,
		func(c context.Context) ([]uuid.UUID, error) { return r.cfg.store.InvitesTo(c, playerID) },
		func(ids []uuid.UUID, err error) {
			if err != nil {
				slog.Warn("invites to a player changing character not read, left to lapse", "player_id", playerID, "error", err)
				return
			}
			for _, inviteID := range ids {
				args := partystore.DeclineArgs{InviteID: inviteID, DeclinerID: playerID, Now: r.cfg.now()}
				onRunner(ctx, r.run,
					func(c context.Context) (partystore.DeclineResult, error) { return r.cfg.store.Decline(c, args) },
					func(res partystore.DeclineResult, err error) {
						if err != nil {
							slog.Warn("invite to a player changing character not spent, left to lapse", "player_id", playerID, "invite_id", inviteID, "error", err)
							return
						}
						if res.Refusal != "" {
							return
						}
						r.declined(ctx, playerID, res)
					},
				)
			}
		},
	)
}

// rosterShown is what a connection standing on the roster was last sent of its party (C9): read
// again every partyRefreshInterval, and sent again only when the party, its version or its lock
// changed.
type rosterShown struct {
	conn *websocket.Conn
	// when it was last read, and whether a read is under way
	readAt  time.Time
	reading bool
	// what was last sent: a zero party id for no party
	sent    bool
	party   uuid.UUID
	version int64
	locked  bool
}

// tickRoster reads the party of every connection on the roster that has not been read on it, or
// not for partyRefreshInterval, and forgets those no longer there (C9).
func (r *partyRegistry) tickRoster(ctx context.Context) {
	if r.cfg.store == nil {
		return
	}
	conns := r.directory.RosterConns()
	for id, shown := range r.roster {
		if conns[id] != shown.conn {
			delete(r.roster, id)
		}
	}
	at := r.cfg.now()
	for id, conn := range conns {
		shown, known := r.roster[id]
		if known && (shown.reading || at.Sub(shown.readAt) < partyRefreshInterval) {
			continue
		}
		shown.conn, shown.readAt, shown.reading = conn, at, true
		r.roster[id] = shown
		r.readRoster(ctx, id, conn)
	}
}

// readRoster reads playerID's party, without keeping anything (C8), and sends it to them on conn
// as a sync, locked while its run is under way here; or the update listing nobody when they are in
// none. Nothing is sent when it is what they were last sent, or they have left the roster meanwhile.
func (r *partyRegistry) readRoster(ctx context.Context, playerID uuid.UUID, conn *websocket.Conn) {
	type peeked struct {
		party partystore.Party
		in    bool
	}
	onRunner(ctx, r.run,
		func(c context.Context) (peeked, error) {
			p, in, err := r.cfg.store.Peek(c, playerID)
			return peeked{party: p, in: in}, err
		},
		func(res peeked, err error) {
			shown, still := r.roster[playerID]
			if !still || shown.conn != conn {
				return
			}
			shown.reading = false
			defer func() { r.roster[playerID] = shown }()
			if err != nil {
				slog.Warn("party of a player on the roster not read, tried again next interval", "player_id", playerID, "error", err)
				return
			}
			var partyID uuid.UUID
			var version int64
			locked := false
			n := noPartyUpdate(playerID)
			if res.in {
				partyID, version = res.party.ID, res.party.Version
				locked = r.locked(ctx, res.party)
				n = partyUpdate{party: res.party, reason: constants.PartyUpdateSync, subject: playerID, to: playerID}
			}
			if shown.sent && shown.party == partyID && shown.version == version && shown.locked == locked {
				return
			}
			msg := r.updateMessage(n, r.presentHere(), nil)
			msg.Payload["locked"] = locked
			if err := r.sender.SendMessageToConn(conn, msg); err != nil {
				slog.Debug("party not delivered to a player on the roster", "player_id", playerID, "error", err)
				return
			}
			shown.sent, shown.party, shown.version, shown.locked = true, partyID, version, locked
		},
	)
}
