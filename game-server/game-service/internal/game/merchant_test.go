package game

import (
	"log/slog"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// merchantRun is a seeded run of height floors for delvers, climbed to floor
// 2, every floor's merchant and fountain forced, no tome plan, no hallowed
// altar, and a tome offered at tomeChance. The catalogue holds the antidote
// and the Restoring Draught beside the test catalogue's potion.
func merchantRun(t *testing.T, seed uint64, delvers, height int, tomeChance float64) (*Session, []uuid.UUID) {
	t.Helper()
	s, ids := dungeonRun(t, seed, delvers, 0, withTuning(func(t *floorTuning) {
		t.merchantFloorChance, t.merchantTomeChance = 1, tomeChance
		t.fountainFloorChance, t.hallowedAltarRunChance = 1, 0
	}))
	// a seeded run may have rolled a tome plan; none here
	if runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities()); ok {
		runLevel.RemoveComponent(ecs.ComponentTypeTomePlan)
	}
	s.sender = &recordingSender{}
	s.itemPool.Antidote = &lootTemplate{Config: types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: types.AntidoteName}}
	s.itemPool.RestoringDraught = &lootTemplate{Config: types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: types.RestoringDraughtName}}
	currentFloor(t, s).Count = height
	require.NoError(t, s.regenerateFloor())
	require.NotNil(t, s.dungeon, "seed %d: floor 2 is a dungeon floor", seed)
	return s, ids
}

// merchantOf is the floor's merchant, false with none.
func merchantOf(entities []*ecs.Entity) (*ecs.Entity, *components.MerchantComponent, bool) {
	for _, e := range entities {
		if mc, ok := e.GetComponent(ecs.ComponentTypeMerchant); ok {
			return e, mc.(*components.MerchantComponent), true
		}
	}
	return nil, nil, false
}

// theMerchant is the floor's merchant entity and component; the test fails
// with none.
func theMerchant(t *testing.T, s *Session) (*ecs.Entity, *components.MerchantComponent) {
	t.Helper()
	e, mc, ok := merchantOf(s.EntityManager.GetAllEntities())
	require.True(t, ok, "the floor holds a merchant")
	return e, mc
}

// FS-9JV5K §A R1: about a third of floors 2+ hold a merchant, never floor 1
// and never the top, over a seed sweep of the floor draw.
func TestMerchant_FloorOddsOverASeedSweep(t *testing.T) {
	const runs = 3000
	held := 0
	for seed := uint64(1); seed <= runs; seed++ {
		rng := seededSpawns(seed)
		assert.False(t, merchantFor(rng, firstFloor, false, MerchantFloorChance), "never on floor 1")
		assert.False(t, merchantFor(rng, 5, true, MerchantFloorChance), "never on the top floor")
		if merchantFor(rng, 4, false, MerchantFloorChance) {
			held++
		}
	}
	assert.InDelta(t, MerchantFloorChance, float64(held)/runs, 0.03)
}

