package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pilgrim stands a peaceful pilgrim of 1000 health at (x, y).
func pilgrim(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	return encounterNPC(em, x, y, components.StancePeaceful)
}

// encounterNPC stands an encounter NPC of 1000 health in stance at (x, y).
func encounterNPC(em *ecs.EntityManager, x, y float64, stance components.EncounterStance) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.EncounterNPCComponent{
		Kind: components.EncounterNPCPilgrim, Stance: stance,
		Action: components.EncounterActionIdle, FacingY: 1,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 0))
	e.AddComponent(components.NewHealthComponent(1000, 1000))
	return e
}

// FS-4EC7Z §A R3: a delver's melee swing at a pilgrim beside them leaves its
// health as it was.
func TestCombatSystem_DelverMeleeOnAPilgrim_DealsNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	p := pilgrim(em, 150, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: p.ID})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 1000, health(p))
}

// FS-4EC7Z §A R3: a delver's area swing passes a pilgrim by and lands on the
// rest of what it covers.
func TestCombatSystem_DelverAreaThroughAPilgrim_HitsOnlyTheRest(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	p := pilgrim(em, 140, 100)
	beside := dummy(em, 130, 125)

	intend(attacker, components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 1000, health(p), "the pilgrim is passed by")
	assert.Less(t, health(beside), 1000, "the dummy beside it is hit")
}

// FS-4EC7Z §A R3: a delver's arrow flies through a pilgrim, spending
// nothing on it, and lands on what stands beyond.
func TestProjectile_DelverShotThroughAPilgrim_FliesOn(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	p := pilgrim(em, 160, 100)
	beyond := dummy(em, 260, 100)

	shot := em.CreateEntity()
	shot.AddComponent(components.NewTransformComponent(120, 100))
	shot.AddComponent(components.NewVelocityComponent(600, 0, 600))
	shot.AddComponent(components.NewProjectileComponent(components.AttackSnapshot{
		AttackerEntityID: attacker.ID, AttackerMemberID: uuid.New(),
		DamageType: components.DamagePhysical, Power: 50, Coefficient: 1,
	}, 600, 1000, 6, "arrow"))

	var impacts []Impact
	for range 30 {
		impacts = append(impacts, NewProjectileSystem(em, PlayerDamageOff).Update(tickSeconds, em.GetAllEntities())...)
	}
	require.NotEmpty(t, impacts)
	for _, impact := range impacts {
		assert.NotEqual(t, p.ID, impact.TargetEntityID, "the pilgrim is never struck")
	}
	assert.Equal(t, beyond.ID, impacts[0].TargetEntityID)
}

// FS-4EC7Z §A R3: a delver's reflected hit and a trap's hit (no member, not a
// monster's) never land on an encounter NPC; a monster's strike does.
func TestCombatSystem_HitsOnAnEncounterNPC_OnlyAMonstersLands(t *testing.T) {
	cases := []struct {
		name   string
		attack components.AttackSnapshot
		lands  bool
	}{
		{"a delver's reflected hit", components.AttackSnapshot{AttackerEntityID: uuid.New(), AttackerMemberID: uuid.New(), TrueDamage: 40}, false},
		{"a trap's hit", components.AttackSnapshot{AttackerEntityID: uuid.New(), DamageType: components.DamagePhysical, Power: 40, Coefficient: 1}, false},
		{"a monster's strike", components.AttackSnapshot{AttackerEntityID: uuid.New(), DamageType: components.DamagePhysical, Power: 40, Coefficient: 1, FromMonster: true, Kind: components.AttackMonsterStrike}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			p := pilgrim(em, 100, 100)
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{{Attack: c.attack, TargetEntityID: p.ID}})
			if c.lands {
				assert.Less(t, health(p), 1000)
			} else {
				assert.Equal(t, 1000, health(p))
			}
		})
	}
}

// FS-4EC7Z §A R3, §D R13: a caged captive is behind bars, not hunted, and
// takes no hit at all: a monster's strike leaves it whole.
func TestCombatSystem_AMonstersStrikeOnACagedCaptive_DealsNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	captive := encounterNPC(em, 100, 100, components.StanceCaged)
	strike := components.AttackSnapshot{AttackerEntityID: uuid.New(), DamageType: components.DamagePhysical, Power: 40, Coefficient: 1, FromMonster: true, Kind: components.AttackMonsterStrike}
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{{Attack: strike, TargetEntityID: captive.ID}})
	assert.Equal(t, 1000, health(captive))
}

// FS-4EC7Z §A R3, §D R13: a monster's shot flies through a caged captive,
// spending nothing on it, and lands on the delver beyond.
func TestProjectile_MonsterShotThroughACagedCaptive_FliesOn(t *testing.T) {
	em := ecs.NewEntityManager()
	captive := encounterNPC(em, 160, 100, components.StanceCaged)
	beyond := delver(em, 260, 100)

	shot := em.CreateEntity()
	shot.AddComponent(components.NewTransformComponent(120, 100))
	shot.AddComponent(components.NewVelocityComponent(600, 0, 600))
	shot.AddComponent(components.NewProjectileComponent(components.AttackSnapshot{
		AttackerEntityID: uuid.New(), FromMonster: true,
		DamageType: components.DamagePhysical, Power: 50, Coefficient: 1,
	}, 600, 1000, 6, "arrow"))

	var impacts []Impact
	for range 30 {
		impacts = append(impacts, NewProjectileSystem(em, PlayerDamageOff).Update(tickSeconds, em.GetAllEntities())...)
	}
	require.NotEmpty(t, impacts)
	for _, impact := range impacts {
		assert.NotEqual(t, captive.ID, impact.TargetEntityID, "the captive is never struck")
	}
	assert.Equal(t, beyond.ID, impacts[0].TargetEntityID)
}

