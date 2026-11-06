package game

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// snapshotBytes is the mean JSON size of one tick's snapshot over recipients,
// encoded as the writer encodes it, and how many monsters the largest held.
func snapshotBytes(tb testing.TB, s *Session, recipients []uuid.UUID) (mean float64, monsters int) {
	tb.Helper()
	st := serializer.NewStateSerializer(s.EntityManager, nil)
	backend, err := st.SerializeBackendState(context.Background(), s.ID, types.WorldTypeRun, s.EntityManager.GetAllEntities())
	if err != nil {
		tb.Fatal(err)
	}
	defer st.PutBackendState(backend)

	total := 0
	for _, id := range recipients {
		state := st.FormatStateToClientState(backend, id)
		raw, err := json.Marshal(state)
		if err != nil {
			tb.Fatal(err)
		}
		total += len(raw)
		monsters = max(monsters, len(state.Monsters))
	}
	return float64(total) / float64(len(recipients)), monsters
}

// crowdedRoomCentre is the room centre with the most monsters and containers
// within the interest radius (1600 px): where a party is sent the most.
func crowdedRoomCentre(tb testing.TB, s *Session) point {
	tb.Helper()
	var bodies []point
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeEnemy) || e.HasComponent(ecs.ComponentTypeContainer) {
			tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
			at := tc.(*components.TransformComponent)
			bodies = append(bodies, point{at.X, at.Y})
		}
	}
	best, most := point{}, -1
	for room := range s.dungeon.layout.Rooms {
		c := s.dungeon.roomCentre(room)
		n := 0
		for _, b := range bodies {
			if math.Hypot(b.x-c.x, b.y-c.y) <= 1600 {
				n++
			}
		}
		if n > most {
			best, most = c, n
		}
	}
	return best
}

// standPartyAt moves every delver to at, 40 px apart in a row.
func standPartyAt(tb testing.TB, s *Session, ids []uuid.UUID, at point) {
	tb.Helper()
	for i, id := range ids {
		tc, _ := delverEntityTB(tb, s, id).GetComponent(ecs.ComponentTypeTransform)
		tr := tc.(*components.TransformComponent)
		tr.X, tr.Y = at.x+float64(i*40), at.y
	}
}

func delverEntityTB(tb testing.TB, s *Session, id uuid.UUID) *ecs.Entity {
	tb.Helper()
	entity, ok := s.EntityManager.GetEntity(s.playerIDToEntitiesID[id])
	if !ok {
		tb.Fatalf("delver %s not in the world", id)
	}
	return entity
}

// What one recipient is sent per tick on a generated floor 1 with its real
// population (FS-KE075 §C), the interest cut on: the party where it spawns, in
// the start room, and in the room centre with the most monsters and
// containers within 1600 px (the worst case), over 50 floors. Each delver
// carries the kit BenchmarkFormatStateToClientState_BytesPerRecipient prices:
// a bag of eight items and five worn. FS-KE075 AC: floor 1 at most 16 KB.
func BenchmarkFloor1Snapshot_BytesPerRecipient(b *testing.B) {
	const floors = 50
	var startSum, worstSum, startMax, worstMax float64
	var worstMonsters, over int
	var worst *Session
	var worstIDs []uuid.UUID

	for seed := uint64(1); seed <= floors; seed++ {
		s, ids := dungeonRunTB(b, seed)
		start, _ := snapshotBytes(b, s, ids)
		standPartyAt(b, s, ids, crowdedRoomCentre(b, s))
		crowded, monsters := snapshotBytes(b, s, ids)

		startSum, worstSum = startSum+start, worstSum+crowded
		startMax = math.Max(startMax, start)
		if crowded > worstMax {
			worstMax, worst, worstIDs = crowded, s, ids
		}
		worstMonsters = max(worstMonsters, monsters)
		if crowded > 16*1024 {
			over++
		}
	}

	b.ResetTimer()
	for range b.N {
		snapshotBytes(b, worst, worstIDs)
	}
	b.ReportMetric(startSum/floors, "B_start_mean/recipient/tick")
	b.ReportMetric(startMax, "B_start_max/recipient/tick")
	b.ReportMetric(worstSum/floors, "B_crowded_mean/recipient/tick")
	b.ReportMetric(worstMax, "B_crowded_max/recipient/tick")
	b.ReportMetric(float64(worstMonsters), "monsters_sent_max")
	b.ReportMetric(float64(over), "floors_crowded_over_16KiB")
}

// dungeonRunTB is dungeonRun for a benchmark: four seated delvers on floor 1.
func dungeonRunTB(tb testing.TB, seed uint64) (*Session, []uuid.UUID) {
	tb.Helper()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = seededSpawns(seed)
	s.InitialSystems()
	ids := make([]uuid.UUID, 4)
	for i := range ids {
		ids[i] = uuid.New()
		s.AddPlayer(ids[i], types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
		kitDelver(s.EntityManager, delverEntityTB(tb, s, ids[i]))
	}
	s.InitialMapObjects(nil)
	if s.dungeon == nil {
		tb.Fatalf("seed %d: floor 1 is not a dungeon floor", seed)
	}
	return s, ids
}

// kitDelver gives a delver a bag of eight items and five worn, as the
// serializer's bytes bench does, so the two figures compare.
func kitDelver(em *ecs.EntityManager, delver *ecs.Entity) {
	item := func(i int) uuid.UUID {
		e := em.CreateEntity()
		e.AddComponent(&components.ItemComponent{
			TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: fmt.Sprintf("Notched Blade %d", i),
			AttackPower: 12, CriticalRate: 0.1, WeaponType: "melee", Description: "An old blade.", RequiredLevel: 3,
		})
		return e.ID
	}
	bag := make([]uuid.UUID, 0, 8)
	for j := range 8 {
		bag = append(bag, item(j))
	}
	delver.AddComponent(components.NewItemIDListComponent(bag))
	weapon, head, chest, legs, gloves := item(0), item(1), item(2), item(3), item(4)
	delver.AddComponent(&components.EquipmentComponent{
		WeaponSlot: &weapon, HeadSlot: &head, ChestSlot: &chest, LegsSlot: &legs, GlovesSlot: &gloves,
	})
}
