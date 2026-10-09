package game

import (
	"context"
	"testing"

	pbevents "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// affixedLoadoutClient is the items service with one delver's loadout: a
// unique weapon and a ring, each with stored affixes, item level and required
// level.
type affixedLoadoutClient struct {
	countingItemsClient
	loadout *pb.GetLoadoutWithItemsResponse
}

func (c *affixedLoadoutClient) GetLoadoutWithItems(_ context.Context, _ *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	return c.loadout, nil
}

var (
	storedWeaponAffixes = []types.Affix{
		{Stat: types.AffixStrength, Tier: 2, Value: 5},
		{Stat: types.AffixCritChance, Tier: 1, Value: 3},
	}
	storedRingAffixes = []types.Affix{{Stat: types.AffixMaxHealth, Tier: 1, Value: 8}}
)

func pbAffixes(affixes []types.Affix) []*pb.Affix {
	out := make([]*pb.Affix, 0, len(affixes))
	for _, a := range affixes {
		out = append(out, &pb.Affix{Stat: a.Stat, Tier: int32(a.Tier), Value: int32(a.Value)})
	}
	return out
}

func eventAffixes(affixes []*pbevents.ItemAffix) []types.Affix {
	out := make([]types.Affix, 0, len(affixes))
	for _, a := range affixes {
		out = append(out, types.Affix{Stat: a.GetStat(), Tier: int(a.GetTier()), Value: int(a.GetValue())})
	}
	return out
}

func affixedLoadout() *pb.GetLoadoutWithItemsResponse {
	return &pb.GetLoadoutWithItemsResponse{
		Weapon: &pb.ItemInstance{
			Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "weapon",
			Name: "Gravewarden's Edge", AttackPower: 9, RarityId: "r-fabled",
			ItemLevel: 9, RequiredLevel: 6, Affixes: pbAffixes(storedWeaponAffixes),
			UniqueEffectCode: "life_on_kill", UniqueEffectText: "Heals you when you slay a foe.",
		},
		Ring_1: &pb.ItemInstance{
			Id: uuid.NewString(), TemplateId: uuid.NewString(), ItemType: "ring",
			Name: "Iron Band", RarityId: "r-normal",
			ItemLevel: 3, RequiredLevel: 1, Affixes: pbAffixes(storedRingAffixes),
		},
	}
}

// A loadout item with affixes is seated with its stored item level, affixes,
// required level and unique effect, shows them in world state, and is
// extracted with them unchanged. FS-4R9M9 §Requirements 20, 53, 54.
func TestLoadoutItem_WithAffixes_RoundTripsSeatStateAndExtraction(t *testing.T) {
	client := &affixedLoadoutClient{loadout: affixedLoadout()}
	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, client, RunBounds())
	s.InitialSystems()

	// the server's order: the roster is seated before the world is built
	memberID := uuid.New()
	s.AddPlayer(memberID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 6})
	s.InitialMapObjects()
	eq, _ := delverEntity(t, s, memberID).GetComponent(ecs.ComponentTypeEquipment)
	equipment := eq.(*components.EquipmentComponent)
	require.NotNil(t, equipment.WeaponSlot, "the unique is worn at level 6")
	require.NotNil(t, equipment.Ring1Slot, "the ring is worn")

	// seated
	weapon := itemComponent(t, s, *equipment.WeaponSlot)
	assert.Equal(t, 9, weapon.ItemLevel)
	assert.Equal(t, 6, weapon.RequiredLevel)
	assert.Equal(t, storedWeaponAffixes, weapon.Affixes)
	assert.Equal(t, rarityFabled, weapon.RarityCode)
	assert.Equal(t, "life_on_kill", weapon.UniqueEffectCode)
	assert.Equal(t, "Heals you when you slay a foe.", weapon.UniqueEffectText)

	// shown in world state
	state, err := serializer.NewStateSerializer(em).SerializeBackendState(context.Background(), s.ID, types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	me := state.Players[memberID]
	require.NotNil(t, me)
	require.NotNil(t, me.Equipment.Weapon)
	shown := me.Equipment.Weapon
	assert.Equal(t, rarityFabled, shown.Rarity)
	assert.Equal(t, 9, shown.ItemLevel)
	assert.Equal(t, 6, shown.RequiredLevel)
	assert.Equal(t, storedWeaponAffixes, shown.Affixes)
	assert.Equal(t, "Heals you when you slay a foe.", shown.UniqueEffect)
	require.NotNil(t, me.Equipment.Ring1, "a ring is shown in its slot")
	assert.Equal(t, storedRingAffixes, me.Equipment.Ring1.Affixes)
	assert.Equal(t, rarityNormal, me.Equipment.Ring1.Rarity)

	// extracted
	outbox := &capturingOutbox{}
	s.sessionCloser = &homeReturner{run: s}
	s.eventEmitter = NewService(outbox)
	s.sender = &recordingSender{}
	s.endSessionCh = make(chan bool, 64)
	markEscaped(t, delverEntity(t, s, memberID))
	s.endSession()

	event := outbox.itemsExtracted(t)
	require.Len(t, event.PlayerItems, 1)
	out := event.PlayerItems[0].Equipment
	require.NotNil(t, out.GetWeapon())
	assert.Equal(t, int32(9), out.Weapon.ItemLevel)
	assert.Equal(t, int32(6), out.Weapon.RequiredLevel)
	assert.Equal(t, storedWeaponAffixes, eventAffixes(out.Weapon.Affixes))
	require.NotNil(t, out.GetRing_1())
	assert.Equal(t, int32(3), out.Ring_1.ItemLevel)
	assert.Equal(t, storedRingAffixes, eventAffixes(out.Ring_1.Affixes))
}

