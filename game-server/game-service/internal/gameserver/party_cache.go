package gameserver

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/google/uuid"
)

/**
* The party cache (FS-NCC9J R4): this pod's copy of the parties of the players it holds, as Redis
* last answered. Reads on the hub's loop come from here, never from Redis. It is kept by the
* party registry's writes, by an arrival read for each player newly seated here (R6), and by a
* re-read of every cached party every ten seconds; a party none of whose members is seated here
* is let go. Only the hub's loop touches it.
**/

// partyRefreshInterval is how often the cache re-reads every party it keeps (R4).
const partyRefreshInterval = 10 * time.Second

// partySeating answers who this pod holds, seated in any world.
type partySeating interface {
	SeatedPlayerIDs() []uuid.UUID
}

type partyCache struct {
	// nil on a pod built without Redis: nothing is read
	store   partyStore
	run     *partyRunner
	seating partySeating
	now     func() time.Time
	// told of the party read for a player newly seated here
	onArrival func(playerID uuid.UUID, p partystore.Party)

	parties  map[uuid.UUID]partystore.Party
	memberOf map[uuid.UUID]uuid.UUID // player id → party id, for every cached party's members
	// players seated here whose arrival read has succeeded, and those whose read is under way; a
	// player in neither is read on the next tick, so a failed read is tried again
	arrived  map[uuid.UUID]struct{}
	arriving map[uuid.UUID]struct{}

	lastRefresh time.Time
}

func newPartyCache(store partyStore, run *partyRunner, seating partySeating, now func() time.Time, onArrival func(uuid.UUID, partystore.Party)) *partyCache {
	return &partyCache{
		store:       store,
		run:         run,
		seating:     seating,
		now:         now,
		onArrival:   onArrival,
		parties:     make(map[uuid.UUID]partystore.Party),
		memberOf:    make(map[uuid.UUID]uuid.UUID),
		arrived:     make(map[uuid.UUID]struct{}),
		arriving:    make(map[uuid.UUID]struct{}),
		lastRefresh: now(),
	}
}

// put keeps p as Redis last answered it.
func (c *partyCache) put(p partystore.Party) {
	c.drop(p.ID)
	c.parties[p.ID] = p
	for _, m := range p.Members {
		c.memberOf[m.PlayerID] = p.ID
	}
}

// drop lets go of a party: it ended, or this pod holds none of its members.
func (c *partyCache) drop(partyID uuid.UUID) {
	old, cached := c.parties[partyID]
	if !cached {
		return
	}
	delete(c.parties, partyID)
	for _, m := range old.Members {
		if c.memberOf[m.PlayerID] == partyID {
			delete(c.memberOf, m.PlayerID)
		}
	}
}

// forgetReservation drops one open invite from a cached party.
func (c *partyCache) forgetReservation(partyID, inviteID uuid.UUID) {
	p, cached := c.parties[partyID]
	if !cached {
		return
	}
	kept := make([]partystore.Reservation, 0, len(p.Reserved))
	for _, res := range p.Reserved {
		if res.InviteID != inviteID {
			kept = append(kept, res)
		}
	}
	p.Reserved = kept
	c.parties[partyID] = p
}

// party is a cached party by id.
func (c *partyCache) party(partyID uuid.UUID) (partystore.Party, bool) {
	p, cached := c.parties[partyID]
	return p, cached
}

// partyOf is the cached party a player is a member of, if any.
func (c *partyCache) partyOf(playerID uuid.UUID) (partystore.Party, bool) {
	id, in := c.memberOf[playerID]
	if !in {
		return partystore.Party{}, false
	}
	return c.party(id)
}

// grouped reports whether the cache knows the player as a member of a party.
func (c *partyCache) grouped(playerID uuid.UUID) bool {
	_, in := c.memberOf[playerID]
	return in
}

