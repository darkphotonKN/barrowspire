package game

import (
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A chest's items roll at the floor's area level, measured when it is opened:
// the highest level among the delvers in play + (floor − 1).
// FS-4R9M9 §Requirements 10, 47.
func TestGenerateItems_ChestOnFloorTwo_RollsAtTheAreaLevel(t *testing.T) {
	tests := []struct {
		name    string
		floor   int
		escaped int // level of an escaped delver, 0 for none
		want    int
	}{
		{"floor 1, level 5 party", 1, 0, 5},
		{"floor 2, level 5 party", 2, 0, 6},
		{"floor 3, level 5 party", 3, 0, 7},
		{"an escaped delver's level does not count", 2, 12, 6},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newRun(t, &countingItemsClient{})
			s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 5}, "")
			s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Kaelen", Class: "mage", Level: 3}, "")
			if tt.escaped > 0 {
				gone := uuid.New()
				s.AddPlayer(gone, types.CharacterInPlay{Name: "Ash", Class: "archer", Level: tt.escaped}, "")
				markEscaped(t, delverEntity(t, s, gone))
			}
			currentFloor(t, s).Depth = tt.floor

			for range 20 {
				ids, err := s.generateItems(components.ContainerKindChest)
				require.NoError(t, err)
				for _, item := range itemsByID(s, ids) {
					assert.Equal(t, tt.want, item.ItemLevel, item.Name)
				}
			}
		})
	}
}

// A drop that hits its Fabled chance drops a unique from the session's unique
// pool, as an item entity carrying its fixed affixes and effect.
// FS-4R9M9 §Requirements 25–28; FS-M8CSE §G R31, R34.
func TestGenerateItemsAt_FabledHit_DropsAUniqueFromTheSessionPool(t *testing.T) {
	catalogue := lootTemplates(true)
	catalogue.Items = append(catalogue.Items, &pb.ItemTemplate{
		Id: uuid.NewString(), ItemName: "Wightfang", Description: "Still hungry.", ItemType: "weapon",
		AttackPower: 4, CriticalRate: 0.18, WeaponType: "knife", RequiredLevel: 5, MinItemLevel: 1,
		Unique: &pb.UniqueItem{
			EffectCode:   types.UniqueEffectKillFrenzy,
			EffectText:   "Each kill grants attack speed.",
			FixedAffixes: []*pb.AffixRange{{Stat: types.AffixAgility, Min: 2, Max: 4}},
		},
	})
	fabledOnly := &pb.ListItemRaritiesResponse{ItemRarities: []*pb.ItemRarity{
		{Id: "r-fabled", RarityCode: rarityFabled, DropRateMultiplier: 1},
	}}
	s := lootSession(t, catalogue, fabledOnly, nil)

	drop := chestDropAt(1)
	drop.FabledChance = 1

	uniques := 0
	for range 50 {
		ids, err := s.generateItemsAt(drop, ChestMinItems, ChestMaxItems)
		require.NoError(t, err)
		for _, item := range itemsByID(s, ids) {
			uniques++
			assert.Equal(t, "Wightfang", item.Name)
			assert.Equal(t, rarityFabled, item.RarityCode)
			assert.Equal(t, types.UniqueEffectKillFrenzy, item.UniqueEffectCode)
			assert.Equal(t, "Each kill grants attack speed.", item.UniqueEffectText)
			assert.Equal(t, 5, item.RequiredLevel)
			assert.Equal(t, 1, item.ItemLevel)
			require.Len(t, item.Affixes, 1)
			assert.Equal(t, types.AffixAgility, item.Affixes[0].Stat)
			assert.Zero(t, item.Affixes[0].Tier)
			assert.GreaterOrEqual(t, item.Affixes[0].Value, 2)
			assert.LessOrEqual(t, item.Affixes[0].Value, 4)
		}
	}
	assert.Positive(t, uniques)
}

