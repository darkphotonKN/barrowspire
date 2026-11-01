package gameserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/messaging"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Field worlds on this pod (FS-X2F2H, ADR-0030): one channel of each registered
* place, built at boot beside the hub and never shut down. A player walks in
* from a hub gate and back out through the field's entrance by a local world
* switch on the one connection. Fields never touch the matchmaker, the queue's
* write paths, the handoff or Redis: the queue is only read, to refuse a queued
* member (D4).
**/

// VisitSettler takes a field visit that has ended, exactly once per visit, and
// writes it to the match-end outbox (FS-X2F2H §F R39, ADR-0031). The game
// service is the one in production.
type VisitSettler interface {
	PublishFieldVisit(ctx context.Context, visit game.FieldVisit) error
}

// logVisitSettler is the settlement of a server built without a publisher: it
// logs the visit and publishes nothing.
type logVisitSettler struct{}

func (logVisitSettler) PublishFieldVisit(_ context.Context, visit game.FieldVisit) error {
	slog.Info("Field visit settled with no publisher, nothing written",
		"visit_id", visit.ID, "field", visit.Field, "member_id", visit.MemberID,
		"character_id", visit.CharacterID, "entered_at", visit.EnteredAt, "left_at", visit.LeftAt)
	return nil
}

// fieldReadTimeout bounds the queue and loadout reads an entry waits on, the
// arrival path's loadout bound.
const fieldReadTimeout = 3 * time.Second

// visitSettleTimeout bounds a visit's outbox write.
const visitSettleTimeout = 2 * time.Second

// Why a field would not take or let go of a player, each with the stable reason
// the client switches on. FS-X2F2H §Requirements 10, 14.
var (
	errEnterFieldNotInHub    = errors.New("not_in_hub")
	errEnterFieldNoCharacter = errors.New("no_character")
	errEnterFieldUnknown     = errors.New("unknown_field")
	errEnterFieldNotAtGate   = errors.New("not_at_gate")
	errEnterFieldQueued      = errors.New("queued")

	// unreadable gear refuses entry anywhere it would be worn: a field, and
	// the Spire's find_game and start_solo. Fail closed.
	errNoLoadout = errors.New("loadout_unavailable")

	// a second enter_field while the member's first is still in flight; it
	// answers as the stale enter it is, not_in_hub
	errFieldEntryInFlight = errors.New("field entry already in flight")

	errLeaveFieldNotInField = errors.New("not_in_field")
	errLeaveFieldNotAtGate  = errors.New("not_at_gate")
	errLeaveFieldFallen     = errors.New("fallen")
)

// fieldRefusals are the words a refused field action carries beside its
// reason, for any client that does not write its own. FS-X2F2H §Requirements 60.
var fieldRefusals = map[error]string{
	errEnterFieldNotInHub:    "You are not in the hub.",
	errEnterFieldNoCharacter: "Enter the hub with a character first.",
	errEnterFieldUnknown:     "That road leads nowhere yet.",
	errEnterFieldNotAtGate:   "Walk to the gate first.",
	errEnterFieldQueued:      "Leave the queue first.",
	errNoLoadout:             "Your gear could not be fetched. Try again shortly.",
	errLeaveFieldNotInField:  "You are not in the fields.",
	errLeaveFieldNotAtGate:   "Walk to the road home first.",
	errLeaveFieldFallen:      "You have fallen. You will rise at the road home.",
}

// fieldRefusal is a refused field action's reason and words.
func fieldRefusal(err error) (reason, message string) {
	for sentinel, words := range fieldRefusals {
		if errors.Is(err, sentinel) {
			return sentinel.Error(), words
		}
	}
	return errEnterFieldNotInHub.Error(), fieldRefusals[errEnterFieldNotInHub]
}

// Option adjusts how a Server boots.
type Option func(*bootOptions)

// bootOptions are what a pod's fields are generated from at boot, and where
// their visits settle.
type bootOptions struct {
	// seed is the one seed every generated field of this pod comes from
	seed         uint64
	forestParams levelgen.Params
	visitSettler VisitSettler
	// what the chat relay stamps lines with (FS-WJGFJ R3); the wall clock and
	// fresh uuids unless a test fixes them
	chatNow   func() time.Time
	chatNewID func() uuid.UUID
	// the Redis side of chat; nil on a pod built without one, which then refuses world chat as
	// closed (FS-5SH4G; code review 2026-10-31)
	chatBus chatBus
	// the party registry's clock, and the ticks it sweeps on: the wall clock and a
	// one-second ticker unless a test turns them by hand (FS-R82NV R14)
	partyNow   func() time.Time
	partyTicks <-chan time.Time
	// the party cap, PARTY_SIZE in production (FS-R82NV R8)
	partySize int
	// where party pointers are written; nil leaves them unwritten (FS-R82NV R3)
	partyPointers partyPointers
	// where this pod's hub is written into the presence index; nil writes nothing (FS-R82NV R7)
	presence presenceStore
	// the Redis side of the pod inbox; nil, and this pod reaches no other (FS-R82NV R9)
	inboxBus inboxBus
}