// FS-9JV5K §A R1-R3: the merchant stands in a respite room that is not the
// start, stairs, switch, escape door, treasure, a seal piece's, a hidden room
// or the fountain's; at most one a floor; no monster or container in his room;
// his wares are a potion, an antidote and a Restoring Draught line, in that
// order, at their prices and stock (FS-9JV5K §Change: The Restoring Draught D2).
func TestMerchant_RoomRulesAndWaresOverASeedSweep(t *testing.T) {
	seen := 0
	for seed := uint64(1); seed <= 30; seed++ {
		s, _ := merchantRun(t, seed, 2, 5, 0)
		for depth := 2; depth <= 4; depth++ {
			if s.dungeon == nil {
				require.NoError(t, s.regenerateFloor())
				continue
			}
			e, mc := theMerchant(t, s)
			seen++
			require.Len(t, entityIDsWith(s, ecs.ComponentTypeMerchant), 1, "at most one a floor")
			d := s.dungeon
			at := transformOf(t, e)
			room := d.roomAt(at.X, at.Y)
			require.GreaterOrEqual(t, room, 0, "seed %d floor %d: in a room", seed, depth)
			roles := d.layout.Roles
			assert.NotEqual(t, roles.Start, room)
			assert.NotEqual(t, roles.Stairs, room)
			assert.NotEqual(t, roles.Switch, room)
			assert.NotEqual(t, roles.EscapeDoor, room)
			assert.NotContains(t, roles.Treasure, room)
			assert.False(t, d.isHidden(room))
			assert.False(t, d.sealPieceRooms()[room])
			fountain, hasFountain := d.respiteAt(respiteFountain)
			if hasFountain {
				assert.NotEqual(t, fountain.room, room, "seed %d floor %d: not the fountain's room", seed, depth)
			}
			for _, other := range s.EntityManager.GetAllEntities() {
				tc, placed := other.GetComponent(ecs.ComponentTypeTransform)
				if !placed || d.roomAt(tc.(*components.TransformComponent).X, tc.(*components.TransformComponent).Y) != room {
					continue
				}
				assert.False(t, other.HasComponent(ecs.ComponentTypeEnemy), "seed %d floor %d: no monster in his room", seed, depth)
				assert.False(t, other.HasComponent(ecs.ComponentTypeContainer), "seed %d floor %d: no container in it", seed, depth)
			}

			require.Len(t, mc.Wares, 3)
			assert.Equal(t, []components.WareKind{components.WareHealthPotion, components.WareAntidote, components.WareRestoringDraught},
				[]components.WareKind{mc.Wares[0].Kind, mc.Wares[1].Kind, mc.Wares[2].Kind}, "potion, antidote, draught")
			potion, antidote, draught := mc.Ware(components.WareHealthPotion), mc.Ware(components.WareAntidote), mc.Ware(components.WareRestoringDraught)
			require.NotNil(t, potion)
			require.NotNil(t, antidote)
			require.NotNil(t, draught)
			assert.Equal(t, MerchantPotionPrice, potion.Price)
			assert.Equal(t, MerchantPotionStock, potion.Left)
			assert.Equal(t, "Lesser Heal Potion", potion.Item.Name)
			assert.Equal(t, MerchantAntidotePrice, antidote.Price)
			assert.Equal(t, MerchantAntidoteStock, antidote.Left)
			assert.Equal(t, types.AntidoteName, antidote.Item.Name)
			assert.Equal(t, int64(50), draught.Price)
			assert.Equal(t, 3, draught.Left)
			assert.Equal(t, types.RestoringDraughtName, draught.Item.Name)
			assert.Nil(t, mc.Ware(components.WareTomeOfFilth), "no tome offer at chance 0")
			require.NoError(t, s.regenerateFloor())
		}
		_, _, ok := merchantOf(s.EntityManager.GetAllEntities())
		assert.False(t, ok, "seed %d: none on the top floor", seed)
	}
	assert.Greater(t, seen, 80, "most of the 90 floors are dungeon floors with a merchant")
}

// FS-9JV5K §Change: The Restoring Draught D2: a catalogue without the draught's
// template sells no draught and says so at warn, as for the antidote.
func TestMerchantWares_NoDraughtTemplate_SellsNoneAndWarns(t *testing.T) {
	logs := &logBuffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	s, _ := merchantRun(t, 3, 1, 5, 0)
	s.itemPool.RestoringDraught = nil

	wares := s.merchantWares()

	require.Len(t, wares, 2)
	assert.Equal(t, components.WareHealthPotion, wares[0].Kind)
	assert.Equal(t, components.WareAntidote, wares[1].Kind)
	assert.Contains(t, logs.String(), `level=WARN msg="Merchant sells no Restoring Draught: the catalogue has none"`)
}

// FS-9JV5K §A R3 (orchestrator note): the potion sold is the consumable that
// heals the least and restores no mana.
func TestMerchantPotion_SmallestHealthPotion(t *testing.T) {
	pool := []lootTemplate{
		{Config: types.ItemConfig{Name: "Greater Heal Potion", ItemType: types.ItemTypeConsumable, HealingAmount: 60}},
		{Config: types.ItemConfig{Name: "Tonic", ItemType: types.ItemTypeConsumable, HealingAmount: 5, ManaAmount: 5}},
		{Config: types.ItemConfig{Name: "Mana Potion", ItemType: types.ItemTypeConsumable, ManaAmount: 20}},
		{Config: types.ItemConfig{Name: "Lesser Heal Potion", ItemType: types.ItemTypeConsumable, HealingAmount: 25}},
	}
	potion, ok := merchantPotion(pool)
	require.True(t, ok)
	assert.Equal(t, "Lesser Heal Potion", potion.Config.Name)

	_, ok = merchantPotion(pool[1:3])
	assert.False(t, ok, "no consumable heals alone")
}

