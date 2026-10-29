package game

import (
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

/**
* GentleMeadows is the easy field: a hand-laid open meadow east of the hub,
* entered from the hub's east road. FS-X2F2H §Requirements 51–53 (D18, D19).
*
* The entrance is on the west edge, the road back to the hub; a player arrives
* just inside it, beyond its range. The boar is its one creature, levels 1–4,
* at three quarters of the Spire's stats and a third of its drop chance.
**/
func GentleMeadows() FieldPlace {
	return FieldPlace{
		ID:            FieldGentleMeadows,
		Width:         constants.MeadowsMapWidth,
		Height:        constants.MeadowsMapHeight,
		Layout:        meadowsLayout{},
		Entrance:      FieldPoint{X: 40, Y: 500},
		EntranceRange: constants.FieldEntranceRange,
		Arrival:       FieldPoint{X: 180, Y: 500},
		HubGate:       components.GateDestinationMeadows,

		Creatures:  []FieldCreature{{Archetype: components.MonsterArchetypeBoar, Weight: 1}},
		MinLevel:   MeadowsMinLevel,
		MaxLevel:   MeadowsMaxLevel,
		StatFactor: FieldStatFactor,
		DropFactor: MeadowsDropFactor,

		RespawnDelay:  FieldRespawnDelay,
		ElitePrefixes: FieldElitePrefixes,
	}
}

// The Meadows' keep-out areas: sparse tree clusters and a few rocks, the middle
// left open, and none near the road in. FS-X2F2H §Requirements 52.
var meadowsObstacles = []FieldObstacle{
	// tree clusters
	{X: 520, Y: 140, W: 160, H: 120},
	{X: 900, Y: 640, W: 140, H: 140},
	{X: 1300, Y: 220, W: 180, H: 120},
	{X: 1650, Y: 700, W: 120, H: 100},
	// rocks
	{X: 760, Y: 380, W: 60, H: 50},
	{X: 1180, Y: 860, W: 70, H: 50},
	{X: 1560, Y: 460, W: 60, H: 60},
}

// Where the Meadows' creatures stand: spread over the open ground, none within
// 400 px of the entrance, so the arrival point is quiet. FS-X2F2H §Requirements 52.
var meadowsSpawnPoints = []FieldPoint{
	{X: 600, Y: 420},
	{X: 640, Y: 820},
	{X: 840, Y: 200},
	{X: 1000, Y: 320},
	{X: 1100, Y: 560},
	{X: 1000, Y: 900},
	{X: 1260, Y: 700},
	{X: 1460, Y: 110},
	{X: 1480, Y: 900},
	{X: 1720, Y: 320},
	{X: 1860, Y: 560},
	{X: 1840, Y: 880},
}

// meadowsLayout hands back the fixed map. Copies, so no channel shares the map
// data with another or with a caller.
type meadowsLayout struct{}

func (meadowsLayout) Layout() (FieldLayout, error) {
	return FieldLayout{
		Obstacles:   slices.Clone(meadowsObstacles),
		SpawnPoints: slices.Clone(meadowsSpawnPoints),
	}, nil
}