// Chests never drop rings, ring uniques included: a chest's Fabled hit leaves
// them out of the pick, and with no other unique eligible it rolls Runed of
// its own type, a would-be consumable included. A monster drop may still be a
// ring unique. FS-4R9M9 §Requirements 26, 47 (OD); FS-M8CSE §G R34.
func TestGenerateItemsAt_FabledHit_NeverDropsARingUnique(t *testing.T) {
	catalogue := lootTemplates(true)
	catalogue.Items = append(catalogue.Items, &pb.ItemTemplate{
		Id: uuid.NewString(), ItemName: "Lantern of the Drowned", Description: "It still glows.", ItemType: "ring",
		RequiredLevel: 1, MinItemLevel: 1,
		Unique: &pb.UniqueItem{
			EffectCode:   types.UniqueEffectPierce,
			EffectText:   "Your projectiles pierce one extra target.",
			FixedAffixes: []*pb.AffixRange{{Stat: types.AffixIntelligence, Min: 2, Max: 4}},
		},
	})
	fabledOrRuned := &pb.ListItemRaritiesResponse{ItemRarities: []*pb.ItemRarity{
		{Id: "r-runed", RarityCode: rarityRuned, DropRateMultiplier: 0.0001},
		{Id: "r-fabled", RarityCode: rarityFabled, DropRateMultiplier: 1},
	}}
	s := lootSession(t, catalogue, fabledOrRuned, nil)
	require.Len(t, s.itemPool.Uniques, 1)

	drop := chestDropAt(1)
	drop.FabledChance = 1
	for range 50 {
		ids, err := s.generateItemsAt(drop, ChestMinItems, ChestMaxItems)
		require.NoError(t, err)
		for _, item := range itemsByID(s, ids) {
			assert.NotEqual(t, types.ItemTypeRing, item.ItemType, item.Name)
			assert.Empty(t, item.UniqueEffectCode, item.Name)
			assert.Equal(t, rarityRuned, item.RarityCode, item.Name)
		}
	}

	monsterUniques := 0
	for range 20 {
		for _, id := range s.dropLoot(types.ItemTypeWeapon, s.itemPool.Weapons, 1, lootDrop{ItemLevel: 1, Source: lootSourceDemon, FabledChance: 1}) {
			if item := itemsByID(s, []uuid.UUID{id})[0]; item.UniqueEffectCode == types.UniqueEffectPierce {
				monsterUniques++
			}
		}
	}
	assert.Positive(t, monsterUniques, "a monster's Fabled roll can be a ring unique")
}

// A chest or sack holds no Fabled chance of its own, and the DB weight no
// longer gives it one: at a weight that would otherwise swamp the table, it
// rolls no unique. FS-M8CSE §G R31, R32.
func TestGenerateItems_ChestsAndSacks_DBFabledWeight_RollsNoFabled(t *testing.T) {
	catalogue := lootTemplates(true)
	catalogue.Items = append(catalogue.Items, &pb.ItemTemplate{
		Id: uuid.NewString(), ItemName: "Wightfang", ItemType: "weapon", AttackPower: 4, RequiredLevel: 1, MinItemLevel: 1,
		Unique: &pb.UniqueItem{EffectCode: types.UniqueEffectKillFrenzy, EffectText: "Each kill grants attack speed."},
	})
	swamped := &pb.ListItemRaritiesResponse{ItemRarities: []*pb.ItemRarity{
		{Id: "r-runed", RarityCode: rarityRuned, DropRateMultiplier: 0.0001},
		{Id: "r-fabled", RarityCode: rarityFabled, DropRateMultiplier: 5000},
	}}

	for _, kind := range []components.ContainerKind{components.ContainerKindChest, components.ContainerKindSack} {
		t.Run(string(kind), func(t *testing.T) {
			s := lootSession(t, catalogue, swamped, nil)
			require.Len(t, s.itemPool.Uniques, 1)

			for range 300 {
				ids, err := s.generateItems(kind)
				require.NoError(t, err)
				for _, item := range itemsByID(s, ids) {
					assert.NotEqual(t, rarityFabled, item.RarityCode, item.Name)
					assert.Empty(t, item.UniqueEffectCode, item.Name)
				}
			}
		})
	}
}

