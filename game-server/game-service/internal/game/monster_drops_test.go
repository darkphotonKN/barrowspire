package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// dropSession is a world with a tier I pool of every type and all five
// rarities, enough for any monster drop to roll.
func dropSession() *Session {
	return &Session{
		EntityManager: ecs.NewEntityManager(),
		itemPool: lootPool{
			Weapons:     []lootTemplate{longsword},
			Armor:       []lootTemplate{plateHelm},
			Rings:       []lootTemplate{ironBand},
			Consumables: []lootTemplate{lesserHeal},
		},
		lootRarities: testRarities,
	}
}

func demonRecord(level int) systems.KillRecord {
	return systems.KillRecord{
		MonsterEntityID: uuid.New(), Archetype: components.MonsterArchetypeDemon,
		Level: level, Boss: true, KillerMemberID: uuid.New(), X: 640, Y: 360, Floor: 3,
	}
}

// dropPiles is every drop pile in the world.
func dropPiles(s *Session) []*ecs.Entity {
	var piles []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		cc, ok := e.GetComponent(ecs.ComponentTypeContainer)
		if ok && cc.(*components.ContainerComponent).Kind == components.ContainerKindDropPile {
			piles = append(piles, e)
		}
	}
	return piles
}

func pileItemIDs(t *testing.T, pile *ecs.Entity) []uuid.UUID {
	t.Helper()
	lc, ok := pile.GetComponent(ecs.ComponentTypeItemIDList)
	require.True(t, ok)
	return lc.(*components.ItemIDListComponent).ItemIDs
}

// The demon always drops 2 or 3 items, none of them Normal and none a
// consumable, each at its level, in one pile where it fell.
// FS-4R9M9 §Requirements 10, 21, 44, 46.
func TestMonsterDrops_Demon_DropsTwoOrThreeNonNormalItemsInAPile(t *testing.T) {
	r := seeded()
	counts := map[int]bool{}
	for range 200 {
		s := dropSession()
		newMonsterDrops(s, r).ConsumeKill(demonRecord(9))

		piles := dropPiles(s)
		require.Len(t, piles, 1)
		ids := pileItemIDs(t, piles[0])
		counts[len(ids)] = true
		require.Contains(t, []int{2, 3}, len(ids))

		for _, item := range itemsByID(s, ids) {
			assert.NotEqual(t, rarityNormal, item.RarityCode, item.Name)
			assert.NotEmpty(t, item.RarityCode, item.Name)
			assert.NotEqual(t, types.ItemTypeConsumable, item.ItemType, "the demon drops no consumables")
			assert.Equal(t, 9, item.ItemLevel)
		}
	}
	assert.Equal(t, map[int]bool{2: true, 3: true}, counts, "both counts occur")
}

// fixedRand rolls the same Float64 every time and 0 for every IntN.
type fixedRand struct{ f float64 }

func (r fixedRand) Float64() float64 { return r.f }
func (r fixedRand) IntN(int) int     { return 0 }

// Each kill rolls its row's chance once: ghoul 8%, troll 15%, any elite 50%,
// the demon always. FS-4R9M9 §Requirements 44.
func TestMonsterDrops_DropChance_PerArchetypeEliteAndDemon(t *testing.T) {
	ghoul, troll := components.MonsterArchetypeGhoul, components.MonsterArchetypeTroll
	tests := []struct {
		name   string
		record systems.KillRecord
		roll   float64
		drops  bool
	}{
		{"ghoul under 8%", systems.KillRecord{Archetype: ghoul}, 0.0799, true},
		{"ghoul at 8%", systems.KillRecord{Archetype: ghoul}, 0.08, false},
		{"troll under 15%", systems.KillRecord{Archetype: troll}, 0.1499, true},
		{"troll at 15%", systems.KillRecord{Archetype: troll}, 0.15, false},
		{"elite ghoul under 50%", systems.KillRecord{Archetype: ghoul, Elite: true}, 0.4999, true},
		{"elite troll at 50%", systems.KillRecord{Archetype: troll, Elite: true}, 0.50, false},
		{"demon on the highest roll", systems.KillRecord{Archetype: components.MonsterArchetypeDemon, Boss: true}, 0.9999, true},
		{"an archetype without a row drops nothing", systems.KillRecord{Archetype: "wisp"}, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := dropSession()
			tt.record.Level = 1

			newMonsterDrops(s, fixedRand{tt.roll}).ConsumeKill(tt.record)

			if tt.drops {
				assert.Len(t, dropPiles(s), 1)
			} else {
				assert.Empty(t, dropPiles(s), "no drop, no pile")
			}
		})
	}
}

