package gameserver

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Travel (FS-NCC9J R18–R20): a member in their own village asks to be taken to the hub of the pod
* their leader stands on, and is handed off there. Nobody's party changes; the member moves.
*
* The refusals are checked on the loop against the cache first, in R18's order, so a refusal the
* cache can already see costs no Redis call; then the party, the leader's place and their pod's
* room are read off the loop, and checked again in the same order, so a stale cache never sends
* anyone anywhere (R4).
**/

// hubOccupancyReader is how full another pod's hub is: hubocc.Redis in production (FS-JEAVX R19).
type hubOccupancyReader interface {
	Count(ctx context.Context, podID string) (count int, known bool, err error)
}

// hubOccupancyStore is each pod's hub occupancy both ways: this pod publishes its own, travel
// reads the leader's pod's.
type hubOccupancyStore interface {
	hubOccupancyReader
	Publish(ctx context.Context, podID string, count int) error
}

// travelRoom is the most a hub admits by travel: its cap and one full party (FS-NCC9J R18, R20).
const travelRoom = constants.HubOccupancyCap + constants.HubTravelMargin

// travelRead is what a travel reads off the loop: the traveller's party as Redis holds it, where
// its leader stands, and how full the leader's pod's hub is.
type travelRead struct {
	party partystore.Arrival
	// the leader's presence entry; present is false when they stand on no pod
	leader  partypresence.Found
	present bool
	// the leader's pod's hub count; known is false when it publishes none
	occupancy int
	known     bool
}

// travel handles party_travel: the member is sent world_handoff to the hub of their leader's pod,
// or told why not. The leader, and a member already on the leader's pod, are answered with
// nothing: the client never offers them Travel. FS-NCC9J R18.
func (r *partyRegistry) travel(ctx context.Context, traveller *types.Player, conn *websocket.Conn) {
	if r.closed {
		return
	}
	if let, going := r.letGo[traveller.ID]; going && let.conn == conn {
		slog.Debug("party travel by a traveller already let go, ignored", "player_id", traveller.ID)
		return
	}
	p, in := r.cache.partyOf(traveller.ID)
	if !in {
		r.refuse(conn, traveller.ID, constants.PartyNoticeNotMember)
		return
	}
	if r.notInHub(traveller.ID) {
		r.refuse(conn, traveller.ID, constants.PartyNoticeNotInHub)
		return
	}
	if r.queued(ctx, traveller.ID) {
		r.refuse(conn, traveller.ID, constants.PartyNoticeQueued)
		return
	}
	if p.Leader == traveller.ID {
		slog.Debug("party travel by the leader, ignored", "player_id", traveller.ID)
		return
	}
	if leaderAway(p) {
		r.refuse(conn, traveller.ID, constants.PartyNoticeLeaderAway)
		return
	}
	if r.cfg.store == nil || r.cfg.presence == nil {
		r.refuse(conn, traveller.ID, constants.PartyNoticeUnavailable)
		return
	}
	at := r.cfg.now()
	onRunner(ctx, r.run,
		func(c context.Context) (travelRead, error) { return r.readTravel(c, traveller.ID, at) },
		func(res travelRead, err error) { r.travelled(ctx, traveller, conn, res, err) },
	)
}

// readTravel reads, off the loop, the traveller's party, its leader's presence and, if they stand
// on a pod, that pod's hub count.
func (r *partyRegistry) readTravel(ctx context.Context, travellerID uuid.UUID, at time.Time) (travelRead, error) {
	var res travelRead
	var err error
	if res.party, err = r.cfg.store.PartyOf(ctx, travellerID, at); err != nil || !res.party.In {
		return res, err
	}
	res.leader, res.present, err = r.cfg.presence.Lookup(ctx, res.party.Party.Leader.String())
	if err != nil || !res.present || r.cfg.occupancy == nil {
		return res, err
	}
	res.occupancy, res.known, err = r.cfg.occupancy.Count(ctx, res.leader.PodID)
	return res, err
}