// A guarded treasure-room chest's Fabled chance per item: nothing below floor
// 6, then 0.1% times the floor factor. FS-M8CSE §G R32.
func TestGuardedTreasureFabledChance_ByFloor(t *testing.T) {
	tests := []struct {
		floor int
		want  float64
	}{
		{1, 0},
		{5, 0},
		{6, 0.00105},
		{7, 0.0011},
		{9, 0.0012},
		{10, 0.00125},
	}
	for _, tt := range tests {
		assert.InDelta(t, tt.want, guardedTreasureFabledChance(tt.floor), 1e-12, "floor %d", tt.floor)
	}
}

// fabledChestRun is a run on the floor given, its pool holding a weapon unique
// and a ring unique any item level allows, and a chest at (505, 500).
func fabledChestRun(t *testing.T, floor int) (*Session, *ecs.Entity) {
	t.Helper()
	s := newRun(t, &countingItemsClient{})
	pool := dropSession()
	s.itemPool, s.lootRarities = pool.itemPool, pool.lootRarities
	s.itemPool.Uniques = sixUniques
	s.chestRand = sharedLootRand{}
	currentFloor(t, s).Depth = floor

	chestID := s.AddContainer(505, 500, components.ContainerKindChest)
	chest, ok := s.EntityManager.GetEntity(chestID)
	require.True(t, ok)
	return s, chest
}

// markGuarded makes the chest one waiting on a guard placed at the build, in a
// treasure room or not.
func markGuarded(chest *ecs.Entity, treasureRoom bool) {
	chest.AddComponent(components.NewGuardedComponent([]uuid.UUID{uuid.New()}, treasureRoom))
}

// fabledRolls rolls at least items items through rollChest, as the open calls
// it, and counts the Fabled ones. None is ever a ring. Each roll's items leave
// the world so the area level's walk stays short.
func fabledRolls(t *testing.T, s *Session, kind components.ContainerKind, items int) int {
	t.Helper()
	fabled := 0
	for rolled := 0; rolled < items; {
		ids, err := s.rollChest(kind)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(ids), ChestMinItems, "a chest's count")
		require.LessOrEqual(t, len(ids), ChestMaxItems, "a chest's count")
		for _, item := range itemsByID(s, ids) {
			require.NotEqual(t, types.ItemTypeRing, item.ItemType, item.Name)
			if item.RarityCode == rarityFabled {
				fabled++
			}
		}
		for _, id := range ids {
			s.EntityManager.RemoveEntity(id)
		}
		rolled += len(ids)
	}
	return fabled
}

// Enough items that a 0.1% chance going unseen is far under a one in a billion
// fluke, while a chance of 0 can never hit.
const fabledSampleItems = 30000

// A guarded treasure-room chest on floor 6 up rolls Fabled through the same
// call the open makes, at a chest's item count, and never a ring: on floor 10
// a ring unique is within the item level. FS-M8CSE §G R32, R34, R35.
func TestRollChest_GuardedTreasureChestOnFloorSix_RollsFabled(t *testing.T) {
	for _, floor := range []int{6, 10} {
		s, chest := fabledChestRun(t, floor)
		markGuarded(chest, true)

		assert.Positive(t, fabledRolls(t, s, containerKindOf(chest), fabledSampleItems), "floor %d", floor)
	}
}

// Everything but a guarded treasure-room chest on floor 6 up takes no Fabled
// chance: a chance of 0 cannot hit, so none turns up. FS-M8CSE §G R32, R35.
func TestRollChest_EveryOtherChest_RollsNoFabled(t *testing.T) {
	tests := []struct {
		name  string
		floor int
		mark  func(chest *ecs.Entity)
	}{
		{"a guarded treasure chest on floor 5", 5, func(c *ecs.Entity) { markGuarded(c, true) }},
		{"a guarded treasure chest on floor 1", 1, func(c *ecs.Entity) { markGuarded(c, true) }},
		{"a guarded hall chest on floor 10", 10, func(c *ecs.Entity) { markGuarded(c, false) }},
		{"an ordinary chest on floor 10", 10, func(*ecs.Entity) {}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, chest := fabledChestRun(t, tt.floor)
			tt.mark(chest)

			assert.Zero(t, fabledRolls(t, s, containerKindOf(chest), fabledSampleItems))
		})
	}
}

