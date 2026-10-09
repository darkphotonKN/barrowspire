package game

import (
	"bytes"
	"log/slog"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
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
		ids, err := s.generateItems()
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
