package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// runHouseDoor is the one door on the floor, as an area, with its entity.
func runHouseDoor(t *testing.T, s *Session) (PlaceArea, *ecs.Entity) {
	t.Helper()

	ids := entityIDsWith(s, ecs.ComponentTypeDoor)
	require.Len(t, ids, 1, "a run house hangs one door")
	entity, ok := s.EntityManager.GetEntity(ids[0])
	require.True(t, ok)

	at := transformOf(t, entity)
	dc, _ := entity.GetComponent(ecs.ComponentTypeDoor)
	door := dc.(*components.DoorComponent)
	return PlaceArea{X: at.X, Y: at.Y, W: door.Width, H: door.Height}, entity
}

// A run house of each size hangs a door two bodies wide, as thick as its
// wall, centred in the south wall: the two south segments are equal and meet
// the door's jambs. FS-MMA2H §A R1, R3, R4, §B R7.
func TestCreateBuilding_EachSize_HangsACentred80pxDoorInTheSouthWall(t *testing.T) {
	tests := []struct {
		name       string
		house      Building
		sideOfDoor float64
	}{
		{"small", Building{W: 300, H: 200}, 110},
		{"medium", Building{W: 400, H: 300}, 160},
		{"large", Building{W: 500, H: 400}, 210},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := equipRun(t, nil)

			s.CreateBuilding(tt.house)

			door, _ := runHouseDoor(t, s)
			assert.Equal(t, 80.0, door.W, "the door's width")
			assert.Equal(t, 20.0, door.H, "the door is as thick as the wall")

			// the south wall is the two segments on the door's own line
			var south []PlaceArea
			west, east := door.X, door.X+door.W
			for _, id := range entityIDsWith(s, ecs.ComponentTypeWall) {
				entity, _ := s.EntityManager.GetEntity(id)
				at := transformOf(t, entity)
				wc, _ := entity.GetComponent(ecs.ComponentTypeWall)
				wall := wc.(*components.WallComponent)
				if at.Y == door.Y && wall.Height == door.H {
					south = append(south, PlaceArea{X: at.X, Y: at.Y, W: wall.Width, H: wall.Height})
				}
				west, east = min(west, at.X), max(east, at.X+wall.Width)
			}
			assert.InDelta(t, tt.house.W, east-west, 1e-6, "the house keeps its width")
			assert.ElementsMatch(t, []PlaceArea{
				{X: west, Y: door.Y, W: tt.sideOfDoor, H: 20},
				{X: door.X + door.W, Y: door.Y, W: tt.sideOfDoor, H: 20},
			}, south, "equal segments either side, meeting the door")
			assert.Equal(t, west+tt.sideOfDoor, door.X, "the west segment ends at the door's jamb")
		})
	}
}

// A delver standing in front of a run house's door at either jamb, 40 px from
// its middle, opens it: range is measured to the middle of the doorway.
// FS-MMA2H §A R4, user story 6.
func TestHandleInteract_RunHouseDoor_OpensFromEitherJamb(t *testing.T) {
	tests := []struct {
		name       string
		fromMiddle float64
	}{
		{"the west jamb", -40},
		{"the east jamb", 40},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			s.CreateBuilding(Building{W: 300, H: 200})
			door, entity := runHouseDoor(t, s)

			// in front of the door: a body's radius south of the wall's face
			x := door.X + door.W/2 + tt.fromMiddle
			y := door.Y + door.H + constants.PlayerRadius
			playerID, _ := placeDelver(t, s, "warrior", x, y)

			require.NoError(t, s.handleInteract(playerID, entity.ID))

			oc, _ := entity.GetComponent(ecs.ComponentTypeOpenable)
			assert.True(t, oc.(*components.OpenableComponent).IsOpen, "the door opened")
		})
	}
}

// On a floor of buildings, what a failed generation leaves, every run house's
// door is the wide one and no monster stands on a door or in a building: the
// keep-out reads each door's own size. FS-MMA2H §A R6, user story 9.
func TestFloorOfBuildings_NoMonsterOverlapsADoorOrABuilding(t *testing.T) {
	r := constants.PlayerRadius

	for seed := uint64(1); seed <= 20; seed++ {
		s := rosterOnRun(t, seed, delverAt{level: 1, x: 100, y: 100}, delverAt{level: 1, x: 1300, y: 860})
		failGeneration(s)
		s.InitialMapObjects(nil)
		require.Nil(t, s.dungeon, "seed %d: a floor of buildings", seed)

		entities := s.EntityManager.GetAllEntities()
		doors := 0
		for _, entity := range entities {
			dc, isDoor := entity.GetComponent(ecs.ComponentTypeDoor)
			if !isDoor {
				continue
			}
			doors++
			assert.Equal(t, 80.0, dc.(*components.DoorComponent).Width, "seed %d: a run house's door", seed)
		}
		require.NotZero(t, doors, "seed %d: the floor has its houses", seed)

		monsters := monstersIn(s)
		require.NotEmpty(t, monsters, "seed %d", seed)
		for _, m := range monsters {
			at := transformOf(t, m)
			for _, area := range mapKeepOut(entities) {
				assert.False(t, area.overlapsBody(at.X, at.Y, r),
					"seed %d: monster at (%.0f, %.0f) overlaps %+v", seed, at.X, at.Y, area)
			}
		}
	}
}
