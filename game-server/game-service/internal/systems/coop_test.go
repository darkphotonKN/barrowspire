package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fight ticks projectiles and combat together, the way a session does, for n ticks.
func fight(em *ecs.EntityManager, playerDamage PlayerDamage, n int) {
	combat := NewCombatSystem(em, neverCrit, playerDamage, testUniqueEffects)
	projectile := NewProjectileSystem(em, playerDamage)

	for i := 0; i < n; i++ {
		impacts := projectile.Update(tickSeconds, em.GetAllEntities())
		combat.Update(tickSeconds, em.GetAllEntities(), impacts)
	}
}

func cooldownOf(e *ecs.Entity, kind components.AttackKind) float64 {
	c, _ := e.GetComponent(ecs.ComponentTypeCooldown)
	return c.(*components.CooldownComponent).Remaining[kind]
}

func escapeDelver(e *ecs.Entity) {
	c, _ := e.GetComponent(ecs.ComponentTypePlayer)
	c.(*components.PlayerComponent).Escape = true
}

func killDelver(e *ecs.Entity) {
	c, _ := e.GetComponent(ecs.ComponentTypeHealth)
	h := c.(*components.HealthComponent)
	h.CurrentHealth = 0
	h.IsEliminated = true
}

// monsterStrike is a monster's hit, aimed at nobody in particular.
func monsterStrike() components.AttackSnapshot {
	return components.AttackSnapshot{
		DamageType:  components.DamagePhysical,
		Power:       20,
		Coefficient: 1,
		FromMonster: true,
	}
}

var delverAttacks = []struct {
	name   string
	intent func(target *ecs.Entity) components.AttackIntent
}{
	{"targeted attack", func(target *ecs.Entity) components.AttackIntent {
		return components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID}
	}},
	{"slash", func(*ecs.Entity) components.AttackIntent {
		return components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100}
	}},
	{"arrow", func(*ecs.Entity) components.AttackIntent {
		return components.AttackIntent{Kind: components.AttackArrow, TargetX: 200, TargetY: 100}
	}},
	{"fireball", func(*ecs.Entity) components.AttackIntent {
		return components.AttackIntent{Kind: components.AttackFireball, TargetX: 200, TargetY: 100}
	}},
}

// Player damage off, the default: no delver action damages another delver.
// FS-77AB6 §Requirements 12.
func TestCombatSystem_PlayerDamageOff_DelversNeverDamageDelvers(t *testing.T) {
	for _, tt := range delverAttacks {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			ally := delver(em, 140, 100)

			intend(attacker, tt.intent(ally))
			fight(em, PlayerDamageOff, 30)

			assert.Equal(t, 150, health(ally))
		})
	}
}

// The code is kept, not deleted: switched on, the same actions land through the formula.
func TestCombatSystem_PlayerDamageOn_DelversDamageDelvers(t *testing.T) {
	for _, tt := range delverAttacks {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			rival := delver(em, 140, 100)

			intend(attacker, tt.intent(rival))
			fight(em, PlayerDamageOn, 30)

			assert.Less(t, health(rival), 150)
		})
	}
}

// A targeted attack on a delver does nothing at all: it starts no cooldown.
func TestCombatSystem_PlayerDamageOff_TargetedAttackOnDelverStartsNoCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	ally := delver(em, 140, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: ally.ID})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Zero(t, cooldownOf(attacker, components.AttackTargeted))
}

// Off, a delver's projectile passes through another delver to whatever lies beyond.
func TestProjectileSystem_PlayerDamageOff_PassesThroughDelvers(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	ally := delver(em, 160, 100)
	beyond := dummy(em, 260, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackArrow, TargetX: 400, TargetY: 100})
	fight(em, PlayerDamageOff, 60)

	assert.Equal(t, 150, health(ally))
	assert.Less(t, health(beyond), 1000, "the arrow flew on and struck what was beyond")
}

// Monsters still hurt delvers with player damage off.
func TestCombatSystem_PlayerDamageOff_MonstersStillDamageDelvers(t *testing.T) {
	em := ecs.NewEntityManager()
	victim := delver(em, 100, 100)

	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: monsterStrike(), TargetEntityID: victim.ID},
	})

	assert.Less(t, health(victim), 150)
}

// An escaped delver is out of play: nothing damages it, and projectiles pass it by.
// FS-77AB6 §Requirements 17.
func TestCombatSystem_EscapedDelverCannotBeDamaged(t *testing.T) {
	em := ecs.NewEntityManager()
	escaped := delver(em, 100, 100)
	escapeDelver(escaped)

	NewCombatSystem(em, neverCrit, PlayerDamageOn, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: monsterStrike(), TargetEntityID: escaped.ID},
	})

	assert.Equal(t, 150, health(escaped))
}

func TestProjectileSystem_PassesThroughEscapedDelvers(t *testing.T) {
	em := ecs.NewEntityManager()
	escaped := delver(em, 50, 0)
	escapeDelver(escaped)

	shot := em.CreateEntity()
	shot.AddComponent(components.NewTransformComponent(0, 0))
	shot.AddComponent(components.NewVelocityComponent(100, 0, 100))
	shot.AddComponent(components.NewProjectileComponent(monsterStrike(), 100, 500, 10, "arrow"))

	impacts := NewProjectileSystem(em, PlayerDamageOn).Update(0.35, em.GetAllEntities())

	assert.Empty(t, impacts)
	_, stillFlying := em.GetEntity(shot.ID)
	assert.True(t, stillFlying)
}

// A resolved delver's queued attacks are never resolved: it is out of play.
func TestCombatSystem_ResolvedAttackerIntentsAreDropped(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(*ecs.Entity)
	}{
		{"dead", killDelver},
		{"escaped", escapeDelver},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			target := dummy(em, 140, 100)

			intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
			tt.resolve(attacker)
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			assert.Equal(t, 1000, health(target))
			c, _ := attacker.GetComponent(ecs.ComponentTypeAttackIntent)
			require.Empty(t, c.(*components.AttackIntentComponent).Pending, "nothing is left queued for later")
		})
	}
}
