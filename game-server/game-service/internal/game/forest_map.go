package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
)

// forestArrivalInset is how far inside the mouth, in px, a player arriving in
// the Forest is set down: beyond the entrance gate's range, on the trail in, as
// the Meadows sets them down just inside its road. FS-3QHQZ §Requirements 14.
const forestArrivalInset = 140

/**
* ForlornForest is the gloomy field west of the hub, built from the layout this
* pod generated for it at boot (FS-3QHQZ §Requirements 9–14). Each pod's Forest
* has its own layout, kept for the pod's life (ADR-0030).
*
* The entrance gate stands at the layout's entrance, inside the mouth on the
* east edge facing the hub; a player arrives, and rises after a fall, a little
* way in along the trail, on open ground beyond the gate's range.
**/
func ForlornForest(generated levelgen.Layout) FieldPlace {
	entrance := FieldPoint{X: generated.Entrance.At.X, Y: generated.Entrance.At.Y}

	return FieldPlace{
		ID:            FieldForlornForest,
		Width:         constants.ForestMapWidth,
		Height:        constants.ForestMapHeight,
		Layout:        forestLayout{generated: generated},
		Entrance:      entrance,
		EntranceRange: constants.FieldEntranceRange,
		Arrival:       inward(entrance, generated.Entrance.Side, forestArrivalInset),
		HubGate:       components.GateDestinationForest,

		// zombies, and now and then a ghost (FS-3QHQZ §Requirements 17)
		Creatures: []FieldCreature{
			{Archetype: components.MonsterArchetypeZombie, Weight: 1 - ForestGhostShare},
			{Archetype: components.MonsterArchetypeGhost, Weight: ForestGhostShare},
		},
		MinLevel:   ForestMinLevel,
		MaxLevel:   ForestMaxLevel,
		StatFactor: FieldStatFactor,
		DropFactor: ForestDropFactor,

		// trail points never hold an elite; the elite clearings always do,
		// named from the barrow prefixes
		RespawnDelay:   FieldRespawnDelay,
		ElitePrefixes:  ElitePrefixes,
		StandardElites: FieldEliteNever,
	}
}

// inward is the point by px from at, away from the map edge on side.
func inward(at FieldPoint, side levelgen.Side, by float64) FieldPoint {
	switch side {
	case levelgen.SideNorth:
		return FieldPoint{X: at.X, Y: at.Y + by}
	case levelgen.SideSouth:
		return FieldPoint{X: at.X, Y: at.Y - by}
	case levelgen.SideWest:
		return FieldPoint{X: at.X + by, Y: at.Y}
	default:
		return FieldPoint{X: at.X - by, Y: at.Y}
	}
}

/**
* forestLayout hands the Forest's generated layout to the field build: every
* wall rect one keep-out area, the standard spawn points on its trails and an
* elite spawn point at each elite clearing's centre (FS-3QHQZ §Requirements
* 15–16). It keeps the whole generated layout, so they are placed from its dead
* ends and open cells without generating again, from a source derived from the
* layout's seed: the same boot seed gives the same forest, monsters included.
**/
type forestLayout struct {
	generated levelgen.Layout
}

func (f forestLayout) Layout() (FieldLayout, error) {
	obstacles := make([]FieldObstacle, 0, len(f.generated.Walls))
	for _, wall := range f.generated.Walls {
		obstacles = append(obstacles, FieldObstacle{X: wall.X, Y: wall.Y, W: wall.W, H: wall.H})
	}

	return FieldLayout{
		Obstacles:        obstacles,
		SpawnPoints:      forestSpawnPoints(f.generated),
		EliteSpawnPoints: assignForestClearings(f.generated).eliteSpawnPoints(),
	}, nil
}
