package game

import (
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// FieldID is a field's stable id, sent as `field` in its world_entered.
// FS-X2F2H §Requirements 2.
type FieldID string

const (
	// FieldGentleMeadows is the easy field east of the hub.
	FieldGentleMeadows FieldID = "gentle_meadows"
)

// FieldPoint is a point on a field's map.
type FieldPoint struct {
	X, Y float64
}

// FieldObstacle is a keep-out area on a field's map, walled so nothing walks or
// shoots through it.
type FieldObstacle struct {
	X, Y, W, H float64
}

// FieldLayout is what stands on a field's ground: its keep-out areas and the
// points its monsters spawn at (used from FS-X2F2H slice 3).
type FieldLayout struct {
	Obstacles   []FieldObstacle
	SpawnPoints []FieldPoint
}

// LayoutProvider builds a field's layout for one channel. The Meadows hands
// back a fixed, hand-laid one; a generated field (FS-3QHQZ) builds its own per
// channel, and may fail. FS-X2F2H §Requirements 3.
type LayoutProvider interface {
	Layout() (FieldLayout, error)
}

// FieldCreature is one row of a field's creature table.
type FieldCreature struct {
	Archetype string
}

/**
* FieldPlace is a field as data: everything a channel of it is built from.
* FS-X2F2H §Requirements 3.
*
* HubGate is the hub gate the field hangs off: the gate a player walks into to
* enter it, and the one whose arrival point they come home to.
**/
type FieldPlace struct {
	ID            FieldID
	Width, Height float64
	Layout        LayoutProvider
	Entrance      FieldPoint
	EntranceRange float64
	Arrival       FieldPoint
	HubGate       components.GateDestination

	Creatures          []FieldCreature
	MinLevel, MaxLevel int
	StatFactor         float64
	DropFactor         float64
}

// FieldPlaces are the fields this pod builds a channel of at boot. Only the
// Meadows here; FS-3QHQZ registers the Forest. FS-X2F2H §Requirements 4.
func FieldPlaces() []FieldPlace {
	return []FieldPlace{GentleMeadows()}
}

// FieldBounds is a field world of the place's size.
func FieldBounds(place FieldPlace) WorldBounds {
	return WorldBounds{Type: types.WorldTypeField, Width: place.Width, Height: place.Height}
}

/**
* FieldVisit is one player's stay in a field, from entry to whichever way out
* removes their body first. It is what settles (FS-X2F2H §F): ID is minted per
* entry and is the settlement's session_id, never the channel's own id, because
* character-service keys XP grants on it (R13, R42). Level and Experience are
* where the character finished, for the hub to seat them at (R16).
**/
type FieldVisit struct {
	ID          uuid.UUID
	Field       FieldID
	MemberID    uuid.UUID
	CharacterID uuid.UUID
	Username    string
	EnteredAt   time.Time
	LeftAt      time.Time

	Level      int
	Experience int64
}

/**
* InitialFieldMapObjects builds a channel of the place: the entrance gate back
* to the hub and the layout's keep-out areas. A field has no floors, stairs,
* escape, containers or match-progress entity, so the end rule never ends it
* (FS-X2F2H §Requirements 5, 6). Called once, as the channel is built, before
* anyone can be seated in it.
**/
func (s *Session) InitialFieldMapObjects(place FieldPlace, layout FieldLayout) {
	s.mu.Lock()
	s.place = &place
	s.fieldLayout = layout
	s.mu.Unlock()

	CreateFieldEntranceEntity(s.EntityManager, place.Entrance.X, place.Entrance.Y, place.EntranceRange)

	for _, obstacle := range layout.Obstacles {
		CreateWallEntity(s.EntityManager, WallConfig{X: obstacle.X, Y: obstacle.Y, Width: obstacle.W, Height: obstacle.H}, uuid.New())
	}

	slog.Info("Field channel built",
		"session_id", s.ID,
		"field", place.ID,
		"obstacles", len(layout.Obstacles),
		"spawn_points", len(layout.SpawnPoints),
	)
}

// FieldID is the field this world is a channel of; empty for the hub and a run.
func (s *Session) FieldID() FieldID {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.place == nil {
		return ""
	}
	return s.place.ID
}

// FieldPlace is the place this world is a channel of; not ok for the hub and a run.
func (s *Session) FieldPlace() (FieldPlace, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.place == nil {
		return FieldPlace{}, false
	}
	return *s.place, true
}
