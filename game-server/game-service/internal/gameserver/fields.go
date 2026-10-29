package gameserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
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

// VisitSettler takes a field visit that has ended, exactly once per visit
// (FS-X2F2H §F). Slice 6 writes it to the match-end outbox; until then it is
// logged.
type VisitSettler interface {
	Settle(ctx context.Context, visit game.FieldVisit) error
}

// logVisitSettler is the settlement before FS-X2F2H slice 6: it publishes
// nothing.
type logVisitSettler struct{}

func (logVisitSettler) Settle(_ context.Context, visit game.FieldVisit) error {
	slog.Info("Field visit settled (not published until the outbox write lands)",
		"visit_id", visit.ID, "field", visit.Field, "member_id", visit.MemberID,
		"character_id", visit.CharacterID, "entered_at", visit.EnteredAt, "left_at", visit.LeftAt)
	return nil
}

// fieldReadTimeout bounds the queue and loadout reads an entry waits on, the
// arrival path's loadout bound.
const fieldReadTimeout = 3 * time.Second

// Why a field would not take or let go of a player, each with the stable reason
// the client switches on. FS-X2F2H §Requirements 10, 14.
var (
	errEnterFieldNotInHub    = errors.New("not_in_hub")
	errEnterFieldNoCharacter = errors.New("no_character")
	errEnterFieldUnknown     = errors.New("unknown_field")
	errEnterFieldNotAtGate   = errors.New("not_at_gate")
	errEnterFieldQueued      = errors.New("queued")
	errEnterFieldNoLoadout   = errors.New("loadout_unavailable")

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
	errEnterFieldNoLoadout:   "Your gear could not be fetched. Try again shortly.",
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

// bootOptions are what a pod's fields are generated from at boot.
type bootOptions struct {
	// seed is the one seed every generated field of this pod comes from
	seed         uint64
	forestParams levelgen.Params
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
func layOutFields(opts ...Option) ([]laidOutField, error) {
	boot := bootOptions{seed: rand.Uint64(), forestParams: levelgen.ForestParams}
	for _, opt := range opts {
		opt(&boot)
	}

	forest, err := levelgen.Generate(boot.forestParams, boot.seed)
	if err != nil {
		slog.Error("Could not generate the Forlorn Forest, the pod will not start", "seed", boot.seed, "error", err)
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
* and the loadout are read here, before the field's lock is taken (R12), so the
* caller runs it off the message hub's loop. Accepted: a fresh body at the
* place's arrival point, the hub body gone, the record naming the field (R11).
**/
func (s *Server) EnterField(ctx context.Context, conn *websocket.Conn, fieldID string) (*game.Session, error) {
	player, exists := s.GetPlayerFromConn(conn)
	if !exists {
		return nil, fmt.Errorf("enter field: %w: %w", errEnterFieldNotInHub, errPlayerNotFound)
	}

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

	// read before the field's lock: a slow items-service delays only this entry
	loadout, err := s.setupHandoffConnectingPlayer(ctx, player.ID, s.tokenOf(player))
	if err != nil {
		return nil, fmt.Errorf("enter field %s: %w: %w", place.ID, errEnterFieldNoLoadout, err)
	}

	visit, err := field.SeatVisitor(player.ID, character, loadout)
	if errors.Is(err, game.ErrAlreadyHere) {
		return nil, fmt.Errorf("enter field %s: %w: %w", place.ID, errEnterFieldNotInHub, err)
	}
	if err != nil {
		return nil, fmt.Errorf("enter field %s: %w", place.ID, err)
	}

	// The hub body goes before the record moves: a drop in between finds the
	// record in the hub with no body there, and the field body is ended by
	// whichever way out comes later. If the record left the hub meanwhile
	// (leave_hub, a normal close), this visit never began and is ended now.
	hub.RemovePlayer(player.ID.String())
	if moved, _ := s.moveRecord(player.ID, hub.ID, field.ID); !moved {
		s.endVisit(ctx, field, player.ID)
		return nil, fmt.Errorf("enter field %s: record left the hub: %w", place.ID, errEnterFieldNotInHub)
	}

	slog.Info("Walked into a field", "player_id", player.ID, "field", place.ID, "visit_id", visit.ID)

	return field, nil
}

/**
* LeaveField walks the member out of the field their record names through its
* entrance gate, home to the hub at the matching hub gate's arrival point.
* Refused away from the entrance and while fallen. FS-X2F2H §Requirements 14, 15.
**/
func (s *Server) LeaveField(player *types.Player) (*game.Session, error) {
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

	return s.comeHome(s.ctx, field, visit)
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

	hub, exists := s.HubSession()
	if !exists {
		return nil, errHubMissing
	}
	player, onRecord := s.PlayerByID(visit.MemberID)
	if !onRecord {
		return nil, fmt.Errorf("come home: %w", errPlayerNotFound)
	}

	place, _ := field.FieldPlace()
	x, y, ok := hub.GateArrival(place.HubGate)
	if !ok {
		x, y = constants.HubSpawnX, constants.HubSpawnY
	}
	hub.AddPlayerAt(player.ID, s.characterOf(player), s.tokenOf(player), x, y)

	moved, world := s.moveRecord(player.ID, field.ID, hub.ID)
	if !moved {
		if world != hub.ID {
			hub.RemovePlayer(player.ID.String())
		}
		return nil, fmt.Errorf("come home: record names %s: %w", world, errLeaveFieldNotInField)
	}

	return hub, nil
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

// settleVisit hands an ended visit to the settlement seam and keeps what it
// earned on the record, so the hub shows it without waiting for
// character-service. FS-X2F2H §Requirements 16, 38.
func (s *Server) settleVisit(ctx context.Context, visit game.FieldVisit) {
	if err := s.visitSettler.Settle(ctx, visit); err != nil {
		slog.Error("Could not settle a field visit", "visit_id", visit.ID, "member_id", visit.MemberID, "error", err)
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
func (s *Server) homeFromField(playerID uuid.UUID) {
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
	if _, err := s.comeHome(s.ctx, field, visit); err != nil {
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