// openReservations are a cached party's invites still within their minute.
func (c *partyCache) openReservations(p partystore.Party) []partystore.Reservation {
	at := c.now()
	open := make([]partystore.Reservation, 0, len(p.Reserved))
	for _, res := range p.Reserved {
		if at.Before(res.ExpiresAt) {
			open = append(open, res)
		}
	}
	return open
}

// tick keeps the cache: open invites past their minute leave it, with no notice (R12; the leader's
// client says so); a seated player not yet read is read on arrival (R6), again each tick until a
// read succeeds; a party none of whose members is seated here is let go; and every party left is
// re-read every ten seconds (R4).
func (c *partyCache) tick(ctx context.Context) {
	at := c.now()
	for id, p := range c.parties {
		p.Reserved = c.openReservations(p)
		c.parties[id] = p
	}

	seated := make(map[uuid.UUID]struct{})
	for _, id := range c.seating.SeatedPlayerIDs() {
		seated[id] = struct{}{}
	}
	for id := range c.arrived {
		if _, still := seated[id]; !still {
			delete(c.arrived, id)
		}
	}
	for id := range seated {
		_, done := c.arrived[id]
		_, underWay := c.arriving[id]
		if !done && !underWay {
			c.arrive(ctx, id)
		}
	}
	for id, p := range c.parties {
		if !anySeated(p, seated) {
			c.drop(id)
		}
	}

	if at.Sub(c.lastRefresh) >= partyRefreshInterval {
		c.lastRefresh = at
		c.refreshAll(ctx)
	}
}

func anySeated(p partystore.Party, seated map[uuid.UUID]struct{}) bool {
	for _, m := range p.Members {
		if _, here := seated[m.PlayerID]; here {
			return true
		}
	}
	return false
}

// arrive reads the party of a player newly seated here and hands it to onArrival, so a letter
// missed while they moved costs nothing (R6). Only a read that succeeds marks them arrived; one
// that fails, or that the runner had no room for, leaves them to be read on the next tick.
func (c *partyCache) arrive(ctx context.Context, playerID uuid.UUID) {
	if c.store == nil {
		return
	}
	c.arriving[playerID] = struct{}{}
	at := c.now()
	type read struct {
		party partystore.Party
		in    bool
	}
	onRunner(ctx, c.run,
		func(rc context.Context) (read, error) {
			p, in, err := c.store.PartyOf(rc, playerID, at)
			return read{party: p, in: in}, err
		},
		func(res read, err error) {
			delete(c.arriving, playerID)
			if err != nil {
				slog.Warn("party not read on arrival, tried again next tick", "player_id", playerID, "error", err)
				return
			}
			c.arrived[playerID] = struct{}{}
			if !res.in {
				return
			}
			c.put(res.party)
			c.onArrival(playerID, res.party)
		},
	)
}

// refreshAll re-reads every cached party from Redis in one trip, through the runner like any
// other call: a party Redis no longer has has ended, and is let go (R4).
func (c *partyCache) refreshAll(ctx context.Context) {
	if c.store == nil || len(c.parties) == 0 {
		return
	}
	ids := make([]uuid.UUID, 0, len(c.parties))
	for id := range c.parties {
		ids = append(ids, id)
	}
	at := c.now()
	type refreshed struct {
		parties []partystore.Party
		gone    []uuid.UUID
	}
	onRunner(ctx, c.run,
		func(rc context.Context) (refreshed, error) {
			parties, gone, err := c.store.RefreshAll(rc, ids, at)
			return refreshed{parties: parties, gone: gone}, err
		},
		func(res refreshed, err error) {
			if err != nil {
				slog.Warn("party cache not refreshed", "parties", len(ids), "error", err)
				return
			}
			for _, id := range res.gone {
				c.drop(id)
			}
			for _, p := range res.parties {
				// a party let go while the read was under way stays let go
				if _, still := c.parties[p.ID]; still {
					c.put(p)
				}
			}
		},
	)
}
