package game

import (
	"bytes"
	"log/slog"
	"math/rand/v2"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// tieredCatalogue is a catalogue with a tier I and a tier II weapon, a ring
// base and a unique, the shapes FS-4R9M9 §Requirements 1, 5, 6 add.
func tieredCatalogue() *pb.ListItemTemplatesResponse {
	resp := lootTemplates(true)
	resp.Items = append(resp.Items,
		&pb.ItemTemplate{Id: uuid.NewString(), ItemName: "Bastard Sword", Rarity: templateRarity, ItemType: "weapon", AttackPower: 8, CriticalRate: 0.08, WeaponType: "sword", RequiredLevel: 6, MinItemLevel: 8},
		&pb.ItemTemplate{Id: uuid.NewString(), ItemName: "Iron Band", Rarity: templateRarity, ItemType: "ring", RequiredLevel: 1, MinItemLevel: 1},
		&pb.ItemTemplate{
			Id: uuid.NewString(), ItemName: "Gravewarden's Edge", Rarity: "Fabled", ItemType: "weapon",
			AttackPower: 9, WeaponType: "sword", RequiredLevel: 6, MinItemLevel: 8,
			Unique: &pb.UniqueItem{
				EffectCode:   types.UniqueEffectKillHeal,
				EffectText:   "Kills restore 4% of max health.",
				FixedAffixes: []*pb.AffixRange{{Stat: types.AffixStrength, Min: 2, Max: 4}},
			},
		},
	)
	return resp
}

// The pools carry each template's min item level and required level, rings
// get a pool of their own, and a unique never enters a base pool.
// FS-4R9M9 §Requirements 5, 6, 8, 12.
func TestInitializeItems_TieredCatalogue_BuildsBaseAndUniquePools(t *testing.T) {
	s := lootSession(t, tieredCatalogue(), pbRarities(), nil)

	require.Len(t, s.itemPool.Weapons, 3, "two tier I swords and one tier II, the unique left out")
	require.Len(t, s.itemPool.Rings, 1)
	assert.Equal(t, types.ItemTypeRing, s.itemPool.Rings[0].Config.ItemType)
	for _, w := range s.itemPool.Weapons {
		assert.False(t, w.Unique)
		if w.Config.Name == "Bastard Sword" {
			assert.Equal(t, 8, w.MinItemLevel)
			assert.Equal(t, 6, w.Config.RequiredLevel)
		} else {
			assert.Equal(t, 1, w.MinItemLevel, "an unset min item level is 1")
		}
	}

	require.Len(t, s.itemPool.Uniques, 1)
	u := s.itemPool.Uniques[0]
	assert.True(t, u.Unique)
	assert.Equal(t, 8, u.MinItemLevel)
	assert.Equal(t, types.UniqueEffectKillHeal, u.Config.UniqueEffectCode)
	assert.Equal(t, "Kills restore 4% of max health.", u.Config.UniqueEffectText)
	assert.Equal(t, []affixRange{{Stat: types.AffixStrength, Min: 2, Max: 4}}, u.FixedAffixes)
}

// An item type the game does not know still refuses the catalogue.
func TestInitializeItems_UnknownItemType_Errors(t *testing.T) {
	resp := lootTemplates(false)
	resp.Items = append(resp.Items, &pb.ItemTemplate{Id: uuid.NewString(), ItemName: "Odd", ItemType: "trinket"})

	_, err := buildLootPool(resp.Items)
	assert.Error(t, err)
}

// A session with a ring in its catalogue starts, and its chests never drop
// rings. FS-4R9M9 §Requirements 47.
func TestGenerateItems_RingInCatalogue_ChestsNeverDropRings(t *testing.T) {
	s := lootSession(t, tieredCatalogue(), pbRarities(), nil)

	for range 200 {
		ids, err := s.generateItems(components.ContainerKindChest)
		require.NoError(t, err)
		for _, item := range itemsByID(s, ids) {
			assert.NotEqual(t, types.ItemTypeRing, item.ItemType)
			assert.Empty(t, item.UniqueEffectCode, "the unique needs item level 8; a chest here rolls at 1")
		}
	}
}

// A unique whose effect code this game-service does not know never enters the
// pool, and the catalogue still loads with a warning. FS-4R9M9 §Requirements 30.
func TestBuildLootPool_UnknownUniqueEffect_ExcludedWithWarning(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	resp := tieredCatalogue()
	resp.Items = append(resp.Items, &pb.ItemTemplate{
		Id: uuid.NewString(), ItemName: "Cursed Idol", ItemType: "ring", MinItemLevel: 1,
		Unique: &pb.UniqueItem{EffectCode: "summon_wraith", EffectText: "Summons a wraith."},
	})

	pool, err := buildLootPool(resp.Items)
	require.NoError(t, err)

	require.Len(t, pool.Uniques, 1)
	assert.Equal(t, "Gravewarden's Edge", pool.Uniques[0].Config.Name)
	assert.Contains(t, buf.String(), "level=WARN")
	assert.Contains(t, buf.String(), "summon_wraith")
	assert.Contains(t, buf.String(), "Cursed Idol")
}

// antidoteCatalogue is the basic catalogue with the antidote beside the heal
// potion, as items-service lists it. FS-9JV5K §D R16.
func antidoteCatalogue() *pb.ListItemTemplatesResponse {
	resp := lootTemplates(true)
	resp.Items = append(resp.Items, &pb.ItemTemplate{Id: uuid.NewString(), ItemName: types.AntidoteName, Rarity: templateRarity, ItemType: "consumable", MaxStackSize: 20})
	return resp
}

// The antidote is kept out of the random loot pool, yet the session holds its
// template for the merchant to sell. FS-9JV5K §D R16.
func TestInitializeItems_Antidote_KeptOutOfTheLootPoolButHeld(t *testing.T) {
	s := lootSession(t, antidoteCatalogue(), pbRarities(), nil)

	require.Len(t, s.itemPool.Consumables, 1)
	assert.Equal(t, "Lesser Heal Potion", s.itemPool.Consumables[0].Config.Name)
	require.NotNil(t, s.itemPool.Antidote, "the session can find the antidote's template")
	assert.Equal(t, types.AntidoteName, s.itemPool.Antidote.Config.Name)
	assert.Equal(t, types.ItemTypeConsumable, s.itemPool.Antidote.Config.ItemType)
	assert.Equal(t, 4, s.itemPool.count(), "the antidote is no base template of the pool")
}

// draughtCatalogue is the antidote catalogue with the Restoring Draught beside
// them, as items-service lists it after migration 033. FS-9JV5K §Change: The
// Restoring Draught D1.
func draughtCatalogue() *pb.ListItemTemplatesResponse {
	resp := antidoteCatalogue()
	resp.Items = append(resp.Items, &pb.ItemTemplate{Id: uuid.NewString(), ItemName: types.RestoringDraughtName, Rarity: templateRarity, ItemType: "consumable", MaxStackSize: 20})
	return resp
}

// The Restoring Draught is kept out of the random loot pool, yet the session
// holds its template for the merchant to sell. FS-9JV5K §Change: The
// Restoring Draught D1.
func TestInitializeItems_RestoringDraught_KeptOutOfTheLootPoolButHeld(t *testing.T) {
	s := lootSession(t, draughtCatalogue(), pbRarities(), nil)

	require.Len(t, s.itemPool.Consumables, 1)
	assert.Equal(t, "Lesser Heal Potion", s.itemPool.Consumables[0].Config.Name)
	require.NotNil(t, s.itemPool.RestoringDraught, "the session can find the draught's template")
	assert.Equal(t, types.RestoringDraughtName, s.itemPool.RestoringDraught.Config.Name)
	assert.Equal(t, types.ItemTypeConsumable, s.itemPool.RestoringDraught.Config.ItemType)
	require.NotNil(t, s.itemPool.Antidote, "the antidote is held apart as before")
	assert.Equal(t, 4, s.itemPool.count(), "the draught is no base template of the pool")
}

// Over a sweep of chests, sacks and kills on every floor band, no container
// or kill drop ever yields a Restoring Draught. FS-9JV5K §Change: The
// Restoring Draught, Acceptance Criteria "no loot roll ever yields it".
func TestLoot_RestoringDraught_NeverRolledIntoAContainerOrAKillDrop(t *testing.T) {
	s := lootSession(t, draughtCatalogue(), pbRarities(), nil)

	consumables := 0
	count := func(items []*components.ItemComponent) {
		for _, item := range items {
			require.NotEqual(t, types.RestoringDraughtName, item.Name, "a draught was rolled")
			if item.ItemType == types.ItemTypeConsumable {
				consumables++
			}
		}
	}
	for range 500 {
		for _, kind := range []components.ContainerKind{components.ContainerKindChest, components.ContainerKindSack} {
			ids, err := s.generateItems(kind)
			require.NoError(t, err)
			count(itemsByID(s, ids))
		}
	}

	for seed := range uint64(20) {
		drops := newMonsterDrops(s, rand.New(rand.NewPCG(seed, seed+1)))
		for floor := 1; floor <= 10; floor++ {
			for range 50 {
				drops.ConsumeKill(systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: floor, Elite: true, Floor: floor})
			}
		}
	}
	for _, pile := range dropPiles(s) {
		count(itemsByID(s, pileItemIDs(t, pile)))
	}

	assert.Positive(t, consumables, "the sweep rolled consumables, so the draught had its chance")
}