// FS-4EC7Z §A R3: a living encounter NPC is a body of its own kind to the
// ground, in a block's way, holding no plate, pushing no block, firing no
// trap and detecting nothing; a caged one is a captive; a dead one is no body.
func TestBodyKindOf_EncounterNPCs(t *testing.T) {
	em := ecs.NewEntityManager()
	dead := pilgrim(em, 0, 0)
	hc, _ := dead.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	cases := []struct {
		name   string
		entity *ecs.Entity
		want   BodyKind
		hunted bool
	}{
		{"a peaceful pilgrim", pilgrim(em, 0, 0), BodyEncounterNPC, true},
		{"a caged captive", encounterNPC(em, 0, 0, components.StanceCaged), BodyCaptive, false},
		{"a dead pilgrim", dead, BodyNone, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind := BodyKindOf(c.entity)
			assert.Equal(t, c.want, kind)
			assert.Equal(t, c.hunted, kind.Hunted())
			assert.False(t, kind.Weighs())
			assert.False(t, kind.Pushes())
			assert.False(t, kind.FiresTraps())
			assert.False(t, kind.Detects())
		})
	}
	assert.True(t, BodyDelver.Hunted(), "a delver in play is hunted")
	assert.False(t, BodyMonster.Hunted(), "a monster is never hunted")
}

// FS-4EC7Z §A R3: a monster's target choice counts encounter NPCs as it
// counts delvers, the nearest taken; a caged one is never taken.
func TestMonsterAISystem_EncounterNPCs_NearestIsTakenCagedNever(t *testing.T) {
	t.Run("a pilgrim nearer than the delver", func(t *testing.T) {
		em := ecs.NewEntityManager()
		g := hunter(em, 500, 500)
		p := pilgrim(em, 600, 500)
		delver(em, 700, 500)
		think(em)
		assert.Equal(t, p.ID, monster(g).Target)
	})
	t.Run("a delver nearer than the pilgrim", func(t *testing.T) {
		em := ecs.NewEntityManager()
		g := hunter(em, 500, 500)
		pilgrim(em, 700, 500)
		d := delver(em, 600, 500)
		think(em)
		assert.Equal(t, d.ID, monster(g).Target)
	})
	t.Run("a caged captive nearer than the delver", func(t *testing.T) {
		em := ecs.NewEntityManager()
		g := hunter(em, 500, 500)
		encounterNPC(em, 550, 500, components.StanceCaged)
		d := delver(em, 700, 500)
		think(em)
		assert.Equal(t, d.ID, monster(g).Target)
	})
}

// FS-4EC7Z §A R3: a monster that has taken a pilgrim strikes it in reach, and
// the strike lands through the hit path.
func TestMonsterAISystem_StrikesAPilgrim(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	p := pilgrim(em, 530, 500)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	ai := NewMonsterAISystem(firstRoll, nil)
	for range ticks(2) {
		ai.Update(tickSeconds, em.GetAllEntities())
		combat.Update(tickSeconds, em.GetAllEntities(), nil)
	}
	assert.Equal(t, p.ID, monster(g).Target)
	assert.Less(t, health(p), 1000)
}

// FS-4EC7Z §A R3: an encounter NPC killed lies dead, out of the way, for its
// corpse's time and is then removed; no kill record is made for it.
func TestEncounterNPCSystem_TheKilledLieThenGo(t *testing.T) {
	em := ecs.NewEntityManager()
	p := pilgrim(em, 100, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	kills := combat.Update(tickSeconds, em.GetAllEntities(), []Impact{{
		Attack:         components.AttackSnapshot{AttackerEntityID: uuid.New(), FromMonster: true, TrueDamage: 5000},
		TargetEntityID: p.ID,
	}})
	assert.Empty(t, kills, "no experience, no drops: no kill record")

	npcs := NewEncounterNPCSystem(em, 1.0)
	npcs.Update(tickSeconds, em.GetAllEntities())
	nc, _ := p.GetComponent(ecs.ComponentTypeEncounterNPC)
	assert.Equal(t, components.EncounterActionDead, nc.(*components.EncounterNPCComponent).Action)
	assert.False(t, p.HasComponent(ecs.ComponentTypeVelocity), "a corpse collides with nothing")

	for range ticks(1.1) {
		npcs.Update(tickSeconds, em.GetAllEntities())
	}
	_, still := em.GetEntity(p.ID)
	assert.False(t, still, "removed once its corpse has lain")
}

// FS-4EC7Z §F R22: a line is said on the NPC's own clock.
func TestSay_SetsTheLineAtTheNPCsAge(t *testing.T) {
	em := ecs.NewEntityManager()
	p := pilgrim(em, 0, 0)
	NewEncounterNPCSystem(em, 1).Update(0.5, em.GetAllEntities())
	nc, _ := p.GetComponent(ecs.ComponentTypeEncounterNPC)
	npc := nc.(*components.EncounterNPCComponent)
	Say(npc, components.LinePilgrimPlea)
	assert.Equal(t, components.LinePilgrimPlea, npc.Line)
	assert.InDelta(t, 0.5, npc.LineAt, 1e-9)
}
