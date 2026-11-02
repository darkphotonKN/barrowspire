package gameserver

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* The party cache (FS-NCC9J R4): this pod's copy of the parties of the players it holds, as Redis
* last answered. Reads on the hub's loop come from here, never from Redis. It is kept by the
* party registry's writes, by an arrival read for each player newly seated here (R6), and by a
* re-read of every cached party every ten seconds; a party none of whose members is seated here
* is let go. Only the hub's loop touches it.
*
* Its reads also keep each member's record (R17): every re-read and arrival read refreshes the
* records of the players seated here, and lets Redis mark the rest away or remove them by age;
* between re-reads, each tick asks again about any party whose copy says a member is due. What a
* read changed is handed to the registry to tell, before anyone is reconciled.
*
* It also records what each player seated here was last shown, and after every re-read sends
* whoever was shown something other than what it now holds (I-NCC9J-3, decided after round 4): a
* letter lost on pub/sub then costs at most one re-read, for a removed player too, who is no
* longer any party's member and so is reached by no update to the party.
**/

// partyRefreshInterval is how often the cache re-reads every party it keeps (R4).
const partyRefreshInterval = 10 * time.Second

// partySeating answers who this pod holds, seated in any world, and on which connection.
type partySeating interface {
	SeatedConns() map[uuid.UUID]*websocket.Conn
}

// shownParty is what a player's screen was last sent: a party at a version, or no party (a zero
// party id), on the connection it was sent over.
type shownParty struct {
	conn    *websocket.Conn
	party   uuid.UUID
	version int64
}

// partyReader is the part of the party store the cache reads with.
type partyReader interface {
	PartyOf(ctx context.Context, playerID uuid.UUID, now time.Time) (partystore.Arrival, error)
	RefreshAll(ctx context.Context, ids, seated []uuid.UUID, now time.Time) (partystore.Refreshed, error)
}

type partyCache struct {
	// nil on a pod built without Redis: nothing is read
	store   partyReader
	run     *partyRunner
	seating partySeating
	now     func() time.Time
	// told of players to be shown their party: newly seated here, or shown something other than
	// what the cache holds after a re-read
	onShow func(ctx context.Context, views []partyView)
	// told what a read changed in a party's member records (R17), before anyone is shown it
	onSwept func(ctx context.Context, p partystore.Party, s partystore.Swept)
	// told every party taken, and every party let go (ended true), on the loop as it happens: an
	// open ready check is cancelled by a change of membership or leader (FS-BJNYC R10); nil, nobody
	onChanged func(partyID uuid.UUID, p partystore.Party, ended bool)

	parties  map[uuid.UUID]partystore.Party
	memberOf map[uuid.UUID]uuid.UUID // player id → party id, for every cached party's members
	// where memberOf is published after every change, for the worlds' serializers (FS-CH21F R5);
	// nil publishes nowhere
	membership *partyMembership
	// players seated here whose arrival read has succeeded, with the connection it was made for,
	// and those whose read is under way; a player in neither, or now on another connection, is
	// read on the next tick, so a failed read is tried again and a reconnect is read afresh
	arrived  map[uuid.UUID]*websocket.Conn
	arriving map[uuid.UUID]struct{}
	// who is seated here, as of the last tick, and what each was last shown
	conns map[uuid.UUID]*websocket.Conn
	shown map[uuid.UUID]shownParty
	// parties a tick's check is re-reading (R17), or whose read failed since the last full re-read
	sweeping map[uuid.UUID]struct{}

	lastRefresh time.Time
}

// partyView is the party a player is to be shown: party, or no party when inParty is false.
type partyView struct {
	playerID uuid.UUID
	party    partystore.Party
	inParty  bool
}

func newPartyCache(store partyReader, run *partyRunner, seating partySeating, now func() time.Time, membership *partyMembership, onShow func(context.Context, []partyView), onSwept func(context.Context, partystore.Party, partystore.Swept)) *partyCache {
	return &partyCache{
		store:       store,
		run:         run,
		seating:     seating,
		now:         now,
		membership:  membership,
		onShow:      onShow,
		onSwept:     onSwept,
		parties:     make(map[uuid.UUID]partystore.Party),
		memberOf:    make(map[uuid.UUID]uuid.UUID),
		arrived:     make(map[uuid.UUID]*websocket.Conn),
		arriving:    make(map[uuid.UUID]struct{}),
		conns:       make(map[uuid.UUID]*websocket.Conn),
		shown:       make(map[uuid.UUID]shownParty),
		sweeping:    make(map[uuid.UUID]struct{}),
		lastRefresh: now(),
	}
}