// A catalogue without the antidote loads as before, holding none.
func TestInitializeItems_NoAntidote_HoldsNone(t *testing.T) {
	s := lootSession(t, lootTemplates(true), pbRarities(), nil)

	assert.Nil(t, s.itemPool.Antidote)
	assert.Nil(t, s.itemPool.RestoringDraught)
	assert.Len(t, s.itemPool.Consumables, 1)
}

// Over a sweep of chests, sacks and kills on every floor band, no container
// or kill drop ever yields an antidote. FS-9JV5K §D R16; §Acceptance Criteria
// "The antidote is never rolled into a container or a kill drop".
func TestLoot_Antidote_NeverRolledIntoAContainerOrAKillDrop(t *testing.T) {
	s := lootSession(t, antidoteCatalogue(), pbRarities(), nil)

	consumables := 0
	count := func(items []*components.ItemComponent) {
		for _, item := range items {
			require.NotEqual(t, types.AntidoteName, item.Name, "an antidote was rolled")
			if item.ItemType == types.ItemTypeConsumable {
				consumables++
			}
		}
	}
	for range 500 {
		for _, kind := range []components.ContainerKind{components.ContainerKindChest, components.ContainerKindSack} {
			ids, err := s.generateItems(kind)
			require.NoError(t, err)
			count(itemsByID(s, ids))
		}
	}

	for seed := range uint64(20) {
		drops := newMonsterDrops(s, rand.New(rand.NewPCG(seed, seed+1)))
		for floor := 1; floor <= 10; floor++ {
			for range 50 {
				drops.ConsumeKill(systems.KillRecord{Archetype: components.MonsterArchetypeGhoul, Level: floor, Elite: true, Floor: floor})
			}
		}
	}
	for _, pile := range dropPiles(s) {
		count(itemsByID(s, pileItemIDs(t, pile)))
	}

	assert.Positive(t, consumables, "the sweep rolled consumables, so the antidote had its chance")
}