// travelled checks what readTravel found, in R18's order, and hands the traveller off.
func (r *partyRegistry) travelled(ctx context.Context, traveller *types.Player, conn *websocket.Conn, res travelRead, err error) {
	if err != nil {
		slog.Warn("party travel not read", "player_id", traveller.ID, "error", err)
		r.refuse(conn, traveller.ID, constants.PartyNoticeUnavailable)
		return
	}
	r.cache.sweptBy(ctx, res.party)
	switch {
	case !res.party.In:
		r.refuse(conn, traveller.ID, constants.PartyNoticeNotMember)
	case r.notInHub(traveller.ID):
		r.refuse(conn, traveller.ID, constants.PartyNoticeNotInHub)
	case res.party.Party.Leader == traveller.ID:
		slog.Debug("party travel by the leader, ignored", "player_id", traveller.ID)
	case leaderAway(res.party.Party) || !res.present:
		r.refuse(conn, traveller.ID, constants.PartyNoticeLeaderAway)
	case res.leader.PodID == r.cfg.podID:
		slog.Debug("party travel to the pod the traveller is on, ignored", "player_id", traveller.ID)
	case res.known && res.occupancy >= travelRoom:
		r.refuse(conn, traveller.ID, constants.PartyNoticePodFull)
	case res.leader.PodAddr == "":
		// written by a pod from before addresses were kept: refreshed within ten seconds
		slog.Warn("party travel: the leader's pod names no address", "pod_id", res.leader.PodID)
		r.refuse(conn, traveller.ID, constants.PartyNoticeUnavailable)
	default:
		r.handOff(conn, traveller, res.leader.PodAddr)
	}
}

// notInHub reports whether the traveller stands anywhere but this pod's hub: a field or a run.
func (r *partyRegistry) notInHub(playerID uuid.UUID) bool {
	return r.presentHere()[playerID] != types.WorldTypeHub
}

// leaderAway reports whether p's leader's record shows them away (R17, R18).
func leaderAway(p partystore.Party) bool {
	for _, m := range p.Members {
		if m.PlayerID == p.Leader {
			return m.Away
		}
	}
	return false
}

// travelWindow is how long a let-go traveller has to leave on the handoff before, still here on
// the same connection, they are taken back: the handoff's own seat lapse (FS-K2HKP).
const travelWindow = 15 * time.Second

// travelLetGo is a traveller this pod let go: over which connection, and until when.
type travelLetGo struct {
	conn  *websocket.Conn
	until time.Time
}

// handOff sends the traveller world_handoff to the hub of the pod at addr, and lets them go
// (R18, R19). One whose handoff could not be delivered is kept.
func (r *partyRegistry) handOff(conn *websocket.Conn, traveller *types.Player, addr string) {
	if err := r.sender.SendMessageToConn(conn, types.Message{
		Action:  string(constants.ActionWorldHandoff),
		Payload: map[string]interface{}{"addr": addr, "hub": true},
	}); err != nil {
		slog.Warn("party travel handoff not delivered", "player_id", traveller.ID, "error", err)
		return
	}
	r.directory.LetGo(traveller.ID, conn)
	r.letGo[traveller.ID] = travelLetGo{conn: conn, until: r.cfg.now().Add(travelWindow)}
}

// takeBackLapsed takes back each traveller whose window has passed while they are still here on
// the connection they were let go over: the travel did not take them (its arrival refused, R20),
// so they are present here again (R19).
func (r *partyRegistry) takeBackLapsed() {
	at := r.cfg.now()
	for id, let := range r.letGo {
		if at.Before(let.until) {
			continue
		}
		delete(r.letGo, id)
		r.directory.TakeBack(id, let.conn)
	}
}

// WithHubOccupancy publishes this pod's hub occupancy and reads other pods' for travel, the pod's
// Redis in production. FS-JEAVX R19; FS-NCC9J R18.
func WithHubOccupancy(store hubOccupancyStore) Option {
	return func(o *bootOptions) { o.hubOccupancy = store }
}