// newBootOptions are the defaults with opts applied: a fresh seed, the
// Forest's own parameters, visits settled to the log alone, and chat stamped
// by the wall clock.
func newBootOptions(opts ...Option) bootOptions {
	boot := bootOptions{seed: rand.Uint64(), forestParams: levelgen.ForestParams, visitSettler: logVisitSettler{}, chatNow: time.Now, chatNewID: uuid.New, partyNow: time.Now, partySize: defaultPartySize}
	for _, opt := range opts {
		opt(&boot)
	}
	return boot
}

// WithVisitSettler settles every ended field visit through settler, the
// match-end outbox write in production. FS-X2F2H §F R39.
func WithVisitSettler(settler VisitSettler) Option {
	return func(o *bootOptions) { o.visitSettler = settler }
}

/**
* WithBootSeed builds this pod's generated fields from seed rather than a fresh
* one, so a forest reported from a pod's log is rebuilt exactly.
* FS-3QHQZ §Requirements 10, User Story 26.
**/
func WithBootSeed(seed uint64) Option {
	return func(o *bootOptions) { o.seed = seed }
}

// laidOutField is a field place with the layout of the one channel this pod
// builds of it.
type laidOutField struct {
	place  game.FieldPlace
	layout game.FieldLayout
	// how a generated field's layout is rebuilt (seed, attempt), logged with
	// the channel's session id; none for a hand-laid field
	generatedFrom []any
}

/**
* layOutFields lays out every field this pod builds, before anything is
* started. The Forest is generated from a fresh seed drawn once per boot (or
* the one WithBootSeed fixes), outside levelgen, and logged so the layout can be
* rebuilt. A field that cannot be laid out is an error: the pod fails to start
* rather than serve a broken one. FS-3QHQZ §Requirements 10, Edge States
* "Generator boxed in".
**/
func layOutFields(boot bootOptions) ([]laidOutField, error) {
	forest, err := levelgen.Generate(boot.forestParams, boot.seed)
	if err != nil {
		return nil, fmt.Errorf("generate the forlorn forest from seed %d: %w", boot.seed, err)
	}

	places := game.FieldPlaces(forest)
	fields := make([]laidOutField, 0, len(places))
	for _, place := range places {
		layout, err := place.Layout.Layout()
		if err != nil {
			return nil, fmt.Errorf("lay out field %s: %w", place.ID, err)
		}
		laidOut := laidOutField{place: place, layout: layout}
		if place.ID == game.FieldForlornForest {
			laidOut.generatedFrom = []any{"seed", forest.Seed, "attempt", forest.Attempt}
		}
		fields = append(fields, laidOut)
	}
	return fields, nil
}

/**
* createFieldSessions builds one channel of every laid-out field, each before
* anyone can connect, and never shuts one down. FS-X2F2H §Requirements 4, 5.
**/
func (s *Server) createFieldSessions(fields []laidOutField) {
	for _, laidOut := range fields {
		place := laidOut.place

		entityManager := ecs.NewEntityManager()
		field := game.NewSession(s, messaging.NewMessageSender(s), serializer.NewStateSerializer(entityManager), entityManager, s.eventEmitter, s.itemsClient, game.FieldBounds(place))
		field.InitialFieldMapObjects(place, laidOut.layout)

		s.mu.Lock()
		s.sessions[field.ID] = field
		s.fields[place.ID] = field.ID
		s.mu.Unlock()

		slog.Info("Field world initiated", append([]any{"field", place.ID, "session_id", field.ID}, laidOut.generatedFrom...)...)
	}
}

// FieldSession is this pod's channel of the field, if it builds one.
func (s *Server) FieldSession(id game.FieldID) (*game.Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sessionID, registered := s.fields[id]
	if !registered {
		return nil, false
	}
	field, exists := s.sessions[sessionID]
	return field, exists
}

