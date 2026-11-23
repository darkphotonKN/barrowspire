package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// FS-MQYEX §Change: An attack cancels the timed open, R28–R30 and E1.
// I-MQYEX-7.

// Attackers is the bodies whose cast went off on the tick, whether or not it
// hit anything; one refused for its cooldown, its cost, a pin, a tree ability
// not held, or (a targeted attack) nothing in range is not among them.
func TestCombatSystem_Attackers_AreTheCastsThatWentOff(t *testing.T) {
	tests := []struct {
		name    string
		arrange func(em *ecs.EntityManager, e *ecs.Entity) components.AttackIntent
		wentOff bool
	}{
		{"a targeted attack that lands", func(em *ecs.EntityManager, _ *ecs.Entity) components.AttackIntent {
			return components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: dummy(em, 150, 100).ID}
		}, true},
		{"a slash at nothing", func(*ecs.EntityManager, *ecs.Entity) components.AttackIntent {
			return components.AttackIntent{Kind: components.AttackSlash, TargetX: 100, TargetY: 400}
		}, true},
		{"a dash", func(*ecs.EntityManager, *ecs.Entity) components.AttackIntent {
			return components.AttackIntent{Kind: components.AttackDash, TargetX: 100, TargetY: 400}
		}, true},
		{"a targeted attack with nothing in range", func(em *ecs.EntityManager, _ *ecs.Entity) components.AttackIntent {
			return components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: dummy(em, 300, 100).ID}
		}, false},
		{"on cooldown", func(_ *ecs.EntityManager, e *ecs.Entity) components.AttackIntent {
			cc, _ := e.GetComponent(ecs.ComponentTypeCooldown)
			cc.(*components.CooldownComponent).Remaining[components.AttackSlash] = 5
			return components.AttackIntent{Kind: components.AttackSlash, TargetX: 100, TargetY: 400}
		}, false},
		{"too little resource", func(_ *ecs.EntityManager, e *ecs.Entity) components.AttackIntent {
			resourceOf(e).Current = 0
			return components.AttackIntent{Kind: components.AttackDash, TargetX: 100, TargetY: 400}
		}, false},
		{"pinned", func(_ *ecs.EntityManager, e *ecs.Entity) components.AttackIntent {
			startAttackPin(e, 5)
			return components.AttackIntent{Kind: components.AttackSlash, TargetX: 100, TargetY: 400}
		}, false},
		{"a tree ability not held", func(*ecs.EntityManager, *ecs.Entity) components.AttackIntent {
			return components.AttackIntent{Kind: components.AttackEarthbreaker}
		}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			intend(attacker, tt.arrange(em, attacker))
			combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

			combat.Update(tickSeconds, em.GetAllEntities(), nil)

			if tt.wentOff {
				assert.Equal(t, []uuid.UUID{attacker.ID}, combat.Attackers())
			} else {
				assert.Empty(t, combat.Attackers())
			}
			combat.Update(tickSeconds, em.GetAllEntities(), nil)
			assert.Empty(t, combat.Attackers(), "a tick with no cast has none")
		})
	}
}

// A parry cast is among the attackers on the tick it raises the stance, once
// however many were queued, and not while the stance is open or locked out.
func TestCombatSystem_Attackers_AParryThatRaisesTheStance(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := parryMerc(w.em, 100, 100)

	castParry(merc)
	castParry(merc)
	w.tick()
	assert.Equal(t, []uuid.UUID{merc.ID}, w.combat.Attackers(), "raised")

	castParry(merc)
	w.tick()
	assert.True(t, parryOf(merc).Open)
	assert.Empty(t, w.combat.Attackers(), "refused while open")

	for parryOf(merc).LockoutRemaining == 0 {
		w.tick()
	}
	castParry(merc)
	w.tick()
	assert.False(t, parryOf(merc).Open)
	assert.Empty(t, w.combat.Attackers(), "refused while locked out")
}

// What an earlier cast left behind is no attack of this tick: a projectile
// impact resolved in it puts nobody among the attackers. E3.
func TestCombatSystem_Attackers_NotAnEarlierCastsImpact(t *testing.T) {
	em := ecs.NewEntityManager()
	shooter := delver(em, 100, 100)
	target := dummy(em, 150, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	attack := combat.snapshot(shooter, attackTable[components.AttackFireball])

	combat.Update(tickSeconds, em.GetAllEntities(), []Impact{{Attack: attack, TargetEntityID: target.ID}})

	assert.Less(t, health(target), 1000, "the impact landed")
	assert.Empty(t, combat.Attackers())
}

// Attackers hands out a copy: what the caller does with it leaves the
// combat's own record as it was.
func TestCombatSystem_Attackers_IsACopy(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	intend(attacker, components.AttackIntent{Kind: components.AttackSlash, TargetX: 100, TargetY: 400})
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	combat.Update(tickSeconds, em.GetAllEntities(), nil)

	got := combat.Attackers()
	got[0] = uuid.New()

	assert.Equal(t, []uuid.UUID{attacker.ID}, combat.Attackers())
}
