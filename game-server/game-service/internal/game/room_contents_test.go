package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// contentFloors builds floor 1 and floor 2 of n seeded runs and calls f with
// each dungeon floor.
func contentFloors(t *testing.T, n int, f func(seed uint64, s *Session, d *dungeonFloor)) {
	t.Helper()
	for seed := uint64(1); seed <= uint64(n); seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		for depth := 1; depth <= 2; depth++ {
			if depth == 2 {
				require.NoError(t, s.regenerateFloor())
			}
			if s.dungeon != nil {
				f(seed, s, s.dungeon)
			}
		}
	}
}

// FS-KE075 §Change: Room variety R77: role rooms and claimed rooms roll
// nothing; every other room rolls quiet, monsters, a trap or a chest or sack,
// near 30 / 40 / 30 and the decisions near 40 / 60.
func TestRoomContents_RolesClaimsAndTheRoll(t *testing.T) {
	counts := map[roomContent]int{}
	contentFloors(t, 120, func(seed uint64, s *Session, d *dungeonFloor) {
		roles := d.layout.Roles
		require.Len(t, d.contents, len(d.layout.Rooms), "seed %d: every room is given its contents", seed)
		for room := range d.layout.Rooms {
			c := d.content(room)
			counts[c]++
			isRole := room == roles.Start || room == roles.Stairs || slices.Contains(roles.Treasure, room) ||
				d.isRespite(room) || slices.ContainsFunc(d.layout.Hidden, func(h levelgen.BarredRoom) bool { return h.Room == room }) ||
				(roles.HasEscapeDoor() && (room == roles.Switch || room == roles.EscapeDoor))
			if isRole {
				assert.Equal(t, contentRole, c, "seed %d room %d: a role room", seed, room)
				continue
			}
			if d.encounter != nil && d.encounter.room == room {
				assert.Equal(t, contentClaimed, c, "seed %d room %d: the encounter's", seed, room)
			}
		}
	})
	ordinary := counts[contentQuiet] + counts[contentMonsters] + counts[contentTrap] + counts[contentContainer]
	require.Positive(t, ordinary)
	share := func(c roomContent) float64 { return float64(counts[c]) / float64(ordinary) }
	assert.InDelta(t, RoomQuietShare, share(contentQuiet), 0.04, "quiet")
	assert.InDelta(t, RoomMonstersShare, share(contentMonsters), 0.04, "monsters")
	decisions := float64(counts[contentTrap] + counts[contentContainer])
	assert.InDelta(t, DecisionTrapShare, float64(counts[contentTrap])/decisions, 0.06, "a trap among the decisions")
	assert.Positive(t, counts[contentClaimed], "seals and encounters claim rooms")
}

// R78-R81: at the build, no rolled monster stands in a room that did not roll
// monsters but a treasure room's guards; a monsters room holds 1-2, a hall 1-2;
// a container stands only in a treasure or chest-or-sack room, one each; a trap
// lies only in a trap room or a corridor, and a trap room holds one when the
// count allows.
func TestRoomContents_ThePopulationContainersAndTrapsReadIt(t *testing.T) {
	contentFloors(t, 60, func(seed uint64, s *Session, d *dungeonFloor) {
		roles := d.layout.Roles
		monsters, containers, traps := map[int]int{}, map[int]int{}, map[int]int{}
		corridorTraps := 0
		for _, e := range s.EntityManager.GetAllEntities() {
			tc, ok := e.GetComponent(ecs.ComponentTypeTransform)
			if !ok {
				continue
			}
			at := tc.(*components.TransformComponent)
			room := d.roomAt(at.X, at.Y)
			switch {
			case e.HasComponent(ecs.ComponentTypeEnemy) && !e.HasComponent(ecs.ComponentTypeAmbush) && !monsterOf(e).Boss && !monsterOf(e).Champion:
				monsters[room]++
			case e.HasComponent(ecs.ComponentTypeContainer):
				containers[room]++
			case e.HasComponent(ecs.ComponentTypeTrap):
				if room < 0 {
					corridorTraps++
				} else {
					traps[room]++
				}
			}
		}
		trapRooms := 0
		var bare []int
		for room := range d.layout.Rooms {
			c := d.content(room)
			switch {
			case slices.Contains(roles.Treasure, room):
				assert.LessOrEqual(t, containers[room], 1, "seed %d room %d: a treasure room's chest", seed, room)
			case c == contentRole:
				// what its role puts there, a hidden room's chest among it
				assert.Zero(t, monsters[room], "seed %d room %d: a role room holds no rolled monster", seed, room)
			case c == contentMonsters:
				assert.LessOrEqual(t, monsters[room], RoomMonstersTopUpMax, "seed %d room %d: a monsters room", seed, room)
				assert.Zero(t, containers[room], "seed %d room %d", seed, room)
			case c == contentContainer:
				assert.Zero(t, monsters[room], "seed %d room %d: a chest-or-sack room", seed, room)
				assert.LessOrEqual(t, containers[room], 1, "seed %d room %d", seed, room)
			default:
				assert.Zero(t, monsters[room], "seed %d room %d (%d): no rolled monster", seed, room, c)
				assert.Zero(t, containers[room], "seed %d room %d (%d): no container", seed, room, c)
			}
			if c == contentTrap {
				trapRooms++
				if traps[room] == 0 {
					bare = append(bare, room)
				}
			} else {
				assert.Zero(t, traps[room], "seed %d room %d (%d): no trap outside a trap room", seed, room, c)
			}
		}
		// a trap room is left bare only on the walk to the gate, its traps
		// owed to the half off it, or when the count ran out
		walk := d.gateWalkRegions()
		if trapRooms <= trapCount(currentFloor(t, s).Depth) {
			for _, room := range bare {
				assert.True(t, walk[d.roomRegion(room)], "seed %d room %d: a trap room off the walk holds a trap", seed, room)
			}
		}
	})
}

// R84: the floor map names the rolled quiet rooms by region.
func TestRoomContents_TheFloorMapNamesTheQuietRooms(t *testing.T) {
	s, _ := dungeonRun(t, 3, 1, 0)
	require.NotNil(t, s.dungeon)
	msg := s.floorMap.Load()
	require.NotNil(t, msg)
	got, ok := msg.Payload["quiet_rooms"].([]int)
	require.True(t, ok, "quiet_rooms on the floor map")
	assert.Equal(t, s.dungeon.quietRegions(), got)
	for _, region := range got {
		assert.Equal(t, contentQuiet, s.dungeon.content(region-1))
	}
}
