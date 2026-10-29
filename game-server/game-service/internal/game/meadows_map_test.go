package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §Requirements 51–53. I-X2F2H-1.

// meadowsLayoutOf is the Meadows' hand-laid layout, which never fails to build.
func meadowsLayoutOf(t *testing.T) FieldLayout {
	t.Helper()

	layout, err := GentleMeadows().Layout.Layout()
	require.NoError(t, err, "a hand-laid layout always builds")
	return layout
}

// insideObstacle reports whether a body standing at (x, y) would overlap any
// keep-out area.
func insideObstacle(layout FieldLayout, x, y float64) bool {
	for _, o := range layout.Obstacles {
		if x+constants.PlayerRadius > o.X && x-constants.PlayerRadius < o.X+o.W &&
			y+constants.PlayerRadius > o.Y && y-constants.PlayerRadius < o.Y+o.H {
			return true
		}
	}
	return false
}

// The place's data: about the hub's size, hanging off the hub's Meadows gate,
// with the boar at levels 1–4 and the stated factors. R51, R53.
func TestGentleMeadows_IsTheEasyFieldEastOfTheHub(t *testing.T) {
	meadows := GentleMeadows()

	assert.Equal(t, FieldGentleMeadows, meadows.ID)
	assert.Equal(t, FieldID("gentle_meadows"), meadows.ID, "the id the client and the wire use")
	assert.Equal(t, constants.MeadowsMapWidth, meadows.Width)
	assert.Equal(t, constants.MeadowsMapHeight, meadows.Height)
	assert.Equal(t, 2000.0, meadows.Width)
	assert.Equal(t, 1000.0, meadows.Height)
	assert.Equal(t, components.GateDestinationMeadows, meadows.HubGate, "entered from the hub's east road")

	assert.Equal(t, []FieldCreature{{Archetype: "boar"}}, meadows.Creatures)
	assert.Equal(t, 1, meadows.MinLevel)
	assert.Equal(t, 4, meadows.MaxLevel)
	assert.Equal(t, 0.75, meadows.StatFactor)
	assert.Equal(t, 0.35, meadows.DropFactor)
}

// The entrance is on the west edge, the road back to the hub's east gate, and a
// player arrives just inside it, beyond its range so arriving never sends them
// straight back out. R51.
func TestGentleMeadows_EntranceOnTheWestEdge(t *testing.T) {
	meadows := GentleMeadows()

	assert.Less(t, meadows.Entrance.X, meadows.Width*0.05, "the entrance is on the west edge")
	assert.Equal(t, constants.FieldEntranceRange, meadows.EntranceRange)

	away := math.Hypot(meadows.Arrival.X-meadows.Entrance.X, meadows.Arrival.Y-meadows.Entrance.Y)
	assert.Greater(t, away, meadows.EntranceRange, "arriving is not standing at the entrance")
	assert.Less(t, away, 2*meadows.EntranceRange, "but just inside it")
	assert.False(t, insideObstacle(meadowsLayoutOf(t), meadows.Arrival.X, meadows.Arrival.Y), "nobody arrives inside a tree")
}

// Open ground: a few tree clusters and rocks, 10–12 spawn points spread across
// it, none near the entrance, none inside a keep-out area. R52.
func TestGentleMeadows_LayoutIsOpenGroundWithQuietEntrance(t *testing.T) {
	meadows := GentleMeadows()
	layout := meadowsLayoutOf(t)

	assert.GreaterOrEqual(t, len(layout.Obstacles), 3, "a few tree clusters and rocks")
	assert.LessOrEqual(t, len(layout.Obstacles), 10, "a few, not a maze")
	for _, o := range layout.Obstacles {
		assert.True(t, o.X >= 0 && o.Y >= 0 && o.X+o.W <= meadows.Width && o.Y+o.H <= meadows.Height,
			"obstacle %+v inside the map", o)
	}

	assert.GreaterOrEqual(t, len(layout.SpawnPoints), 10)
	assert.LessOrEqual(t, len(layout.SpawnPoints), 12)
	for _, p := range layout.SpawnPoints {
		assert.GreaterOrEqual(t, math.Hypot(p.X-meadows.Entrance.X, p.Y-meadows.Entrance.Y), 400.0,
			"spawn point %+v keeps 400 px from the entrance", p)
		assert.True(t, p.X > 0 && p.Y > 0 && p.X < meadows.Width && p.Y < meadows.Height,
			"spawn point %+v inside the map", p)
		assert.False(t, insideObstacle(layout, p.X, p.Y), "spawn point %+v clear of every obstacle", p)
	}
}

// Fixed, not generated: every channel on every pod lays the Meadows out the
// same, and a caller cannot change the map data through what it was handed.
// R51 (D19).
func TestGentleMeadows_LayoutIsFixed(t *testing.T) {
	first := meadowsLayoutOf(t)
	first.Obstacles[0].X = -1
	first.SpawnPoints[0].X = -1

	again := meadowsLayoutOf(t)
	assert.NotEqual(t, -1.0, again.Obstacles[0].X, "the map data is not shared with a caller")
	assert.NotEqual(t, -1.0, again.SpawnPoints[0].X)
}