// An item found in a chest leaves the run with the item level, required
// level and affixes it rolled. FS-4R9M9 §Requirements 47, 49.
func TestExtraction_ChestItem_CarriesItsRoll(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	outbox := &capturingOutbox{}
	s.sessionCloser = &homeReturner{run: s}
	s.eventEmitter = NewService(outbox)
	s.sender = &recordingSender{}
	s.endSessionCh = make(chan bool, 64)

	found := itemComponent(t, s, p.pickedUpItemID)
	require.Equal(t, 1, found.ItemLevel, "a floor 1 chest of level 1 delvers rolls at 1")
	// a roll the extraction must carry exactly, whatever the dice gave
	found.ItemLevel = 7
	found.RequiredLevel = 6
	found.Affixes = []types.Affix{{Stat: types.AffixDefense, Tier: 2, Value: 3}}

	markEscaped(t, delverEntity(t, s, p.carrier))
	s.endSession()

	event := outbox.itemsExtracted(t)
	var satchel []*pbevents.Item
	for _, items := range event.PlayerItems {
		if items.MemberId == p.carrier.String() {
			satchel = items.Inventory
		}
	}
	require.Len(t, satchel, 1)
	assert.Equal(t, int32(7), satchel[0].ItemLevel)
	assert.Equal(t, int32(6), satchel[0].RequiredLevel)
	assert.Equal(t, found.Affixes, eventAffixes(satchel[0].Affixes))
}

// rarityProbeClient is the items service with one delver's loadout, recording
// each rarity load and whether it was given a deadline.
type rarityProbeClient struct {
	affixedLoadoutClient
	raritiesErr  error
	rarityLoads  int
	deadlineSeen bool
}

func (c *rarityProbeClient) ListItemRarities(ctx context.Context) (*pb.ListItemRaritiesResponse, error) {
	c.rarityLoads++
	_, c.deadlineSeen = ctx.Deadline()
	if c.raritiesErr != nil {
		return nil, c.raritiesErr
	}
	return pbRarities(), nil
}

// Rarities are loaded once, while the world is built and before its loop can
// run, under a deadline; seating and building floors never load them again.
// FS-4R9M9 §Requirements 22, 53.
func TestNewSession_LoadsRaritiesOnceAtBuild_WithADeadline(t *testing.T) {
	for name, bounds := range map[string]WorldBounds{"run": RunBounds(), "hub": HubBounds()} {
		t.Run(name, func(t *testing.T) {
			client := &rarityProbeClient{affixedLoadoutClient: affixedLoadoutClient{loadout: affixedLoadout()}}
			s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, client, bounds)

			assert.Equal(t, 1, client.rarityLoads, "loaded at build")
			assert.True(t, client.deadlineSeen, "the load has a deadline")
			assert.Len(t, s.lootRarities, len(pbRarities().ItemRarities))

			memberID := uuid.New()
			s.AddPlayer(memberID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 6})
			s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Ash", Class: "mage", Level: 6})
			if bounds.Type == types.WorldTypeRun {
				s.InitialSystems()
				s.InitialMapObjects()
			}
			assert.Equal(t, 1, client.rarityLoads, "never loaded again")

			eq, _ := delverEntity(t, s, memberID).GetComponent(ecs.ComponentTypeEquipment)
			weapon := eq.(*components.EquipmentComponent).WeaponSlot
			require.NotNil(t, weapon)
			assert.Equal(t, rarityFabled, itemComponent(t, s, *weapon).RarityCode)
		})
	}
}

// With rarities unavailable at build, delvers are seated with unlabelled items
// and nobody's seating retries the load. FS-4R9M9 §Requirements 22.
func TestAddPlayer_RaritiesUnavailableAtBuild_SeatsWithoutRetrying(t *testing.T) {
	client := &rarityProbeClient{
		affixedLoadoutClient: affixedLoadoutClient{loadout: affixedLoadout()},
		raritiesErr:          context.DeadlineExceeded,
	}
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, client, HubBounds())

	memberID := uuid.New()
	s.AddPlayer(memberID, types.CharacterInPlay{Name: "Wren", Class: "warrior", Level: 6})
	s.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Ash", Class: "mage", Level: 6})

	assert.Equal(t, 1, client.rarityLoads)
	assert.Empty(t, s.lootRarities)
	eq, _ := delverEntity(t, s, memberID).GetComponent(ecs.ComponentTypeEquipment)
	weapon := eq.(*components.EquipmentComponent).WeaponSlot
	require.NotNil(t, weapon)
	assert.Empty(t, itemComponent(t, s, *weapon).RarityCode)
}
