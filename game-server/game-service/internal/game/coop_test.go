package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// coopRun is an unstarted run with its run-level entity, whose end signal is
// buffered so a test can tick past a delver's death.
func coopRun(t *testing.T) *Session {
	t.Helper()

	s := unstartedRun(t)
	s.InitialSystems()
	s.endSessionCh = make(chan bool, 64)

	return s
}

// switchPlayerDamage rebuilds the run's switch as if it had been set at world
// build, crits still pinned off.
func switchPlayerDamage(s *Session, playerDamage systems.PlayerDamage) {
	s.playerDamage = playerDamage
	s.combatSystem = systems.NewCombatSystem(s.EntityManager, func() float64 { return 0.999 }, playerDamage, UniqueEffects)
}

func kill(t *testing.T, delver *ecs.Entity) {
	t.Helper()
	hc, ok := delver.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	hc.(*components.HealthComponent).CurrentHealth = 0
}

func markEscaped(t *testing.T, delver *ecs.Entity) {
	t.Helper()
	pc, ok := delver.GetComponent(ecs.ComponentTypePlayer)
	require.True(t, ok)
	pc.(*components.PlayerComponent).Escape = true
}

// The run's end is signalled exactly once, however many ticks follow it.
// FS-77AB6 §Requirements 16, FS-QG1HR D5.
func TestRun_PartyResolved_EndSignalledOnceAcrossTicks(t *testing.T) {
	s := coopRun(t)
	_, first := placeDelver(t, s, "warrior", 300, 300)
	_, second := placeDelver(t, s, "archer", 600, 300)

	kill(t, first)
	for i := 0; i < 5; i++ {
		tick(s)
	}
	require.Empty(t, s.endSessionCh, "a two-delver run continues after one dies")

	markEscaped(t, second)
	for i := 0; i < 10; i++ {
		tick(s)
	}
	assert.Len(t, s.endSessionCh, 1)
}

func TestRun_OneDelver_DoesNotEndUntilThatDelverResolves(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "mage", 300, 300)

	for i := 0; i < 5; i++ {
		tick(s)
	}
	require.Empty(t, s.endSessionCh, "a one-delver run must not end at once")

	kill(t, delver)
	tick(s)
	assert.Len(t, s.endSessionCh, 1)
}

// endSession is reachable from more than one path (the rules, the last delver
// disconnecting), so a second Shutdown must be a no-op, not a close of closed
// channels. FS-QG1HR D5.
func TestSession_ShutdownTwice_IsIdempotent(t *testing.T) {
	s := unstartedRun(t)
	s.isRunning = true

	s.Shutdown()

	assert.NotPanics(t, s.Shutdown)
}

// Runs are co-op unless a world is built otherwise. FS-77AB6 §Requirements 12.
func TestRun_PlayerDamageIsOffByDefault(t *testing.T) {
	s, attacker, target := worldWithTwoDelvers(t, RunBounds())
	require.Equal(t, systems.PlayerDamageOff, s.playerDamage)
	before := healthOf(t, s, target)

	require.NoError(t, s.handleAttack(attacker, s.playerIDToEntitiesID[target]))
	require.NoError(t, s.handleCastSkill(attacker, "slash", 600, 500))
	for i := 0; i < 5; i++ {
		tick(s)
	}

	assert.Equal(t, before, healthOf(t, s, target))
}

// Co-op changes damage, not bodies: delvers still push each other.
// FS-77AB6 §Requirements 13.
func TestRun_DelversStillCollide(t *testing.T) {
	s := coopRun(t)
	_, walker := placeDelver(t, s, "warrior", 500, 500)
	_, stander := placeDelver(t, s, "mage", 545, 500)

	vc, _ := walker.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX = 1
	for i := 0; i < 15; i++ {
		tick(s)
	}

	gap := transformOf(t, stander).X - transformOf(t, walker).X
	assert.GreaterOrEqual(t, gap, 2*constants.PlayerRadius-0.01, "the walker passed into the other delver")
}