// FS-9JV5K §A R2: he is no combatant. No health, so nothing hits him; no body
// the ground counts, so he never holds a plate or fires a trap; no player, so
// no monster's quarry.
func TestMerchant_IsNotACombatant(t *testing.T) {
	s, _ := merchantRun(t, 4, 1, 5, 0)
	e, _ := theMerchant(t, s)
	assert.False(t, e.HasComponent(ecs.ComponentTypeHealth))
	assert.False(t, e.HasComponent(ecs.ComponentTypePlayer))
	assert.False(t, e.HasComponent(ecs.ComponentTypeEnemy))
	kind := systems.BodyKindOf(e)
	assert.False(t, kind.Weighs())
	assert.False(t, kind.FiresTraps())
	assert.False(t, systems.CanHit(components.AttackSnapshot{AttackerMemberID: uuid.New()}, e, systems.PlayerDamageOff))
	assert.False(t, systems.CanHit(components.AttackSnapshot{FromMonster: true}, e, systems.PlayerDamageOff))
}

// FS-9JV5K §A R1: his spot is kept out of what is placed later, as a
// fixture's is.
func TestMerchant_InTheMapKeepOut(t *testing.T) {
	em := ecs.NewEntityManager()
	CreateMerchantEntity(em, 400, 300, nil)
	keepOut := mapKeepOut(em.GetAllEntities())
	require.Len(t, keepOut, 1)
	assert.True(t, keepOut[0].X < 400 && keepOut[0].X+keepOut[0].W > 400)
}

// FS-9JV5K §A R4: the merchant rides the wire on his floor, whole: entity id,
// position and every ware with its price, left and display item (none for the
// tome, which has no template); absent where there is none.
func TestRunState_MerchantOnHisFloor(t *testing.T) {
	s, ids := merchantRun(t, 5, 1, 5, 0)
	e, mc := theMerchant(t, s)
	mc.Wares = append(mc.Wares, components.Ware{Kind: components.WareTomeOfFilth, Price: MerchantTomePrice, Left: 1})
	mc.Ware(components.WareAntidote).Left = 1

	got := runState(t, s, ids[0]).Merchant
	require.NotNil(t, got)
	assert.Equal(t, e.ID, got.EntityID)
	at := transformOf(t, e)
	assert.Equal(t, types.Position{X: at.X, Y: at.Y}, *got.Position)
	require.Len(t, got.Wares, 4)
	assert.Equal(t, types.MerchantWareState{Ware: "health_potion", Price: 60, Left: 3,
		Item: &types.MerchantWareItem{Name: "Lesser Heal Potion", ItemType: types.ItemTypeConsumable, Rarity: "normal", HealingAmount: 10}}, *got.Wares[0])
	assert.Equal(t, "antidote", got.Wares[1].Ware)
	assert.Equal(t, 1, got.Wares[1].Left)
	assert.Equal(t, types.AntidoteName, got.Wares[1].Item.Name)
	assert.Equal(t, "restoring_draught", got.Wares[2].Ware)
	assert.Equal(t, int64(50), got.Wares[2].Price)
	assert.Equal(t, 3, got.Wares[2].Left)
	assert.Equal(t, types.RestoringDraughtName, got.Wares[2].Item.Name)
	assert.Equal(t, types.MerchantWareState{Ware: "tome_of_filth", Price: 1500, Left: 1}, *got.Wares[3])

	frame := frameOf(t, s, types.WorldTypeRun, ids[0])
	tome := frame["merchant"].(map[string]any)["wares"].([]any)[3].(map[string]any)
	assert.NotContains(t, tome, "item", "the tome has no item")

	s.EntityManager.RemoveEntity(e.ID)
	assert.NotContains(t, frameOf(t, s, types.WorldTypeRun, ids[0]), "merchant", "absent with none")
}