/**
* EnterField walks the member on conn from the hub into this pod's channel of
* the field, validated in the order FS-X2F2H §Requirements 10 states. The queue
* is read and the gear checked out here, before the field's lock is taken
* (R12), so the caller runs it off the message hub's loop. Accepted: a fresh body at the
* place's arrival point, the hub body gone, the record naming the field (R11).
**/
func (s *Server) EnterField(ctx context.Context, conn *websocket.Conn, fieldID string) (*game.Session, error) {
	player, exists := s.GetPlayerFromConn(conn)
	if !exists {
		return nil, fmt.Errorf("enter field: %w: %w", errEnterFieldNotInHub, errPlayerNotFound)
	}

	// one entry at a time per member, taken before the hub check: a second
	// enter while one is in flight is a stale enter, and once the first is
	// done the record no longer names the hub. Either way it is refused before
	// its checkout, which would reclaim the first visit's live gear under a
	// visit that never opens (FS-18Z5F §C R13, R14).
	if !s.beginFieldEntry(player.ID) {
		return nil, fmt.Errorf("enter field: %w: %w", errEnterFieldNotInHub, errFieldEntryInFlight)
	}
	defer s.endFieldEntry(player.ID)

	hub, exists := s.HubSession()
	if !exists {
		return nil, fmt.Errorf("enter field: %w: %w", errEnterFieldNotInHub, errHubMissing)
	}
	if world, _ := s.currentWorldOf(player.ID); world != hub.ID || !hub.HasPlayer(player.ID) {
		return nil, fmt.Errorf("enter field from %s: %w", world, errEnterFieldNotInHub)
	}

	character := s.characterOf(player)
	if character.ID == uuid.Nil {
		return nil, fmt.Errorf("enter field: %w", errEnterFieldNoCharacter)
	}

	field, exists := s.FieldSession(game.FieldID(fieldID))
	if !exists {
		return nil, fmt.Errorf("enter field %q: %w", fieldID, errEnterFieldUnknown)
	}
	place, _ := field.FieldPlace()

	if !hub.AtGate(player.ID, place.HubGate) {
		return nil, fmt.Errorf("enter field %s: %w", place.ID, errEnterFieldNotAtGate)
	}

	// an unreadable queue is not a queue they are in, as start_solo treats it (D4)
	queued, err := s.IsQueued(ctx, player.ID)
	if err != nil {
		slog.Warn("Could not read queue entry on enter_field, treating as not queued", "player_id", player.ID, "error", err)
	}
	if queued {
		return nil, fmt.Errorf("enter field %s: %w", place.ID, errEnterFieldQueued)
	}

	// the visit id is minted first: the gear is checked out under it, after
	// the pre-checks above and before the field's lock, so a slow items-service
	// delays only this entry (FS-18Z5F §C R13, R14, R16)
	visitID := uuid.New()
	gear, err := s.setupHandoffConnectingPlayer(ctx, player.ID, visitID, s.tokenOf(player))
	if err != nil {
		return nil, fmt.Errorf("enter field %s: %w: %w", place.ID, errNoLoadout, err)
	}

	visit, err := field.SeatVisitor(player.ID, character, visitID, gear)
	if errors.Is(err, game.ErrAlreadyHere) {
		return nil, fmt.Errorf("enter field %s: %w: %w", place.ID, errEnterFieldNotInHub, err)
	}
	if errors.Is(err, game.ErrNoLoadout) {
		return nil, fmt.Errorf("enter field %s: %w: %w", place.ID, errNoLoadout, err)
	}
	if err != nil {
		return nil, fmt.Errorf("enter field %s: %w", place.ID, err)
	}

	// The hub body goes before the record moves. If the record left the hub
	// meanwhile (leave_hub, a normal close), or conn dropped and its member is
	// held for a reconnect, this visit never began and is ended now: a reconnect
	// finds the record in the hub, never the field, and finds its body there too,
	// put back at the gate it stood at (R17, D7).
	hub.RemovePlayer(player.ID.String())
	if !s.moveRecordOnConn(conn, player.ID, hub.ID, field.ID) {
		s.endVisit(ctx, field, player.ID)
		s.reseatAtHubGate(hub, player, place.HubGate)
		return nil, fmt.Errorf("enter field %s: record left the hub or the connection dropped: %w", place.ID, errEnterFieldNotInHub)
	}

	slog.Info("Walked into a field", "player_id", player.ID, "field", place.ID, "visit_id", visit.ID)

	return field, nil
}

// beginFieldEntry marks the member's field entry in flight. Reports false,
// marking nothing, when one already is.
func (s *Server) beginFieldEntry(playerID uuid.UUID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, inFlight := s.fieldEntries[playerID]; inFlight {
		return false
	}
	s.fieldEntries[playerID] = struct{}{}
	return true
}

// endFieldEntry clears the member's field entry once it has decided.
func (s *Server) endFieldEntry(playerID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.fieldEntries, playerID)
}