// A dead or escaped delver is out of play: its gameplay actions are refused.
// FS-77AB6 §Requirements 17.
func TestRun_ResolvedDelver_ActionsAreRefused(t *testing.T) {
	resolutions := []struct {
		name    string
		resolve func(*testing.T, *ecs.Entity)
	}{
		{"dead", func(t *testing.T, e *ecs.Entity) { kill(t, e); markEliminated(t, e) }},
		{"escaped", markEscaped},
	}
	actions := []struct {
		name string
		act  func(s *Session, playerID uuid.UUID, target uuid.UUID) error
	}{
		{"move", func(s *Session, p, _ uuid.UUID) error { return s.handleMove(p, 1, 0) }},
		{"attack", func(s *Session, p, target uuid.UUID) error { return s.handleAttack(p, target) }},
		{"cast_skill", func(s *Session, p, _ uuid.UUID) error { return s.handleCastSkill(p, "slash", 600, 500) }},
		{"interact", func(s *Session, p, target uuid.UUID) error { return s.handleInteract(p, target) }},
	}

	for _, r := range resolutions {
		for _, a := range actions {
			t.Run(r.name+" "+a.name, func(t *testing.T) {
				s := coopRun(t)
				playerID, delver := placeDelver(t, s, "warrior", 500, 500)
				target := unarmoredTarget(s, 540, 500)
				r.resolve(t, delver)

				err := a.act(s, playerID, target.ID)

				assert.ErrorIs(t, err, ErrDelverOutOfPlay)
				vc, _ := delver.GetComponent(ecs.ComponentTypeVelocity)
				assert.Zero(t, vc.(*components.VelocityComponent).VX, "a refused move moves nobody")
				ic, _ := delver.GetComponent(ecs.ComponentTypeAttackIntent)
				assert.Empty(t, ic.(*components.AttackIntentComponent).Pending, "a refused attack arms nothing")
			})
		}
	}
}

// Monsters cannot damage a delver who has escaped. FS-77AB6 §Requirements 17.
func TestRun_EscapedDelver_CannotBeDamagedByMonsters(t *testing.T) {
	s := coopRun(t)
	_, delver := placeDelver(t, s, "warrior", 500, 500)
	markEscaped(t, delver)
	tick(s) // seated: the gear pass brings them to full, Vitality included
	before := currentHealth(delver)

	ghoul := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: 540, Y: 500})
	intents := components.NewAttackIntentComponent()
	intents.Pending = []components.AttackIntent{{Kind: components.AttackTargeted, TargetEntityID: delver.ID}}
	ghoul.AddComponent(intents)

	tick(s)

	assert.Equal(t, before, currentHealth(delver))
}

func markEliminated(t *testing.T, delver *ecs.Entity) {
	t.Helper()
	hc, ok := delver.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	hc.(*components.HealthComponent).IsEliminated = true
}

// A delver who resolves mid-stride stops where they are: their move is refused
// from then on, so nothing else would ever stop them.
func TestRun_ResolvedDelver_StopsMoving(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(t *testing.T, s *Session, playerID uuid.UUID, delver *ecs.Entity)
	}{
		{"dies", func(t *testing.T, _ *Session, _ uuid.UUID, delver *ecs.Entity) { kill(t, delver) }},
		{"escapes", func(_ *testing.T, s *Session, playerID uuid.UUID, _ *ecs.Entity) { s.handlePlayerEscape(playerID) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			playerID, delver := placeDelver(t, s, "warrior", 500, 500)
			require.NoError(t, s.handleMove(playerID, 1, 0))
			tick(s)

			tt.resolve(t, s, playerID, delver)
			tick(s) // the tick it resolves on
			stoppedAt := transformOf(t, delver).X
			for i := 0; i < 5; i++ {
				tick(s)
			}

			assert.Equal(t, stoppedAt, transformOf(t, delver).X)
		})
	}
}

// The last delver disconnecting tears the run down without the rules: cleanup
// removes their body and shuts the world. A tick already in flight then sees
// nobody in play and must not signal the end on the closed channel. A panic
// there takes every world in the process with it (ADR-0015). FS-77AB6
// §Requirements 16.
func TestRun_LastDelverDisconnects_TickInFlightDoesNotPanic(t *testing.T) {
	s := unstartedRun(t)
	s.InitialSystems()
	s.isRunning = true
	playerID, _ := placeDelver(t, s, "warrior", 300, 300)
	tick(s)

	s.RemovePlayer(playerID.String())
	s.Shutdown()

	assert.NotPanics(t, func() { tick(s) })
}