// Over many seeded kills the drop rates land on the table, and only the
// demon drops more than one item. FS-4R9M9 §Requirements 44.
func TestMonsterDrops_SeededRates_MatchTheTable(t *testing.T) {
	tests := []struct {
		name   string
		record systems.KillRecord
		rate   float64
	}{
		{"ghoul", systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: 1}, 0.08},
		{"troll", systems.KillRecord{Archetype: components.MonsterArchetypeTroll, Level: 1}, 0.15},
		{"elite", systems.KillRecord{Archetype: components.MonsterArchetypeTroll, Level: 1, Elite: true}, 0.50},
	}
	const kills = 4000
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := dropSession()
			drops := newMonsterDrops(s, seeded())
			for range kills {
				drops.ConsumeKill(tt.record)
			}

			piles := dropPiles(s)
			assert.InDelta(t, tt.rate, float64(len(piles))/kills, 0.02)
			for _, pile := range piles {
				assert.Len(t, pileItemIDs(t, pile), 1)
			}
		})
	}
}

// Monster drops split by type 30 / 40 / 10 / 20, so rings drop from
// monsters; the demon's 35 / 45 / 20 never drops a consumable.
// FS-4R9M9 §Requirements 44.
func TestMonsterDrops_TypeSplit(t *testing.T) {
	tests := []struct {
		name   string
		record systems.KillRecord
		want   map[types.ItemType]float64
	}{
		{"standard", systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: 1, Elite: true},
			map[types.ItemType]float64{types.ItemTypeWeapon: 0.30, types.ItemTypeArmor: 0.40, types.ItemTypeRing: 0.10, types.ItemTypeConsumable: 0.20}},
		{"demon", demonRecord(1),
			map[types.ItemType]float64{types.ItemTypeWeapon: 0.35, types.ItemTypeArmor: 0.45, types.ItemTypeRing: 0.20}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := dropSession()
			drops := newMonsterDrops(s, seeded())
			for range 4000 {
				drops.ConsumeKill(tt.record)
			}

			got := map[types.ItemType]float64{}
			total := 0.0
			for _, pile := range dropPiles(s) {
				for _, item := range itemsByID(s, pileItemIDs(t, pile)) {
					got[item.ItemType]++
					total++
				}
			}
			require.Positive(t, total)
			assert.Len(t, got, len(tt.want))
			for itemType, share := range tt.want {
				assert.InDelta(t, share, got[itemType]/total, 0.03, string(itemType))
			}
		})
	}
}

// A kill that drops lays one pile at the kill position: already open, never
// to roll items of its own, holding items at the monster's level.
// FS-4R9M9 §Requirements 10, 46.
func TestMonsterDrops_Drop_PlacesAnOpenPileAtTheKillPosition(t *testing.T) {
	s := dropSession()
	record := systems.KillRecord{Archetype: components.MonsterArchetypeTroll, Level: 4, X: 321, Y: 654}

	newMonsterDrops(s, fixedRand{0}).ConsumeKill(record)

	piles := dropPiles(s)
	require.Len(t, piles, 1)
	tc, _ := piles[0].GetComponent(ecs.ComponentTypeTransform)
	assert.Equal(t, 321.0, tc.(*components.TransformComponent).X)
	assert.Equal(t, 654.0, tc.(*components.TransformComponent).Y)
	oc, ok := piles[0].GetComponent(ecs.ComponentTypeOpenable)
	require.True(t, ok)
	assert.True(t, oc.(*components.OpenableComponent).IsOpen)
	assert.True(t, oc.(*components.OpenableComponent).HasBeenOpened, "a pile never rolls items of its own")

	items := itemsByID(s, pileItemIDs(t, piles[0]))
	require.Len(t, items, 1)
	assert.Equal(t, 4, items[0].ItemLevel)
}

