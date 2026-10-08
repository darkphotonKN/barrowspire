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

func wightfang() types.ItemConfig {
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeWeapon, Name: "Wightfang", AttackPower: 4,
		RarityCode: "fabled", UniqueEffectCode: types.UniqueEffectKillFrenzy,
	}
}

func hollowCrown() types.ItemConfig {
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeArmor, ArmorSlot: types.ArmorSlotHead, Name: "The Hollow Crown",
		RarityCode: "fabled", UniqueEffectCode: types.UniqueEffectKillHeal,
	}
}

func lastKing() types.ItemConfig {
	return types.ItemConfig{
		TemplateID: uuid.New(), ItemType: types.ItemTypeRing, Name: "Ring of the Last King",
		RarityCode: "fabled", UniqueEffectCode: types.UniqueEffectFloorAttributes,
	}
}

var (
	inWeaponSlot = func(eq *components.EquipmentComponent, id *uuid.UUID) { eq.WeaponSlot = id }
	inHeadSlot   = func(eq *components.EquipmentComponent, id *uuid.UUID) { eq.HeadSlot = id }
	inRing1Slot  = func(eq *components.EquipmentComponent, id *uuid.UUID) { eq.Ring1Slot = id }
	inRing2Slot  = func(eq *components.EquipmentComponent, id *uuid.UUID) { eq.Ring2Slot = id }
)

// wearing puts a new item straight into one of the delver's equipment slots.
func wearing(t *testing.T, s *Session, delver *ecs.Entity, slot func(*components.EquipmentComponent, *uuid.UUID), config types.ItemConfig) uuid.UUID {
	t.Helper()
	itemID := s.AddItem(config)
	ec, ok := delver.GetComponent(ecs.ComponentTypeEquipment)
	require.True(t, ok)
	slot(ec.(*components.EquipmentComponent), &itemID)
	return itemID
}

func gearOf(t *testing.T, delver *ecs.Entity) components.GearBonusComponent {
	t.Helper()
	gc, ok := delver.GetComponent(ecs.ComponentTypeGearBonus)
	require.True(t, ok)
	return *gc.(*components.GearBonusComponent)
}

func healthComponent(t *testing.T, delver *ecs.Entity) *components.HealthComponent {
	t.Helper()
	hc, ok := delver.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	return hc.(*components.HealthComponent)
}

// killGhoul has the delver slay a fresh one-hit ghoul in reach through the real
// CombatSystem, then waits out the targeted attack's cooldown.
func killGhoul(t *testing.T, s *Session, playerID uuid.UUID) {
	t.Helper()
	g := frailGhoul(s, 545, 500)
	require.NoError(t, s.handleAttack(playerID, g.ID))
	tick(s)
	require.Equal(t, 0, currentHealth(g), "the ghoul died on the tick")
	tickFor(s, 0.5)
}

