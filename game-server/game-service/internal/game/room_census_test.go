package game

import (
	"fmt"
	"os"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* TestRoomCensus is a record, not a gate (FS-KE075 §Change: Room variety,
* Acceptance "before/after counts"): it builds ROOM_CENSUS floors 1 and 2 and
* prints rooms a floor, monsters a floor and the rooms by what stands in them,
* read from the world, never from the build's plan, so the same file counts
* a build from before the change. Run with ROOM_CENSUS=200.
**/
func TestRoomCensus(t *testing.T) {
	n := 0
	if _, err := fmt.Sscan(os.Getenv("ROOM_CENSUS"), &n); err != nil || n <= 0 {
		t.Skip("set ROOM_CENSUS=<seeds> to take the census")
	}
	type tally struct {
		floors, rooms, monsters, containers, traps   int
		kinds                                        map[string]int
		minRooms, maxRooms, minMonsters, maxMonsters int
	}
	tallies := map[int]*tally{}
	for seed := uint64(1); seed <= uint64(n); seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		for depth := 1; depth <= 2; depth++ {
			if depth == 2 {
				s.regenerateFloor()
			}
			d := s.dungeon
			if d == nil {
				continue
			}
			tl := tallies[depth]
			if tl == nil {
				tl = &tally{kinds: map[string]int{}, minRooms: 1 << 30, minMonsters: 1 << 30}
				tallies[depth] = tl
			}
			kinds, monsters, containers, traps := censusOf(s, d)
			tl.floors++
			tl.rooms += len(d.layout.Rooms)
			tl.monsters += monsters
			tl.containers += containers
			tl.traps += traps
			tl.minRooms, tl.maxRooms = min(tl.minRooms, len(d.layout.Rooms)), max(tl.maxRooms, len(d.layout.Rooms))
			tl.minMonsters, tl.maxMonsters = min(tl.minMonsters, monsters), max(tl.maxMonsters, monsters)
			for _, k := range kinds {
				tl.kinds[k]++
			}
		}
	}
	for depth := 1; depth <= 2; depth++ {
		tl := tallies[depth]
		if tl == nil {
			continue
		}
		f := float64(tl.floors)
		var b strings.Builder
		fmt.Fprintf(&b, "floor %d, %d floors: rooms %.1f (%d..%d), monsters %.1f (%d..%d), containers %.1f, traps %.1f\n",
			depth, tl.floors, float64(tl.rooms)/f, tl.minRooms, tl.maxRooms,
			float64(tl.monsters)/f, tl.minMonsters, tl.maxMonsters, float64(tl.containers)/f, float64(tl.traps)/f)
		var keys []string
		for k := range tl.kinds {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			fmt.Fprintf(&b, "  %-22s %5.1f a floor  %4.1f%%\n", k, float64(tl.kinds[k])/f, 100*float64(tl.kinds[k])/float64(tl.rooms))
		}
		t.Log("\n" + b.String())
	}
}

// censusOf names every room of d by its role or by what stands in it, and
// counts the floor's monsters (a demon and dormant ambushers included), its
// containers and its traps.
func censusOf(s *Session, d *dungeonFloor) (kinds []string, monsters, containers, traps int) {
	roles := d.layout.Roles
	role := map[int]string{roles.Start: "role: start", roles.Stairs: "role: stairs"}
	if roles.HasEscapeDoor() {
		role[roles.Switch], role[roles.EscapeDoor] = "role: switch", "role: escape door"
	}
	for _, r := range roles.Treasure {
		role[r] = "role: treasure"
	}
	for _, h := range d.layout.Hidden {
		role[h.Room] = "role: hidden"
	}
	for _, r := range d.respites {
		role[r.room] = "role: respite"
	}
	monstersIn, decisionIn := map[int]int{}, map[int]bool{}
	for _, e := range s.EntityManager.GetAllEntities() {
		tc, ok := e.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		at := tc.(*components.TransformComponent)
		room := d.roomAt(at.X, at.Y)
		_, isMonster := e.GetComponent(ecs.ComponentTypeEnemy)
		_, isContainer := e.GetComponent(ecs.ComponentTypeContainer)
		_, isTrap := e.GetComponent(ecs.ComponentTypeTrap)
		_, isPiece := e.GetComponent(ecs.ComponentTypeSealPiece)
		_, isNPC := e.GetComponent(ecs.ComponentTypeEncounterNPC)
		switch {
		case isMonster:
			monsters++
			monstersIn[room]++
		case isContainer:
			containers++
			decisionIn[room] = true
		case isTrap:
			traps++
			decisionIn[room] = true
		case isPiece, isNPC:
			decisionIn[room] = true
		}
	}
	for room := range d.layout.Rooms {
		switch {
		case role[room] != "":
			kinds = append(kinds, role[room])
		case decisionIn[room] && monstersIn[room] > 0:
			kinds = append(kinds, "decision and monsters")
		case decisionIn[room]:
			kinds = append(kinds, "decision")
		case monstersIn[room] > 0:
			kinds = append(kinds, "monsters")
		default:
			kinds = append(kinds, "quiet")
		}
	}
	slices.Sort(kinds)
	return kinds, monsters, containers, traps
}