// A drop whose rolled types have nothing eligible leaves no pile.
func TestMonsterDrops_NothingEligible_LeavesNoPile(t *testing.T) {
	s := dropSession()
	s.itemPool = lootPool{}

	newMonsterDrops(s, fixedRand{0}).ConsumeKill(demonRecord(5))

	assert.Empty(t, dropPiles(s))
}

// lootedRun is an unstarted run with a tier I pool of every type to drop from.
func lootedRun(t *testing.T) *Session {
	t.Helper()
	s := coopRun(t)
	pool := dropSession()
	s.itemPool, s.lootRarities = pool.itemPool, pool.lootRarities
	return s
}

// frailDemon is the boss one hit from death, rooted at (x, y).
func frailDemon(s *Session, x, y float64, level int) *ecs.Entity {
	d := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeDemon, Boss: true, Level: level, X: x, Y: y})
	hc, _ := d.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 1
	d.RemoveComponent(ecs.ComponentTypeVelocity)
	return d
}

// Every run subscribes the drop consumer exactly once.
// FS-4R9M9 §Requirements 45.
func TestNewSession_SubscribesMonsterDropsOnce(t *testing.T) {
	s := unstartedRun(t)

	subscribed := 0
	for _, consumer := range s.killConsumers {
		if _, ok := consumer.(*monsterDrops); ok {
			subscribed++
		}
	}
	assert.Equal(t, 1, subscribed)
}

// The demon slain on a run's tick drops its pile under its corpse on that same
// tick, at its level; a delver then takes an item out of the pile like out of
// an opened chest, with other containers about. FS-4R9M9 §Requirements 45–46;
// §Acceptance Criteria "Drops" row 2.
func TestRun_SlainDemon_DropsAPileADelverTakesFrom(t *testing.T) {
	s := lootedRun(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	demon := frailDemon(s, 545, 500, 7)
	for range 3 {
		s.AddContainer(900, 900) // chests about, so the pickup must find the pile
	}

	require.NoError(t, s.handleAttack(playerID, demon.ID))
	tick(s)

	piles := dropPiles(s)
	require.Len(t, piles, 1)
	tc, _ := piles[0].GetComponent(ecs.ComponentTypeTransform)
	assert.Equal(t, 545.0, tc.(*components.TransformComponent).X)
	assert.Equal(t, 500.0, tc.(*components.TransformComponent).Y)
	ids := pileItemIDs(t, piles[0])
	require.GreaterOrEqual(t, len(ids), 2)
	for _, item := range itemsByID(s, ids) {
		assert.Equal(t, 7, item.ItemLevel)
	}

	taken := ids[0]
	require.NoError(t, s.handleInteract(playerID, taken))

	ic, _ := delver.GetComponent(ecs.ComponentTypeItemIDList)
	assert.Contains(t, ic.(*components.ItemIDListComponent).ItemIDs, taken)
	assert.NotContains(t, pileItemIDs(t, piles[0]), taken, "the item left the pile")
	assert.Len(t, pileItemIDs(t, piles[0]), len(ids)-1)
}

// A floor change clears a drop pile and everything still in it, by the floor
// entity exclusion rule; what a delver took from it climbs with them.
// FS-4R9M9 §Requirements 46; FS-F6F88.
func TestRegenerateFloor_ClearsDropPilesAndTheirItems(t *testing.T) {
	s := newRun(t, &countingItemsClient{})
	playerID := uuid.New()
	delver, _ := s.EntityManager.GetEntity(s.AddPlayer(playerID, types.CharacterInPlay{Name: "Wren", Class: "warrior"}))
	tc, _ := delver.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y = 640, 360 // beside the pile

	s.publishKills([]systems.KillRecord{demonRecord(3)})
	piles := dropPiles(s)
	require.Len(t, piles, 1)
	ids := pileItemIDs(t, piles[0])
	require.NotEmpty(t, ids)
	carried := ids[0]
	require.NoError(t, s.handleInteract(playerID, carried))

	require.NoError(t, s.regenerateFloor())

	assert.Empty(t, dropPiles(s))
	_, stands := s.EntityManager.GetEntity(piles[0].ID)
	assert.False(t, stands)
	for _, id := range ids[1:] {
		_, stands := s.EntityManager.GetEntity(id)
		assert.False(t, stands, "an item left in the pile is cleared with it")
	}
	_, kept := s.EntityManager.GetEntity(carried)
	assert.True(t, kept, "an item a delver carries climbs with them")
}
