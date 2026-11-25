package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fightingAlly is a hired ally of hirer at (x, y) with a sheet's hit of
// attack: its combat, its intents and its fighting.
func fightingAlly(em *ecs.EntityManager, x, y float64, hirer uuid.UUID, attack int) *ecs.Entity {
	e := encounterNPC(em, x, y, components.StanceAlly)
	nc, _ := e.GetComponent(ecs.ComponentTypeEncounterNPC)
	nc.(*components.EncounterNPCComponent).HirerID = hirer
	e.AddComponent(&components.CombatComponent{Attack: attack})
	e.AddComponent(components.NewAttackIntentComponent())
	e.AddComponent(&components.AllyComponent{AttackRange: 50, AttackInterval: 1})
	vc, _ := e.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).Speed = 190
	return e
}

// FS-4EC7Z §C R9, R11: an ally's strike lands on a monster through the hit
// path, the monster's mitigation applied, and the monster turns on it; its
// killing blow is a kill record naming the hirer as the killer, by an ally.
func TestCombatSystem_AnAllysStrike_LandsOnAMonster_CreditsTheHirer(t *testing.T) {
	em := ecs.NewEntityManager()
	hirer := uuid.New()
	a := fightingAlly(em, 100, 100, hirer, 20)
	g := hunter(em, 140, 100)
	combat := &components.CombatComponent{Attack: 6, Defense: 40}
	g.AddComponent(combat)
	healthOf(g).CurrentHealth, healthOf(g).MaxHealth = 100, 100

	intend(a, components.AttackIntent{Kind: components.AttackAllyStrike, TargetEntityID: g.ID})
	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Empty(t, kills)
	dealt := 100 - health(g)
	want, _ := ResolveDamage(components.AttackSnapshot{Power: 20, Coefficient: 1, DamageType: components.DamagePhysical}, Mitigation{Defense: 40}, neverCrit())
	assert.Equal(t, want, dealt, "the monster's mitigation applies")
	assert.Less(t, dealt, 20)
	assert.Equal(t, a.ID, monster(g).LastAttacker, "it turns on the ally")

	healthOf(g).CurrentHealth = 1
	intend(a, components.AttackIntent{Kind: components.AttackAllyStrike, TargetEntityID: g.ID})
	kills = NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)
	require.Len(t, kills, 1)
	assert.Equal(t, hirer, kills[0].KillerMemberID, "the hirer's kill for loot")
	assert.True(t, kills[0].ByAlly, "made by an ally")
}

// FS-4EC7Z §C R9: an ally's strike lands only on a monster: never on a
// delver, an encounter NPC or anything else.
func TestCombatSystem_AnAllysStrike_LandsOnNothingButAMonster(t *testing.T) {
	for _, c := range []struct {
		name   string
		target func(em *ecs.EntityManager) *ecs.Entity
	}{
		{"a delver", func(em *ecs.EntityManager) *ecs.Entity { return delver(em, 130, 100) }},
		{"a pilgrim", func(em *ecs.EntityManager) *ecs.Entity { return pilgrim(em, 130, 100) }},
		{"another ally", func(em *ecs.EntityManager) *ecs.Entity { return allyNPC(em, 130, 100) }},
		{"a dummy", func(em *ecs.EntityManager) *ecs.Entity { return dummy(em, 130, 100) }},
	} {
		t.Run(c.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			a := fightingAlly(em, 100, 100, uuid.New(), 20)
			target := c.target(em)
			before := health(target)
			intend(a, components.AttackIntent{Kind: components.AttackAllyStrike, TargetEntityID: target.ID})
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)
			assert.Equal(t, before, health(target))
		})
	}
}
