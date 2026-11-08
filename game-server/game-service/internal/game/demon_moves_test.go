package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The claw is sheet data: a spawned demon, green or blood, carries both moves'
// numbers, its slam ready; every other archetype carries none of them.
// FS-VHGE7 §B R15, R18, R19, R24.
func TestCreateMonsterEntity_OnlyTheDemonsCarryTheClaw(t *testing.T) {
	tests := []struct {
		archetype components.MonsterArchetype
		claw      bool
	}{
		{components.MonsterArchetypeDemon, true},
		{components.MonsterArchetypeBloodDemon, true},
		{components.MonsterArchetypeGhoul, false},
		{components.MonsterArchetypeTroll, false},
		{components.MonsterArchetypeBoar, false},
		{components.MonsterArchetypeZombie, false},
		{components.MonsterArchetypeGhost, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.archetype), func(t *testing.T) {
			m := monsterOf(CreateMonsterEntity(ecs.NewEntityManager(), MonsterConfig{Archetype: tt.archetype, Level: 1}))

			assert.Equal(t, tt.claw, m.Claw)
			assert.Zero(t, m.SlamCooldownRemaining, "a fresh monster's first swing is its slam or strike")
			assert.Zero(t, m.ClawShowRemaining)
			if !tt.claw {
				assert.Zero(t, m.SlamCooldown)
				assert.Zero(t, m.SlamMultiplier)
				assert.Zero(t, m.ClawShowFor)
				return
			}
			assert.Equal(t, DemonSlamCooldown, m.SlamCooldown)
			assert.Equal(t, SlamDamageMultiplier, m.SlamMultiplier)
			assert.Equal(t, ClawShowFor, m.ClawShowFor)
		})
	}
}

// Level-1 demons hit for their moves' numbers, unmitigated: the slam at twice
// the level damage, the claw at once. FS-VHGE7 §B R16, R17.
func TestDemonMoves_LevelOneDamage(t *testing.T) {
	tests := []struct {
		archetype  components.MonsterArchetype
		slam, claw int
	}{
		{components.MonsterArchetypeDemon, 56, 28},
		{components.MonsterArchetypeBloodDemon, 68, 34},
	}

	for _, tt := range tests {
		t.Run(string(tt.archetype), func(t *testing.T) {
			em := ecs.NewEntityManager()
			CreateMonsterEntity(em, MonsterConfig{Archetype: tt.archetype, Level: 1, Boss: true, X: 500, Y: 500})
			target := unarmoredDelver(em, 560, 500)

			ai := systems.NewMonsterAISystem(func() float64 { return 0.25 }, nil)
			combat := systems.NewCombatSystem(em, func() float64 { return 0.999 }, systems.PlayerDamageOff, UniqueEffects)
			var landed []int
			for range 60 * 3 { // the slam, then the claw at 1.6 s
				before := currentHealth(target)
				entities := em.GetAllEntities()
				ai.Update(1.0/60, entities)
				combat.Update(1.0/60, entities, nil)
				if lost := before - currentHealth(target); lost > 0 {
					landed = append(landed, lost)
				}
			}

			require.Len(t, landed, 2)
			assert.Equal(t, tt.slam, landed[0], "the slam")
			assert.Equal(t, tt.claw, landed[1], "the claw")
		})
	}
}

// unarmoredDelver is a delver in play with no defense and health to spare.
func unarmoredDelver(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Wren", false))
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewHealthComponent(10000, 10000))
	e.AddComponent(&components.CombatComponent{})
	return e
}

// Every sheet that claws shows the claw for well under its attack interval, so
// its action always leaves `claw` between swings: the client replays the claw
// only on a turn into `claw`, and a show as long as the interval would run two
// claws together as one. FS-VHGE7 §B R24.
func TestMonsterSheets_ClawShowEndsWellBeforeTheNextSwing(t *testing.T) {
	clawing := 0
	for archetype, sheet := range monsterSheets {
		if !sheet.Moves.Claw {
			continue
		}
		clawing++
		t.Run(string(archetype), func(t *testing.T) {
			assert.Positive(t, sheet.Moves.ClawShowFor, "a claw is shown at all")
			assert.LessOrEqual(t, sheet.Moves.ClawShowFor, sheet.AttackInterval/2,
				"show %.2f s against an interval of %.2f s", sheet.Moves.ClawShowFor, sheet.AttackInterval)
		})
	}
	assert.Positive(t, clawing, "some sheet claws")
}

// A delver's attack and skill requests never carry a Coefficient: only the
// monster AI sets one, on a demon's slam. FS-VHGE7 §B R16.
func TestSession_DelverIntents_CarryNoCoefficient(t *testing.T) {
	tests := []struct {
		name string
		act  func(s *Session, playerID, target uuid.UUID) error
	}{
		{"attack", func(s *Session, p, target uuid.UUID) error { return s.handleAttack(p, target) }},
		{"cast_skill", func(s *Session, p, _ uuid.UUID) error { return s.handleCastSkill(p, "slash", 600, 500) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := coopRun(t)
			playerID, delver := placeDelver(t, s, "warrior", 500, 500)
			target := unarmoredTarget(s, 540, 500)

			require.NoError(t, tt.act(s, playerID, target.ID))

			ic, _ := delver.GetComponent(ecs.ComponentTypeAttackIntent)
			pending := ic.(*components.AttackIntentComponent).Pending
			require.Len(t, pending, 1)
			assert.Zero(t, pending[0].Coefficient)
		})
	}
}
