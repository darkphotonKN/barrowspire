package game

import (
	"context"
	"errors"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

/**
* A session must still be creatable when the items service cannot supply a
* catalogue. Item seeding is decoration on the map, not a precondition for the
* run, so a failure here degrades to a session with no ground loot rather than
* taking down the whole game server.
**/
func TestInitializeItemsWithoutACatalogue(t *testing.T) {
	tests := []struct {
		name    string
		resp    *pb.ListItemTemplatesResponse
		respErr error
		wantErr bool
	}{
		{
			name:    "items service is unreachable",
			resp:    nil,
			respErr: errors.New("rpc error: code = Unavailable desc = connection refused"),
			wantErr: true,
		},
		{
			name:    "items service answers with a nil response and no error",
			resp:    nil,
			respErr: nil,
			wantErr: false,
		},
		{
			name:    "items service answers with an empty catalogue",
			resp:    &pb.ListItemTemplatesResponse{},
			respErr: nil,
			wantErr: false,
		},
		{
			name:    "items service answers with a nil item slice",
			resp:    &pb.ListItemTemplatesResponse{Items: nil},
			respErr: nil,
			wantErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockClient := &mockItemsClient{}
			mockClient.On("ListItemTemplates", mock.Anything).Return(tc.resp, tc.respErr)

			session := &Session{itemsClient: mockClient}

			// the panic this guards against took down the whole process, not just the session
			require.NotPanics(t, func() {
				err := session.InitializeItems(context.Background())

				if tc.wantErr {
					assert.Error(t, err)
					return
				}
				assert.NoError(t, err)
			})
		})
	}
}

// ListItemTemplates carries the rarity NAME (rarity_name AS rarity), never an id.
const templateRarity = "Normal"

func lootTemplates(withConsumables bool) *pb.ListItemTemplatesResponse {
	items := []*pb.ItemTemplate{
		{Id: uuid.NewString(), ItemName: "Longsword", Rarity: templateRarity, ItemType: "weapon", AttackPower: 6, CriticalRate: 0.08, WeaponType: "sword"},
		{Id: uuid.NewString(), ItemName: "Seax", Rarity: templateRarity, ItemType: "weapon", AttackPower: 3, CriticalRate: 0.15, WeaponType: "knife"},
		{Id: uuid.NewString(), ItemName: "Bone Helm", Rarity: templateRarity, ItemType: "armor", DefenseRating: 1, MagicResistance: 3, ArmorSlot: "head"},
	}
	if withConsumables {
		items = append(items, &pb.ItemTemplate{Id: uuid.NewString(), ItemName: "Lesser Heal Potion", Rarity: templateRarity, ItemType: "consumable", HealingAmount: 10})
	}
	return &pb.ListItemTemplatesResponse{Items: items}
}

func pbRarities() *pb.ListItemRaritiesResponse {
	return &pb.ListItemRaritiesResponse{ItemRarities: []*pb.ItemRarity{
		{Id: "r-normal", RarityCode: "normal", DropRateMultiplier: 1.00},
		{Id: "r-runed", RarityCode: "runed", DropRateMultiplier: 0.02},
		{Id: "r-fabled", RarityCode: "fabled", DropRateMultiplier: 0.01},
	}}
}

func lootSession(t *testing.T, templates *pb.ListItemTemplatesResponse, rarities *pb.ListItemRaritiesResponse, raritiesErr error) *Session {
	t.Helper()
	client := &mockItemsClient{rarities: rarities, raritiesErr: raritiesErr}
	client.On("ListItemTemplates", mock.Anything).Return(templates, nil)
	s := &Session{itemsClient: client, EntityManager: ecs.NewEntityManager()}
	s.loadRaritiesAtBuild()
	require.NoError(t, s.InitializeItems(context.Background()))
	return s
}

func itemsByID(s *Session, ids []uuid.UUID) []*components.ItemComponent {
	out := make([]*components.ItemComponent, 0, len(ids))
	for _, id := range ids {
		e, ok := s.EntityManager.GetEntity(id)
		if !ok {
			continue
		}
		c, _ := e.GetComponent(ecs.ComponentTypeItem)
		out = append(out, c.(*components.ItemComponent))
	}
	return out
}

func TestInitializeItems_FilesEachTypeIntoItsOwnPool(t *testing.T) {
	s := lootSession(t, lootTemplates(true), pbRarities(), nil)

	pools := map[types.ItemType][]lootTemplate{
		types.ItemTypeWeapon:     s.itemPool.Weapons,
		types.ItemTypeArmor:      s.itemPool.Armor,
		types.ItemTypeConsumable: s.itemPool.Consumables,
	}
	assert.Len(t, s.itemPool.Weapons, 2)
	assert.Len(t, s.itemPool.Armor, 1)
	assert.Len(t, s.itemPool.Consumables, 1)
	for itemType, pool := range pools {
		for _, item := range pool {
			assert.Equal(t, itemType, item.Config.ItemType)
			assert.Empty(t, item.Config.RarityID, "template rarity is a name, not an id")
		}
	}
}

