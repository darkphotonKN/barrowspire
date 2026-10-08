package game

import (
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A chest's items roll at the floor's area level, measured when it is opened:
// the highest level among the delvers in play + 2 × (floor − 1).
// FS-4R9M9 §Requirements 10, 47.
func TestGenerateItems_ChestOnFloorTwo_RollsAtTheAreaLevel(t *testing.T) {
	tests := []struct {
		name    string
		floor   int
		escaped int // level of an escaped delver, 0 for none
		want    int
	}{
		{"floor 1, level 5 party", 1, 0, 5},
		{"floor 2, level 5 party", 2, 0, 7},
		{"floor 3, level 5 party", 3, 0, 9},
		{"an escaped delver's level does not count", 2, 12, 7},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newRun(t, &countingItemsClient{})
			s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 5})
			s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Kaelen", Class: "mage", Level: 3})
			if tt.escaped > 0 {
				gone := uuid.New()
				s.AddPlayer(gone, types.CharacterInPlay{Name: "Ash", Class: "archer", Level: tt.escaped})
				markEscaped(t, delverEntity(t, s, gone))
			}
			currentFloor(t, s).Depth = tt.floor

			for range 20 {
				ids, err := s.generateItems()
				require.NoError(t, err)
				for _, item := range itemsByID(s, ids) {
					assert.Equal(t, tt.want, item.ItemLevel, item.Name)
				}
			}
		})
	}
}

// A chest's Fabled roll drops a unique from the session's unique pool, as an
// item entity carrying its fixed affixes and effect. FS-4R9M9 §Requirements 25–28.
func TestGenerateItems_FabledRoll_DropsAUniqueFromTheSessionPool(t *testing.T) {
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

	uniques := 0
	for range 50 {
		ids, err := s.generateItems()
		require.NoError(t, err)
		for _, item := range itemsByID(s, ids) {
			if item.ItemType == types.ItemTypeConsumable {
				assert.Empty(t, item.UniqueEffectCode, "a consumable never rolls Fabled")
				continue
			}
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

// Chests never drop rings, ring uniques included: a chest's Fabled roll leaves
// them out of the pick, and with no other unique eligible it rolls Runed of
// its own type. A monster drop may still be a ring unique.
// FS-4R9M9 §Requirements 26, 47 (OD).
func TestGenerateItems_FabledRoll_NeverDropsARingUnique(t *testing.T) {
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

	for range 50 {
		ids, err := s.generateItems()
		require.NoError(t, err)
		for _, item := range itemsByID(s, ids) {
			assert.NotEqual(t, types.ItemTypeRing, item.ItemType, item.Name)
			assert.Empty(t, item.UniqueEffectCode, item.Name)
			if item.ItemType != types.ItemTypeConsumable {
				assert.Equal(t, rarityRuned, item.RarityCode, item.Name)
			}
		}
	}

	monsterUniques := 0
	for range 20 {
		for _, id := range s.dropLoot(types.ItemTypeWeapon, s.itemPool.Weapons, 1, lootDrop{ItemLevel: 1, Source: lootSourceDemon}) {
			if item := itemsByID(s, []uuid.UUID{id})[0]; item.UniqueEffectCode == types.UniqueEffectPierce {
				monsterUniques++
			}
		}
	}
	assert.Positive(t, monsterUniques, "a monster's Fabled roll can be a ring unique")
}