// dropTomePlan takes the run's tome plan away, as a run whose 2% roll did not
// fire has none.
func dropTomePlan(s *Session) {
	if runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities()); ok {
		runLevel.RemoveComponent(ecs.ComponentTypeTomePlan)
	}
}

// FS-9JV5K §E R18: about 10% of merchants offer the tome, when the run has no
// tome plan and his floor is below height - 1; never otherwise.
func TestOfferTome_OddsAndWhenItMayBeOffered(t *testing.T) {
	s, _ := dungeonRun(t, 7, 1, 0)
	s.spawnRand = seededSpawns(7)
	currentFloor(t, s).Count = 6

	const merchants = 4000
	offered := 0
	for range merchants {
		dropTomePlan(s)
		if s.offerTome(3) {
			offered++
		}
	}
	assert.InDelta(t, MerchantTomeChance, float64(offered)/merchants, 0.015)

	s.tuning.merchantTomeChance = 1
	dropTomePlan(s)
	assert.False(t, s.offerTome(5), "height - 1 has no floor above it for the altar")
	assert.True(t, s.offerTome(4))
	assert.False(t, s.offerTome(2), "a run with a tome plan is offered none")
}

// FS-9JV5K §E R19: an offer sets the tome plan on that tick, the tome's floor
// the merchant's and the altar's drawn uniformly from the next floor to
// height - 1; the plan is the merchant's to sell, so no tome lies anywhere;
// the altar stands on its floor whether or not anyone buys.
func TestOfferTome_CommitsTheAltar(t *testing.T) {
	altarFloors := map[int]int{}
	for seed := uint64(1); seed <= 12; seed++ {
		s, _ := merchantRun(t, seed, 1, 5, 1)
		_, mc := theMerchant(t, s)
		tome := mc.Ware(components.WareTomeOfFilth)
		require.NotNil(t, tome, "seed %d: the tome is offered", seed)
		assert.Equal(t, MerchantTomePrice, tome.Price)
		assert.Equal(t, MerchantTomeStock, tome.Left)
		assert.Nil(t, tome.Item)

		plan, ok := s.tomePlan()
		require.True(t, ok)
		assert.Equal(t, 2, plan.TomeFloor)
		assert.True(t, plan.Sold)
		assert.False(t, plan.Carried)
		require.GreaterOrEqual(t, plan.AltarFloor, 3)
		require.LessOrEqual(t, plan.AltarFloor, 4)
		altarFloors[plan.AltarFloor]++
		assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeTome), "no tome lies on the floor")

		for currentFloor(t, s).Depth < plan.AltarFloor {
			require.NoError(t, s.regenerateFloor())
			assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeTome))
		}
		if s.dungeon != nil {
			assert.Len(t, entityIDsWith(s, ecs.ComponentTypeAltar), 1, "seed %d: the altar stands unbought", seed)
		}
	}
	assert.Len(t, altarFloors, 2, "both floors above, below the top, are drawn")
}

// FS-9JV5K §E R20: buying the tome sets the plan's carried; the party carries
// it, tome_carried on the wire.
func TestBuy_TheTomeSetsCarried(t *testing.T) {
	sh := newShopOffering(t, 1, 1)
	require.NotNil(t, sh.wares.Ware(components.WareTomeOfFilth))

	sh.s.buy(sh.buyer, sh.merchant.ID, components.WareTomeOfFilth)
	assert.Equal(t, 0, sh.wares.Ware(components.WareTomeOfFilth).Left, "reserved")
	assert.False(t, runState(t, sh.s, sh.buyer).TomeCarried, "not before the debit lands")

	assert.Equal(t, map[string]interface{}{"success": true, "ware": "tome_of_filth"}, sh.replied(t, sh.buyer, 1))
	assert.Equal(t, MerchantTomePrice, sh.wallet.taken()[0].amount)
	plan, ok := sh.s.tomePlan()
	require.True(t, ok)
	assert.True(t, plan.Carried)
	assert.True(t, runState(t, sh.s, sh.buyer).TomeCarried)
}
