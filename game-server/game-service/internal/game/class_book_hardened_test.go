package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R53, R54 (and "Reconciled at wave 2"). I-X2CMM-18.

// harden sets hardened on the delver for its full 10 s, as a cast Hardened
// does.
func harden(t *testing.T, delver *ecs.Entity) {
	t.Helper()
	bookOf(t, delver).States[components.BookStateHardened] = 10
}

// A hardened delver stepping onto an armed spike plate, dart wall or fire jet
// takes nothing from it, while a twin's queued trap hit still lands; the trap
// still fires. R53.
func TestTrap_AHardenedDelverTakesNothingFromItsHit(t *testing.T) {
	for _, kind := range []components.TrapKind{components.TrapSpikePlate, components.TrapDartWall, components.TrapFireJet} {
		t.Run(string(kind), func(t *testing.T) {
			s, ids := trapsRun(t, 7, 2)
			trap := firstTrapAs(t, s, kind)
			stepper, twin := delverEntity(t, s, ids[0]), delverEntity(t, s, ids[1])
			harden(t, stepper)
			before := currentHealth(stepper)

			standOn(t, s, stepper, trapOf(trap).Cell)
			s.hitByTrap(trap.ID, twin, trapFactors[kind])
			tick(s)

			assert.Equal(t, before, currentHealth(stepper), "hardened, the trap deals nothing")
			assert.Less(t, currentHealth(twin), before, "the unhardened twin is hit")
			assert.False(t, trapOf(trap).Armed, "the trap still fired")
		})
	}
}

// A hardened delver coming into a gas vent's cloud is not poisoned; the vent
// still puffs. R53.
func TestTrap_GasVentDoesNotPoisonAHardenedDelver(t *testing.T) {
	s, ids := trapsRun(t, 7, 1)
	vent := firstTrapAs(t, s, components.TrapGasVent)
	delver := delverEntity(t, s, ids[0])
	harden(t, delver)

	beside(t, s, delver, trapOf(vent).Cell)
	tick(s)

	assert.True(t, trapOf(vent).Puffed)
	assert.Zero(t, poisonedFor(delver), "hardened, no poison takes hold")
}

// A lever pulled out of turn fires its dart volley at a hardened puller for
// nothing; the levers still spring back up. R53, "Reconciled at wave 2".
func TestLeverOrder_OutOfTurn_AHardenedPullerTakesNothing(t *testing.T) {
	s, player, sender := sealedRun(t, 7, forcedSeal(components.SealLeverOrder))
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	levers := leversInTurn(t, s)
	delver := delverEntity(t, s, player)
	harden(t, delver)
	health := currentHealth(delver)

	pull(t, s, player, levers[2])
	tick(s)

	assert.Equal(t, RefusalLeverWrong, lastReply(t, sender, player)["reason"])
	assert.Equal(t, health, currentHealth(delver), "hardened, the darts deal nothing")
}

// A poisoned teammate drinking the archer's draught is cured on the drink,
// and its heal runs with no poison against it. R54.
func TestHandleInteract_DrinkingADraughtCuresPoison(t *testing.T) {
	s := unstartedRun(t)
	archer, _ := placeDelverAt(t, s, "archer", 9, 500, 500)
	mate, mateBody := placeDelverAt(t, s, "warrior", 9, 540, 520)
	draught := brew(t, s, archer)
	wound(mateBody, 100, 200)
	systems.Poison(mateBody, PoisonDuration)
	require.Positive(t, poisonedFor(mateBody))

	require.NoError(t, s.handleInteract(mate, draught.ID))
	assert.Zero(t, poisonedFor(mateBody), "cured on the drink")

	ticks(s, castTicks(6))
	assert.Equal(t, 160, healthOf(t, s, mate), "100 + 30 % of 200, no poison against it")
}
