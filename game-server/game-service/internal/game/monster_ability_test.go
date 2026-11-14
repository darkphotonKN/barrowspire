package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// r11 is FS-C8VM7 §B R11's table, as the sheets must carry it.
var r11 = map[components.MonsterAbilityKind]components.MonsterAbility{
	components.MonsterAbilityPounce: {
		Kind: components.MonsterAbilityPounce, Shape: components.AbilityLeap,
		MinRange: 120, MaxRange: 300, WindUp: 0.5, Cooldown: 6, Multiplier: 1.5, Radius: 60, LeapTime: 0.3,
	},
	components.MonsterAbilityBurst: {
		Kind: components.MonsterAbilityBurst, Shape: components.AbilityDeathBurst,
		WindUp: 0.8, Multiplier: 2.0, Radius: 110,
	},
	components.MonsterAbilityVolley: {
		Kind: components.MonsterAbilityVolley, Shape: components.AbilityShots,
		MaxRange: 320, WindUp: 0.6, Cooldown: 5, Multiplier: 1.0,
		ProjectileType: "bone_arrow", ShotSpeed: 420, ShotRadius: 8, ShotMaxFlight: 850, Shots: 3, Fan: 12,
	},
	components.MonsterAbilityGroundSlam: {
		Kind: components.MonsterAbilityGroundSlam, Shape: components.AbilityAreaAroundSelf,
		MaxRange: 90, WindUp: 0.9, Cooldown: 7, Multiplier: 1.5, Radius: 130,
	},
	components.MonsterAbilityWail: {
		Kind: components.MonsterAbilityWail, Shape: components.AbilityAreaAroundSelf,
		MaxRange: 200, WindUp: 0.7, Cooldown: 8, Multiplier: 1.2, Radius: 180,
	},
	components.MonsterAbilityDagger: {
		Kind: components.MonsterAbilityDagger, Shape: components.AbilityShots,
		MinRange: 90, MaxRange: 260, WindUp: 0.4, Cooldown: 5, Multiplier: 1.0,
		ProjectileType: "thrown_dagger", ShotSpeed: 480, ShotRadius: 8, ShotMaxFlight: 520, Shots: 1,
	},
	components.MonsterAbilityRock: {
		Kind: components.MonsterAbilityRock, Shape: components.AbilityShots,
		MinRange: 140, MaxRange: 380, WindUp: 1.0, Cooldown: 7, Multiplier: 1.5,
		ProjectileType: "ogre_rock", ShotSpeed: 240, ShotRadius: 18, ShotMaxFlight: 420, Shots: 1,
	},
	components.MonsterAbilityCleave: {
		Kind: components.MonsterAbilityCleave, Shape: components.AbilityCone,
		MaxRange: 110, WindUp: 0.8, Cooldown: 6, Multiplier: 1.6, Radius: 110, Arc: 120,
	},
}

// abilityHolders is who carries each ability: in the old families only the
// tier-6 variant, in the new ones every variant, both goblin looks included.
var abilityHolders = map[components.MonsterArchetype]components.MonsterAbilityKind{
	components.MonsterArchetypeRavener:     components.MonsterAbilityPounce,
	components.MonsterArchetypeBlightborn:  components.MonsterAbilityBurst,
	components.MonsterArchetypeWightArcher: components.MonsterAbilityVolley,
	components.MonsterArchetypeBloodTroll:  components.MonsterAbilityGroundSlam,
	components.MonsterArchetypeBanshee:     components.MonsterAbilityWail,

	components.MonsterArchetypeGoblin:                components.MonsterAbilityDagger,
	components.MonsterArchetypeGoblinShield:          components.MonsterAbilityDagger,
	components.MonsterArchetypeGoblinCutthroat:       components.MonsterAbilityDagger,
	components.MonsterArchetypeGoblinCutthroatShield: components.MonsterAbilityDagger,
	components.MonsterArchetypeGoblinReaver:          components.MonsterAbilityDagger,
	components.MonsterArchetypeGoblinReaverShield:    components.MonsterAbilityDagger,
	components.MonsterArchetypeGoblinWarchief:        components.MonsterAbilityDagger,
	components.MonsterArchetypeGoblinWarchiefShield:  components.MonsterAbilityDagger,

	components.MonsterArchetypeOgre:       components.MonsterAbilityRock,
	components.MonsterArchetypeOgreMauler: components.MonsterAbilityRock,
	components.MonsterArchetypeOgreTyrant: components.MonsterAbilityRock,

	components.MonsterArchetypeDarkWarrior: components.MonsterAbilityCleave,
	components.MonsterArchetypeDarkReaper:  components.MonsterAbilityCleave,
}