// put keeps p as Redis last answered it, unless the cache already holds a newer version of the
// party, as when letters arrive out of order; it reports whether it took p. Every party taken
// (written, lettered, re-read or read on arrival) passes here, and the membership is published.
func (c *partyCache) put(p partystore.Party) bool {
	if held, cached := c.parties[p.ID]; cached && held.Version > p.Version {
		return false
	}
	c.forget(p.ID)
	c.parties[p.ID] = p
	for _, m := range p.Members {
		c.memberOf[m.PlayerID] = p.ID
	}
	c.membership.publish(c.memberOf)
	if c.onChanged != nil {
		c.onChanged(p.ID, p, false)
	}
	return true
}

// newer reports whether the cache holds a newer version of p's party than p.
func (c *partyCache) newer(p partystore.Party) bool {
	held, cached := c.parties[p.ID]
	return cached && held.Version > p.Version
}

// drop lets go of a party: it ended, or this pod holds none of its members. The membership is
// published.
func (c *partyCache) drop(partyID uuid.UUID) {
	if c.forget(partyID) {
		c.membership.publish(c.memberOf)
		if c.onChanged != nil {
			c.onChanged(partyID, partystore.Party{}, true)
		}
	}
}

// forget takes a party and its members out of the cache, publishing nothing; it reports whether
// the party was cached.
func (c *partyCache) forget(partyID uuid.UUID) bool {
	old, cached := c.parties[partyID]
	if !cached {
		return false
	}
	delete(c.parties, partyID)
	delete(c.sweeping, partyID)
	for _, m := range old.Members {
		if c.memberOf[m.PlayerID] == partyID {
			delete(c.memberOf, m.PlayerID)
		}
	}
	return true
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
// client says so); a seated player not yet read, or seated on a new connection, is read on
// arrival (R6), again each tick until a read succeeds; what a player gone from here, or now on
// another connection, was shown is forgotten; a party none of whose members is seated here is let
// go; and every party left is re-read every ten seconds (R4), then every player reconciled, or,
// between re-reads, any party with a member due to go away or be removed is re-read (R17).
func (c *partyCache) tick(ctx context.Context) {
	at := c.now()
	for id, p := range c.parties {
		p.Reserved = c.openReservations(p)
		c.parties[id] = p
	}

	c.conns = c.seating.SeatedConns()
	for id, conn := range c.arrived {
		if c.conns[id] != conn {
			delete(c.arrived, id)
		}
	}
	for id, shown := range c.shown {
		if conn, seated := c.conns[id]; !seated || conn != shown.conn {
			delete(c.shown, id)
		}
	}
	for id := range c.conns {
		_, done := c.arrived[id]
		_, underWay := c.arriving[id]
		if !done && !underWay {
			c.arrive(ctx, id)
		}
	}
	for id, p := range c.parties {
		if !anySeated(p, c.conns) {
			c.drop(id)
		}
	}

	if at.Sub(c.lastRefresh) >= partyRefreshInterval {
		c.lastRefresh = at
		c.refreshAll(ctx)
		return
	}
	c.sweepDue(ctx, at)
}

func anySeated(p partystore.Party, seated map[uuid.UUID]*websocket.Conn) bool {
	for _, m := range p.Members {
		if _, here := seated[m.PlayerID]; here {
			return true
		}
	}
	return false
}

// arrive reads the party of a player newly seated here and hands it to onShow, so a letter
// missed while they moved costs nothing (R6). Only a read that succeeds marks them arrived; one
// that fails, or that the runner had no room for, leaves them to be read on the next tick.
func (c *partyCache) arrive(ctx context.Context, playerID uuid.UUID) {
	if c.store == nil {
		return
	}
	c.arriving[playerID] = struct{}{}
	conn := c.conns[playerID]
	at := c.now()
	onRunner(ctx, c.run,
		func(rc context.Context) (partystore.Arrival, error) {
			return c.store.PartyOf(rc, playerID, at)
		},
		func(res partystore.Arrival, err error) {
			delete(c.arriving, playerID)
			if err != nil {
				slog.Warn("party not read on arrival, tried again next tick", "player_id", playerID, "error", err)
				return
			}
			c.arrived[playerID] = conn
			view := partyView{playerID: playerID}
			// taken and told first: an arriver still a member hears it with the rest, and their own
			// sync then finds them shown it; one the read removed is told their last update by it
			c.sweptBy(ctx, res)
			if res.In {
				c.put(res.Party)
				// the newest the cache knows, which a letter may have brought past this read
				view.party, view.inParty = c.parties[res.Party.ID], true
			}
			c.onShow(ctx, []partyView{view})
		},
	)
}

// sweptBy takes and tells what a read of one player's party changed in its member records (R17):
// a party cached here takes the new version at once, so it lets a removed member go, and the
// change is told.
func (c *partyCache) sweptBy(ctx context.Context, read partystore.Arrival) {
	if !read.Swept.Changed() {
		return
	}
	if _, cached := c.parties[read.Party.ID]; cached {
		c.put(read.Party)
	}
	c.onSwept(ctx, read.Party, read.Swept)
}

// refreshAll re-reads every cached party from Redis in one trip, through the runner like any
// other call: a party Redis no longer has has ended, and is let go (R4). Every player seated here
// is then reconciled against what the cache holds (R21a), so a lost letter costs at most ten
// seconds; with no party cached there is nothing to read, and they are reconciled straight away.
func (c *partyCache) refreshAll(ctx context.Context) {
	if c.store == nil {
		return
	}
	if len(c.parties) == 0 {
		c.reconcile(ctx)
		return
	}
	ids := make([]uuid.UUID, 0, len(c.parties))
	for id := range c.parties {
		ids = append(ids, id)
	}
	c.reread(ctx, ids)
}

// sweepDue re-reads, between the ten-second re-reads, each cached party with a member who by the
// cache's copy is due to go away or be removed (R17: each pod checks its parties every tick). The
// copy only says when to ask; the script decides. One check per party at a time, and one that
// fails waits for the next full re-read, so an outage is not asked about every tick.
func (c *partyCache) sweepDue(ctx context.Context, at time.Time) {
	if c.store == nil {
		return
	}
	for id, p := range c.parties {
		if _, busy := c.sweeping[id]; busy || !c.due(p, at) {
			continue
		}
		c.sweeping[id] = struct{}{}
		c.reread(ctx, []uuid.UUID{id})
	}
}

// due reports whether, by the cache's copy, one of p's members not seated here has gone
// AwayAfter unrefreshed without showing away, or RecordTTL at all. A member seated here is
// refreshed by this pod's own re-reads.
func (c *partyCache) due(p partystore.Party, at time.Time) bool {
	for _, m := range p.Members {
		if _, here := c.conns[m.PlayerID]; here {
			continue
		}
		idle := at.Sub(m.SeenAt)
		if idle >= partystore.RecordTTL || (!m.Away && idle >= partystore.AwayAfter) {
			return true
		}
	}
	return false
}

// reread reads the parties ids from Redis in one trip, refreshing the records of their members
// seated here and keeping every other member's (R17): a party gone is let go, one that stands is
// taken, what a party's records changed is told, and every player here is reconciled. A party
// read is checked again by the next tick that finds it due; one whose read failed waits for the
// next full re-read.
func (c *partyCache) reread(ctx context.Context, ids []uuid.UUID) {
	var seated []uuid.UUID
	for _, id := range ids {
		for _, m := range c.parties[id].Members {
			if _, here := c.conns[m.PlayerID]; here {
				seated = append(seated, m.PlayerID)
			}
		}
	}
	at := c.now()
	onRunner(ctx, c.run,
		func(rc context.Context) (partystore.Refreshed, error) {
			return c.store.RefreshAll(rc, ids, seated, at)
		},
		func(res partystore.Refreshed, err error) {
			if err != nil {
				slog.Warn("party cache not refreshed", "parties", len(ids), "error", err)
				return
			}
			for _, id := range ids {
				delete(c.sweeping, id)
			}
			for _, id := range res.Gone {
				c.drop(id)
			}
			for _, p := range res.Parties {
				// a party let go while the read was under way stays let go
				if _, still := c.parties[p.ID]; still {
					c.put(p)
				}
				// told either way: the change is made, and its members may be elsewhere
				if s, swept := res.Swept[p.ID]; swept {
					c.onSwept(ctx, p, s)
				}
			}
			c.reconcile(ctx)
		},
	)
}

// reconcile shows every player seated here whose screen differs from what the cache holds: one
// with no record of what they were shown, a party they were not shown, a newer version of the one
// they were, or no party where they were shown one (R21a). A player whose arrival read has not
// yet succeeded is left to it. In memory: the re-read just before brought the cache level with
// Redis. Each sync is checked again as it goes out (partyRegistry.current), so a change told
// meanwhile is not told twice.
func (c *partyCache) reconcile(ctx context.Context) {
	var stale []partyView
	for id, conn := range c.conns {
		if c.arrived[id] != conn {
			continue
		}
		p, in := c.partyOf(id)
		if c.showing(id, p) {
			continue
		}
		stale = append(stale, partyView{playerID: id, party: p, inParty: in})
	}
	if len(stale) > 0 {
		c.onShow(ctx, stale)
	}
}

// showing reports whether a player's record already shows what p would show them: that party at
// its version or newer, or no party when p does not list them. A player with no record is shown
// nothing yet.
func (c *partyCache) showing(playerID uuid.UUID, p partystore.Party) bool {
	shown, known := c.shown[playerID]
	if !known {
		return false
	}
	if !hasMember(p, playerID) {
		return shown.party == uuid.Nil
	}
	return shown.party == p.ID && shown.version >= p.Version
}

// saw records that a player was sent p: that party at its version, or no party if p does not
// list them (a removed player's final update, an ended party, the update listing nobody).
func (c *partyCache) saw(playerID uuid.UUID, p partystore.Party) {
	shown := shownParty{conn: c.conns[playerID]}
	if hasMember(p, playerID) {
		shown.party, shown.version = p.ID, p.Version
	}
	c.shown[playerID] = shown
}