// Wightfang: each kill is +15% attack speed, stacking ×3; the stacks expire
// together 4 s after the latest kill, and a fourth kill keeps three and resets
// the timer. FS-4R9M9 §Requirements 32, 40; §Acceptance Criteria "Uniques".
func TestRun_Wightfang_KillsStackAttackSpeedThenExpire(t *testing.T) {
	s := coopRun(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	wearing(t, s, delver, inWeaponSlot, wightfang())

	for range 3 {
		killGhoul(t, s, playerID)
	}
	assert.Equal(t, 45, gearOf(t, delver).AttackSpeedPercent, "three kills in 4 s")

	killGhoul(t, s, playerID)
	assert.Equal(t, 45, gearOf(t, delver).AttackSpeedPercent, "a fourth kill keeps three stacks")

	// the fourth kill was 0.5 s ago: the timer was reset by it
	tickFor(s, 3.4)
	assert.Equal(t, 45, gearOf(t, delver).AttackSpeedPercent, "still within 4 s of the last kill")

	tickFor(s, 0.2)
	assert.Equal(t, 0, gearOf(t, delver).AttackSpeedPercent, "gone 4 s after the last kill")
}

// The frenzy shortens the next cooldown: attack speed divides it.
func TestRun_Wightfang_FrenzyShortensTheNextCooldown(t *testing.T) {
	s := coopRun(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	wearing(t, s, delver, inWeaponSlot, wightfang())
	killGhoul(t, s, playerID)

	g := frailGhoul(s, 545, 500)
	require.NoError(t, s.handleAttack(playerID, g.ID))
	tick(s)

	cc, ok := delver.GetComponent(ecs.ComponentTypeCooldown)
	require.True(t, ok)
	assert.InDelta(t, 0.5/1.15, cc.(*components.CooldownComponent).Remaining[components.AttackTargeted], 1e-9)
}

// Frenzy counts inside the +50% attack speed cap with the affixes.
// FS-4R9M9 §Requirements 40.
func TestRun_Wightfang_FrenzyStaysInsideTheAttackSpeedCap(t *testing.T) {
	s := coopRun(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	fang := wightfang()
	fang.Affixes = []types.Affix{{Stat: types.AffixAttackSpeed, Tier: 0, Value: 6}}
	wearing(t, s, delver, inWeaponSlot, fang)

	for range 3 {
		killGhoul(t, s, playerID)
	}

	assert.Equal(t, AttackSpeedCapPercent, gearOf(t, delver).AttackSpeedPercent, "6 + 45 is capped at 50")
}

// Unequipped during a frenzy: the stacks give nothing until a Wightfang is worn
// again, and still expire on their timer. FS-4R9M9 §Edge States.
func TestRun_Wightfang_UnequipDuringFrenzy_GivesNothingAndExpires(t *testing.T) {
	s := coopRun(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	fang := wearing(t, s, delver, inWeaponSlot, wightfang())
	killGhoul(t, s, playerID)
	ec, _ := delver.GetComponent(ecs.ComponentTypeEquipment)
	equipment := ec.(*components.EquipmentComponent)

	equipment.WeaponSlot = nil
	tick(s)
	assert.Equal(t, 0, gearOf(t, delver).AttackSpeedPercent, "unworn: nothing")

	equipment.WeaponSlot = &fang
	tick(s)
	assert.Equal(t, 15, gearOf(t, delver).AttackSpeedPercent, "worn again within the timer")

	equipment.WeaponSlot = nil
	tickFor(s, 4)
	equipment.WeaponSlot = &fang
	tick(s)
	assert.Equal(t, 0, gearOf(t, delver).AttackSpeedPercent, "expired on its timer while unworn")
}

// A kill without Wightfang worn adds no stack: wearing it afterwards gives nothing.
func TestRun_KillWithoutWightfang_AddsNoStack(t *testing.T) {
	s := coopRun(t)
	playerID, delver := placeDelver(t, s, "warrior", 500, 500)
	killGhoul(t, s, playerID)

	wearing(t, s, delver, inWeaponSlot, wightfang())
	tick(s)

	assert.Equal(t, 0, gearOf(t, delver).AttackSpeedPercent)
}

// The Hollow Crown: a kill restores max(1, round(4% × max health)), never above
// max. FS-4R9M9 §Requirements 33.
func TestRun_HollowCrown_KillHeals(t *testing.T) {
	tests := []struct {
		name         string
		max, current int
		wantCurrent  int
	}{
		{"4% of max", 120, 60, 65}, // round(4.8) = 5
		{"never above max", 120, 118, 120},
		{"at least 1", 10, 5, 6}, // round(0.4) = 0 → 1
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			playerID, delver := placeDelver(t, s, "warrior", 500, 500)
			wearing(t, s, delver, inHeadSlot, hollowCrown())
			tick(s) // the gear seats
			health := healthComponent(t, delver)
			health.MaxHealth, health.CurrentHealth = tt.max, tt.current

			g := frailGhoul(s, 545, 500)
			require.NoError(t, s.handleAttack(playerID, g.ID))
			tick(s)

			require.Equal(t, 0, currentHealth(g))
			assert.Equal(t, tt.wantCurrent, health.CurrentHealth)
		})
	}
}

// Kill records reach the consumer from any killer state: a dead, escaped or
// unknown wearer gets nothing, and the effect applies once however many
// crowns are worn. FS-4R9M9 §Requirements 29, 38.
func TestUniqueEffects_KillHeal_OnlyAnInPlayWearerOnce(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(t *testing.T, delver *ecs.Entity)
		want    int
	}{
		{"alive", func(*testing.T, *ecs.Entity) {}, 65},
		{"dead", func(t *testing.T, d *ecs.Entity) { healthComponent(t, d).CurrentHealth = 0 }, 0},
		{"escaped", func(t *testing.T, d *ecs.Entity) { markEscaped(t, d) }, 60},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			_, delver := placeDelver(t, s, "warrior", 500, 500)
			wearing(t, s, delver, inHeadSlot, hollowCrown())
			wearing(t, s, delver, inRing1Slot, hollowCrown()) // a second copy, as if worn twice
			tick(s)
			health := healthComponent(t, delver)
			health.MaxHealth, health.CurrentHealth = 120, 60
			tt.resolve(t, delver)

			s.publishKills([]systems.KillRecord{ghoulKilledBy(memberOf(t, delver))})

			assert.Equal(t, tt.want, health.CurrentHealth)
		})
	}
}

// Ring of the Last King on floor 3: +2 to each attribute; two worn, still +2.
// FS-4R9M9 §Requirements 29, 37; §Edge States "Two Rings of the Last King".
func TestRun_RingOfTheLastKing_AddsFloorsClimbedToEachAttribute(t *testing.T) {
	for _, rings := range []int{1, 2} {
		s := coopRun(t)
		_, delver := placeDelver(t, s, "warrior", 500, 500)
		wearing(t, s, delver, inRing1Slot, lastKing())
		if rings == 2 {
			wearing(t, s, delver, inRing2Slot, lastKing())
		}
		currentFloor(t, s).Depth = 3

		tick(s)

		gear := gearOf(t, delver)
		assert.Equal(t, 2, gear.Strength, "%d rings", rings)
		assert.Equal(t, 2, gear.Agility)
		assert.Equal(t, 2, gear.Intelligence)
		assert.Equal(t, 2, gear.Vitality)
	}
}

// On the first floor nothing has been climbed; in the HUB there are no floors.
func TestStep_RingOfTheLastKing_NothingOnFloorOneOrInTheHub(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "warrior", 500, 500)
	wearing(t, s, delver, inRing1Slot, lastKing())
	tick(s)
	assert.Equal(t, 0, gearOf(t, delver).Strength, "floor 1")

	hub := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, HubBounds())
	_, hubDelver := placeDelver(t, hub, "warrior", 500, 500)
	wearing(t, hub, hubDelver, inRing1Slot, lastKing())
	tick(hub)
	assert.Equal(t, 0, gearOf(t, hubDelver).Strength, "hub")
}