/**
* LeaveField walks the member out of the field their record names through its
* entrance gate, home to the hub at the matching hub gate's arrival point.
* Refused away from the entrance and while fallen. FS-X2F2H §Requirements 14, 15.
**/
func (s *Server) LeaveField(ctx context.Context, player *types.Player) (*game.Session, error) {
	world, _ := s.currentWorldOf(player.ID)
	field, exists := s.GetGameSession(world)
	if !exists || field.WorldType() != types.WorldTypeField {
		return nil, fmt.Errorf("leave field: %w", errLeaveFieldNotInField)
	}

	visit, err := field.LeaveThroughEntrance(player.ID)
	switch {
	case errors.Is(err, game.ErrNotAtGate):
		return nil, fmt.Errorf("leave field %s: %w", field.ID, errLeaveFieldNotAtGate)
	case errors.Is(err, game.ErrFallen):
		return nil, fmt.Errorf("leave field %s: %w", field.ID, errLeaveFieldFallen)
	case err != nil:
		// another way out took the body first
		return nil, fmt.Errorf("leave field %s: %w: %w", field.ID, errLeaveFieldNotInField, err)
	}

	return s.comeHome(ctx, field, visit)
}

/**
* comeHome brings a member whose visit just ended back to the hub: the visit
* settles, the character takes what it earned (R16), and the hub seats them at
* the field's hub gate, past the occupancy cap, since coming home is not
* arriving (R15). The record moves only if it still names the field: if
* another way out moved it first (enter_hub seated them already, leave_hub
* left for the roster, a normal close forgot them), that one decided where they
* are, and a body seated here for nobody is taken back out.
**/
func (s *Server) comeHome(ctx context.Context, field *game.Session, visit game.FieldVisit) (*game.Session, error) {
	s.settleVisit(ctx, visit)

	// the body is already gone, so a member with no home to come to is in no
	// field either: that is the reason leave_field answers
	hub, exists := s.HubSession()
	if !exists {
		return nil, fmt.Errorf("come home: %w: %w", errLeaveFieldNotInField, errHubMissing)
	}
	player, onRecord := s.PlayerByID(visit.MemberID)
	if !onRecord {
		return nil, fmt.Errorf("come home: %w: %w", errLeaveFieldNotInField, errPlayerNotFound)
	}

	place, _ := field.FieldPlace()
	s.seatAtHubGate(hub, player, place.HubGate)

	moved, world := s.moveRecord(player.ID, field.ID, hub.ID)
	if !moved {
		if world != hub.ID {
			hub.RemovePlayer(player.ID.String())
		}
		return nil, fmt.Errorf("come home: record names %s: %w", world, errLeaveFieldNotInField)
	}

	return hub, nil
}

// seatAtHubGate seats the member's hub body at gate's arrival point, or at the
// hub's spawn if the hub has no such gate. Past the occupancy cap: whoever is
// seated here is coming home, not arriving (R15).
func (s *Server) seatAtHubGate(hub *game.Session, player *types.Player, gate components.GateDestination) {
	x, y, ok := hub.GateArrival(gate)
	if !ok {
		x, y = constants.HubSpawnX, constants.HubSpawnY
	}
	hub.AddPlayerAt(player.ID, s.characterOf(player), s.tokenOf(player), x, y)
}

// reseatAtHubGate puts back the hub body an entry took out before its move was
// refused, while the record still names the hub. The body goes in first and
// the record is read after, as comeHome does: a record that left the hub in
// between (the grace ran out, leave_hub, a normal close) takes the body back
// out, so no body is left seated here for nobody. FS-X2F2H §Requirements 17.
func (s *Server) reseatAtHubGate(hub *game.Session, player *types.Player, gate components.GateDestination) {
	s.seatAtHubGate(hub, player, gate)
	if world, _ := s.currentWorldOf(player.ID); world != hub.ID {
		hub.RemovePlayer(player.ID.String())
	}
}

/**
* endVisit ends the member's visit to field by whatever way out is calling, and
* settles it if this call is the one that ended it. Reports whether it was.
* FS-X2F2H §Requirements 49.
**/
func (s *Server) endVisit(ctx context.Context, field *game.Session, memberID uuid.UUID) bool {
	visit, ended := field.EndVisit(memberID)
	if !ended {
		return false
	}
	s.settleVisit(ctx, visit)
	return true
}