// Each R11 ability is on exactly the archetypes it names, with R11's numbers;
// every other sheet has none, the step rule carrying none up a family.
// FS-C8VM7 §B R10, R11.
func TestMonsterSheets_AbilitiesAreR11s(t *testing.T) {
	for archetype, sheet := range monsterSheets {
		kind, holds := abilityHolders[archetype]
		if !holds {
			assert.Equal(t, components.MonsterAbility{}, sheet.Ability, "%s has no ability", archetype)
			continue
		}
		assert.Equal(t, r11[kind], sheet.Ability, "%s's %s", archetype, kind)
	}
	for archetype := range abilityHolders {
		_, ok := monsterSheets[archetype]
		assert.True(t, ok, "%s has a sheet", archetype)
	}
}

// The Wight Archer's volley is used within its shooting range and winds up
// over its shot's draw (FS-C8VM7 §B R11).
func TestWightArcherVolley_FollowsItsShot(t *testing.T) {
	sheet := monsterSheets[components.MonsterArchetypeWightArcher]

	assert.Equal(t, sheet.AttackRange, sheet.Ability.MaxRange)
	assert.Equal(t, sheet.WindUp, sheet.Ability.WindUp)
	assert.Equal(t, sheet.Shot.ProjectileType, sheet.Ability.ProjectileType)
	assert.Equal(t, sheet.Shot.Speed, sheet.Ability.ShotSpeed)
}

// A monster spawns with its sheet's ability, ready: no cooldown, nothing
// pending; one without spawns with none. A champion's is its variant's.
// FS-C8VM7 §B R10, R12; §D R25.
func TestCreateMonsterEntity_CopiesTheAbility(t *testing.T) {
	tests := []struct {
		name   string
		config MonsterConfig
		want   components.MonsterAbility
	}{
		{"a goblin", MonsterConfig{Archetype: components.MonsterArchetypeGoblinShield, Level: 7}, r11[components.MonsterAbilityDagger]},
		{"a champion blood troll", MonsterConfig{Archetype: components.MonsterArchetypeBloodTroll, Level: 30, Boss: true, Champion: true}, r11[components.MonsterAbilityGroundSlam]},
		{"a ghoul", MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1}, components.MonsterAbility{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := monsterOf(CreateMonsterEntity(ecs.NewEntityManager(), tt.config))

			assert.Equal(t, tt.want, m.Ability)
			assert.Zero(t, m.AbilityCooldown, "ready at spawn")
			assert.Equal(t, components.PendingAbility{}, m.AbilityPending)
		})
	}
}

// A Blightborn that dies on the last tick before a floor change takes its burst
// with it: the corpse goes with the floor, and nothing lands on the next one.
// FS-C8VM7 §B R16, §Edge States.
func TestRun_FloorChange_RemovesAPendingDeathBurst(t *testing.T) {
	p := newParty(t, &countingItemsClient{})
	s := p.s
	tc, _ := delverEntity(t, s, p.carrier).GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	b := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeBlightborn, Level: 30, X: at.X + 60, Y: at.Y})
	hc, _ := b.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	tick(s)
	require.Positive(t, monsterOf(b).AbilityPending.Remaining, "the fuse is lit")

	require.NoError(t, s.regenerateFloor())

	_, stays := s.EntityManager.GetEntity(b.ID)
	assert.False(t, stays, "the corpse, and its burst, went with the floor")
	for _, e := range s.EntityManager.GetAllEntities() {
		if mc, ok := e.GetComponent(ecs.ComponentTypeEnemy); ok {
			assert.NotEqual(t, components.AbilityDeathBurst, mc.(*components.MonsterComponent).Ability.Shape, "no Blightborn on the new floor's first tick")
		}
	}
}

// An elite Blightborn's burst is snapshotted at the elite's damage, × 2.0.
// FS-C8VM7 §B R16, §Edge States.
func TestRun_EliteBlightbornBurst_AtTheElitesDamage(t *testing.T) {
	s := unstartedRun(t)
	b := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeBlightborn, Level: 30, Elite: true, X: 400, Y: 400})
	want := monsterSheets[components.MonsterArchetypeBlightborn].statsAt(30).elite().Damage
	hc, _ := b.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	tick(s)

	burst := monsterOf(b).AbilityPending.Attack
	assert.Equal(t, float64(want), burst.Power)
	assert.Equal(t, 2.0, burst.Coefficient)
}