// A sack rolls no Fabled, on floor 10, marked or not: the mark only ever turns
// a chest. FS-M8CSE §G R32.
func TestRollChest_SackOnFloorTen_RollsNoFabled(t *testing.T) {
	s, _ := fabledChestRun(t, 10)
	s.chestRand = fixedRand{f: SackEmptyChance} // never empty
	sackID := s.AddContainer(505, 500, components.ContainerKindSack)
	sack, _ := s.EntityManager.GetEntity(sackID)
	markGuarded(sack, true)
	require.Equal(t, components.ContainerKindSack, containerKindOf(sack))

	for range fabledSampleItems {
		ids, err := s.rollChest(containerKindOf(sack))
		require.NoError(t, err)
		require.Len(t, ids, 1)
		for _, item := range itemsByID(s, ids) {
			require.NotEqual(t, rarityFabled, item.RarityCode, item.Name)
		}
		s.EntityManager.RemoveEntity(ids[0])
	}
}

// A guarded treasure chest's drop is a chest's in every other way: from a
// standard source, never a ring, at the floor's area level, and its roll is a
// chest's. Below floor 6 its chance is none. FS-M8CSE §G R34, R35.
func TestGuardedTreasureDrop_IsAChestDropWithAChance(t *testing.T) {
	s, _ := fabledChestRun(t, 6)

	drop := s.guardedTreasureDrop()
	assert.InDelta(t, 0.00105, drop.FabledChance, 1e-12)
	assert.True(t, drop.NoRings, "a chest's pick is never a ring")
	drop.FabledChance = 0
	assert.Equal(t, s.chestDrop(), drop)

	assert.Equal(t, containerRollFor(components.ContainerKindChest), containerRollFor(containerKindGuardedTreasure))

	currentFloor(t, s).Depth = 5
	assert.Zero(t, s.guardedTreasureDrop().FabledChance, "floor 5 takes none")
}

// A chest on a floor of buildings, left by a failed generation, is an ordinary
// chest however high the floor. FS-M8CSE §G R35; §Edge States.
func TestRollChest_FallbackFloorChestOnFloorTen_RollsNoFabled(t *testing.T) {
	s := runWithKindRand(t, chestsOnly)
	require.Nil(t, s.dungeon)
	pool := dropSession()
	s.itemPool, s.lootRarities = pool.itemPool, pool.lootRarities
	s.itemPool.Uniques = sixUniques
	s.chestRand = sharedLootRand{}
	currentFloor(t, s).Depth = 10

	found := containers(s)
	require.Len(t, found, 1)

	assert.Zero(t, fabledRolls(t, s, containerKindOf(found[0]), fabledSampleItems))
}

// A field takes no Fabled chance on any chest: the Forest's chests are never
// marked, and even the roll-only kind on a field that somehow held a deep floor
// rolls none. FS-M8CSE §G R33.
func TestRollChest_FieldChests_RollNoFabled(t *testing.T) {
	forest := lootedForest(t, &chestRoll{f: 0})
	forest.itemPool.Uniques = sixUniques
	floor := forest.EntityManager.CreateEntity()
	floor.AddComponent(&components.FloorComponent{Depth: 10})

	chests := containers(forest)
	require.NotEmpty(t, chests)
	for _, chest := range chests {
		assert.Equal(t, kindOf(t, chest), containerKindOf(chest), "a field chest is never marked")
	}

	for range 2000 {
		ids, err := forest.rollChest(containerKindGuardedTreasure)
		require.NoError(t, err)
		for _, item := range itemsByID(forest, ids) {
			require.NotEqual(t, rarityFabled, item.RarityCode, item.Name)
		}
		for _, id := range ids {
			forest.EntityManager.RemoveEntity(id)
		}
	}
}