/**
* settleVisit writes an ended visit to the match-end outbox and keeps what it
* earned on the record, so the hub shows it without waiting for
* character-service. FS-X2F2H §Requirements 16, 38, 39.
*
* The write is one local transaction, bounded so a stalled database cannot hold
* the message hub's loop (leave_field runs on it), and detached from the
* caller's cancellation so a closing connection does not abort it. A visit that
* fails to write is lost, as a pod crash loses it (R50): nothing was at risk,
* and the record keeps the level and experience it had before the visit, since
* the next load would not show what the visit earned.
**/
func (s *Server) settleVisit(ctx context.Context, visit game.FieldVisit) {
	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), visitSettleTimeout)
	defer cancel()

	// TODO(owner): this write still runs on the message hub's loop for
	// leave_field; settlement moves off it with the leave_field / hub-loop rework.
	if err := s.visitSettler.PublishFieldVisit(writeCtx, visit); err != nil {
		slog.Error("Could not settle a field visit, it is lost and the record keeps its pre-visit progress",
			"visit_id", visit.ID, "field", visit.Field, "member_id", visit.MemberID,
			"character_id", visit.CharacterID, "level", visit.Level, "experience", visit.Experience, "error", err)
		return
	}

	s.ApplyRunProgress([]types.RunProgress{{
		MemberID:    visit.MemberID,
		CharacterID: visit.CharacterID,
		Seated:      true,
		Level:       visit.Level,
		Experience:  visit.Experience,
	}})
}

/**
* homeFromField brings a member whose connection dropped in a field home to the
* hub: the visit settles at once and they wait out the reconnect grace in the
* hub, so a reconnect is announced the hub (FS-X2F2H §Requirements 17, D7). A
* member in no field, or whose body another way out already took, is left
* alone.
**/
func (s *Server) homeFromField(ctx context.Context, playerID uuid.UUID) {
	world, onRecord := s.currentWorldOf(playerID)
	if !onRecord {
		return
	}
	field, exists := s.GetGameSession(world)
	if !exists || field.WorldType() != types.WorldTypeField {
		return
	}

	visit, ended := field.EndVisit(playerID)
	if !ended {
		return
	}
	if _, err := s.comeHome(ctx, field, visit); err != nil {
		slog.Warn("A member dropped in a field did not come home", "player_id", playerID, "error", err)
	}
}

/**
* leaveFieldForRoster is leave_hub from a field (FS-X2F2H §Requirements 18): the
* visit settles, the body goes, and the record names no world. Reports whether
* the record named a field.
**/
func (s *Server) leaveFieldForRoster(ctx context.Context, player *types.Player) bool {
	world, _ := s.currentWorldOf(player.ID)
	field, exists := s.GetGameSession(world)
	if !exists || field.WorldType() != types.WorldTypeField {
		return false
	}

	s.endVisit(ctx, field, player.ID)
	if moved, now := s.moveRecord(player.ID, field.ID, uuid.Nil); !moved {
		// another way out brought them home first: leave from there
		hub, inHub := s.HubSession()
		if inHub && now == hub.ID {
			hub.RemovePlayer(player.ID.String())
			s.moveRecord(player.ID, hub.ID, uuid.Nil)
		}
	}
	return true
}

/**
* moveRecord points every record of the member from one world to another, only
* if the record still names from. Reports whether it moved, and the world the
* record names now (uuid.Nil off record). Connection state is left alone: a
* member dropped mid-move stays under their reconnect grace.
**/
func (s *Server) moveRecord(playerID, from, to uuid.UUID) (bool, uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.moveRecordLocked(playerID, from, to)
}

/**
* moveRecordOnConn is moveRecord for a move the member asked for on conn, made
* off the message hub's loop: it moves only while conn is still the member's
* live connection. A member whose conn dropped (held for a reconnect, or back
* on another connection) is left where the record names, so a move decided
* before the drop never lands after it. Reports whether it moved.
* FS-X2F2H §Requirements 17.
**/
func (s *Server) moveRecordOnConn(conn *websocket.Conn, playerID, from, to uuid.UUID) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if mapped, live := s.connToPlayer[conn]; !live || mapped.ID != playerID {
		return false
	}
	moved, _ := s.moveRecordLocked(playerID, from, to)
	return moved
}

// moveRecordLocked is moveRecord's move. Callers must hold the write lock.
func (s *Server) moveRecordLocked(playerID, from, to uuid.UUID) (bool, uuid.UUID) {
	record, onRecord := s.players[playerID]
	if !onRecord {
		return false, uuid.Nil
	}
	if record.CurrentGameSessionId != from {
		return false, record.CurrentGameSessionId
	}

	for _, rec := range s.everyRecordOf(record) {
		rec.CurrentGameSessionId = to
	}
	return true, to
}

// characterOf is the character in play on the member's record, read under the
// lock it is written under.
func (s *Server) characterOf(player *types.Player) types.CharacterInPlay {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return player.Character
}