func TestDropLoot_DropsExactlyTheRequestedCount(t *testing.T) {
	s := lootSession(t, lootTemplates(true), pbRarities(), nil)

	ids := s.dropLoot(types.ItemTypeArmor, s.itemPool.Armor, 3, lootDrop{ItemLevel: 1})

	items := itemsByID(s, ids)
	assert.Len(t, items, 3)
	for _, item := range items {
		assert.Equal(t, types.ItemTypeArmor, item.ItemType)
		assert.Contains(t, []string{"r-normal", "r-runed", "r-fabled"}, item.RarityID)
	}
}

func TestDropLoot_EmptyPool_SkipsWithoutPanic(t *testing.T) {
	s := lootSession(t, lootTemplates(false), pbRarities(), nil)

	require.NotPanics(t, func() {
		assert.Empty(t, s.dropLoot(types.ItemTypeConsumable, s.itemPool.Consumables, 2, lootDrop{ItemLevel: 1}))
	})
}

func TestGenerateItems_DropsTheDecidedTotal(t *testing.T) {
	s := lootSession(t, lootTemplates(true), pbRarities(), nil)

	for range 200 {
		ids, err := s.generateItems()
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(ids), 2)
		assert.LessOrEqual(t, len(ids), 4)
	}
}

func TestGenerateItems_MissingType_StillDropsTheOthers(t *testing.T) {
	s := lootSession(t, lootTemplates(false), pbRarities(), nil)

	dropped := 0
	require.NotPanics(t, func() {
		for range 200 {
			ids, err := s.generateItems()
			require.NoError(t, err)
			for _, item := range itemsByID(s, ids) {
				assert.NotEqual(t, types.ItemTypeConsumable, item.ItemType)
				dropped++
			}
		}
	})
	assert.Positive(t, dropped)
}

func TestGenerateItems_RaritiesUnavailable_DropsUnscaledBaseItems(t *testing.T) {
	for name, tc := range map[string]struct {
		rarities *pb.ListItemRaritiesResponse
		err      error
	}{
		"rarities rpc fails":       {nil, errors.New("unavailable")},
		"rarities come back empty": {&pb.ListItemRaritiesResponse{}, nil},
	} {
		t.Run(name, func(t *testing.T) {
			s := lootSession(t, lootTemplates(true), tc.rarities, tc.err)
			base := map[string]types.ItemConfig{}
			for _, pool := range [][]lootTemplate{s.itemPool.Weapons, s.itemPool.Armor, s.itemPool.Consumables} {
				for _, item := range pool {
					base[item.Config.Name] = item.Config
				}
			}

			for range 50 {
				ids, err := s.generateItems()
				require.NoError(t, err)
				for _, item := range itemsByID(s, ids) {
					b, ok := base[item.Name]
					require.True(t, ok, "base name kept, got %q", item.Name)
					assert.Empty(t, item.RarityID, "fallback drops carry no rarity id (NULL)")
					assert.Equal(t, b.AttackPower, item.AttackPower)
					assert.Equal(t, b.CriticalRate, item.CriticalRate)
					assert.Equal(t, b.DefenseRating, item.DefenseRating)
					assert.Equal(t, b.MagicResistance, item.MagicResistance)
					assert.Equal(t, b.HealingAmount, item.HealingAmount)
				}
			}
		})
	}
}

// Items rolled in the run carry their derived required level: at item level 1
// only tier I affixes roll, so gear keeps its template's requirement, and a
// consumable always requires 1. FS-BDA7X §Requirements 30, FS-4R9M9 §Requirements 15, 23.
func TestGenerateItems_RolledLoot_CarriesItsDerivedRequiredLevel(t *testing.T) {
	templates := &pb.ListItemTemplatesResponse{Items: []*pb.ItemTemplate{
		{Id: uuid.NewString(), ItemName: "Longsword", Rarity: templateRarity, ItemType: "weapon", AttackPower: 6, WeaponType: "sword", RequiredLevel: 7},
		{Id: uuid.NewString(), ItemName: "Bone Helm", Rarity: templateRarity, ItemType: "armor", DefenseRating: 1, ArmorSlot: "head", RequiredLevel: 4},
		{Id: uuid.NewString(), ItemName: "Lesser Heal Potion", Rarity: templateRarity, ItemType: "consumable", HealingAmount: 10, RequiredLevel: 2},
	}}
	want := map[types.ItemType]int{types.ItemTypeWeapon: 7, types.ItemTypeArmor: 4, types.ItemTypeConsumable: 1}
	s := lootSession(t, templates, pbRarities(), nil)

	seen := map[types.ItemType]bool{}
	for range 100 {
		ids, err := s.generateItems()
		require.NoError(t, err)
		for _, item := range itemsByID(s, ids) {
			assert.Equal(t, want[item.ItemType], item.RequiredLevel, item.Name)
			seen[item.ItemType] = true
		}
	}
	assert.Len(t, seen, 3, "every item type dropped at least once")
}
