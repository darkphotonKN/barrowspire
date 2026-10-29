package game

import (
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// FieldID is a field's stable id, sent as `field` in its world_entered.
// FS-X2F2H §Requirements 2.
type FieldID string

const (
	// FieldGentleMeadows is the easy field east of the hub.
	FieldGentleMeadows FieldID = "gentle_meadows"
	// FieldForlornForest is the generated forest west of the hub (FS-3QHQZ).
	FieldForlornForest FieldID = "forlorn_forest"
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
// points its monsters spawn at. A standard spawn point's elites follow its
// place's StandardElites; an elite spawn point always holds an elite
// (FS-3QHQZ §Requirements 16–17).
type FieldLayout struct {
	Obstacles        []FieldObstacle
	SpawnPoints      []FieldPoint
	EliteSpawnPoints []FieldPoint
}

// FieldElite is a spawn point's elite rule: how the monsters it rolls, at each
// spawn and each respawn, come elite.
type FieldElite int

const (
	// FieldEliteRolled is elite at the Spire's floor-1 chance, read live
	// (FS-X2F2H §Requirements 28): the Meadows' points. The zero value.
	FieldEliteRolled FieldElite = iota
	// FieldEliteNever is never elite: the Forest's trail points.
	FieldEliteNever
	// FieldEliteAlways is always elite: the Forest's elite clearings.
	FieldEliteAlways
)

// LayoutProvider builds a field's layout for one channel. The Meadows hands
// back a fixed, hand-laid one; a generated field (FS-3QHQZ) builds its own per
// channel, and may fail. FS-X2F2H §Requirements 3.
type LayoutProvider interface {
	Layout() (FieldLayout, error)
}

// FieldCreature is one row of a field's creature table: what may spawn, and
// how often against the table's other rows (a row with no weight counts as 1).
type FieldCreature struct {
	Archetype components.MonsterArchetype
	Weight    float64
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

	// RespawnDelay is how long, in seconds, a spawn point stays empty after its
	// monster dies (FS-X2F2H §Requirements 27). ElitePrefixes names its elites;
	// none means FieldElitePrefixes. StandardElites is the elite rule of its
	// layout's standard spawn points; its elite spawn points are always elite.
	RespawnDelay   float64
	ElitePrefixes  []string
	StandardElites FieldElite
}

// FieldPlaces are the fields this pod builds a channel of at boot: the Meadows,
// and the Forest built from the layout this pod generated for it at boot.
// FS-X2F2H §Requirements 4, FS-3QHQZ §Requirements 10.
func FieldPlaces(forest levelgen.Layout) []FieldPlace {
	return []FieldPlace{GentleMeadows(), ForlornForest(forest)}
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
	// ExperienceGained is what this visit's kills earned, from zero at entry
	// (FS-X2F2H §Requirements 13, 30): the settlement's experience_gained.
	ExperienceGained int
	// Deaths is how many times the player fell on this visit (FS-X2F2H
	// §Requirements 22), for the settlement to read.
	Deaths int
}

/**
* InitialFieldMapObjects builds a channel of the place: the entrance gate back
* to the hub and the layout's keep-out areas. A field has no floors, stairs,
* escape, containers or match-progress entity, so the end rule never ends it
* (FS-X2F2H §Requirements 5, 6). Called once, as the channel is built, before
* anyone can be seated in it.
**/
func (s *Session) InitialFieldMapObjects(place FieldPlace, layout FieldLayout) {
	// every spawn point holds its monster before the tick can see the points
	// (FS-X2F2H §Requirements 26)
	population := newFieldPopulation(s.EntityManager, place, layout, s.spawnRand)
	population.fill()

	s.mu.Lock()
	s.place = &place
	s.fieldLayout = layout
	s.fieldPopulation = population
	s.mu.Unlock()

	// the gate and every wall are recorded as occupied, as the floor build
	// records what it places, so nothing placed later lands on them
	// (FS-3QHQZ §Requirements 13)
	CreateFieldEntranceEntity(s.EntityManager, place.Entrance.X, place.Entrance.Y, place.EntranceRange)
	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas,
		centredArea(place.Entrance.X, place.Entrance.Y, place.EntranceRange, place.EntranceRange))

	for _, obstacle := range layout.Obstacles {
		CreateWallEntity(s.EntityManager, WallConfig{X: obstacle.X, Y: obstacle.Y, Width: obstacle.W, Height: obstacle.H}, uuid.New())
		s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, PlaceArea(obstacle))
	}

	slog.Info("Field channel built",
		"session_id", s.ID,
		"field", place.ID,
		"obstacles", len(layout.Obstacles),
		"spawn_points", len(layout.SpawnPoints),
		"elite_spawn_points", len(layout.EliteSpawnPoints),
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
