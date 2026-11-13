package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// groundSlam is R11's Blood Troll slam.
var groundSlam = components.MonsterAbility{
	Kind: components.MonsterAbilityGroundSlam, Shape: components.AbilityAreaAroundSelf,
	MaxRange: 90, WindUp: 0.9, Cooldown: 7, Multiplier: 1.5, Radius: 130,
}

// bloodTroll stands a troll-timed monster with the ground slam at (x, y), its
// level damage 20.
func bloodTroll(t *testing.T, em *ecs.EntityManager, x, y float64) *ecs.Entity {
	t.Helper()
	e := troll(t, em, x, y)
	m := monster(e)
	m.Archetype, m.Name = components.MonsterArchetypeBloodTroll, "Blood Troll"
	m.Ability = groundSlam
	cc, _ := e.GetComponent(ecs.ComponentTypeCombat)
	cc.(*components.CombatComponent).Attack = 20
	return e
}

// A Blood Troll with its slam ready and a delver at 80 px, outside its 60 px
// reach but inside the slam's 90, stands and winds the slam up instead of
// chasing or swinging: `ability`, fixed where it stands, its cooldown started.
// FS-C8VM7 §B R12, R13, R17.
func TestMonsterAbility_ReadySlamInItsDistances_WindsUpInsteadOfASwing(t *testing.T) {
	em := ecs.NewEntityManager()
	b := bloodTroll(t, em, 500, 500)
	delver(em, 580, 500)

	brawl(em, 1)

	m := monster(b)
	assert.Equal(t, components.MonsterActionAbility, m.Action)
	assert.Zero(t, velocityOf(t, b).VX, "it stands to wind up")
	assert.Equal(t, 0.9, m.AbilityPending.Remaining)
	assert.Equal(t, 500.0, m.AbilityPending.X)
	assert.Equal(t, 500.0, m.AbilityPending.Y)
	assert.Equal(t, 7.0, m.AbilityCooldown, "the cooldown starts with the wind-up")
	assert.Zero(t, m.WindUpRemaining, "no swing wound up beside it")
}

// The slam lands on the circle fixed at the wind-up's start: a delver who
// stepped out is not hit, one inside is hit at 1.5 × level damage, mitigated;
// a monster inside is never hit. FS-C8VM7 §B R13, R14.
func TestMonsterAbility_SlamLandsOnTheFixedCircle(t *testing.T) {
	em := ecs.NewEntityManager()
	bloodTroll(t, em, 500, 500)
	target := sturdy(delver(em, 580, 500))
	inside := sturdy(delver(em, 500, 620)) // 120 px: its body overlaps the 130 px circle
	g := hunter(em, 420, 500)
	brawl(em, 1)

	moveTo(t, target, 700, 500) // steps out during the wind-up
	brawl(em, ticks(0.9))

	assert.Equal(t, 100000, health(target), "the delver who left the circle is not hit")
	assert.Equal(t, 100000-mitigated(20, 1.5), health(inside))
	assert.Equal(t, 40, health(g), "no monster is hit by a monster's ability")
}

// With the slam cooling, the troll attacks as before: it chases into reach and
// swings. FS-C8VM7 §B R12.
func TestMonsterAbility_Cooling_AttacksAsBefore(t *testing.T) {
	em := ecs.NewEntityManager()
	b := bloodTroll(t, em, 500, 500)
	d := sturdy(delver(em, 550, 500))
	monster(b).AbilityCooldown = 3

	brawl(em, 1)

	assert.Equal(t, components.MonsterActionAttack, monster(b).Action)
	require.Positive(t, monster(b).WindUpRemaining)
	brawl(em, ticks(0.7))
	assert.Equal(t, 100000-mitigated(20, 1), health(d))
}

// cleave is R11's dark warrior cleave.
var cleave = components.MonsterAbility{
	Kind: components.MonsterAbilityCleave, Shape: components.AbilityCone,
	MaxRange: 110, WindUp: 0.8, Cooldown: 6, Multiplier: 1.6, Radius: 110, Arc: 120,
}

// darkWarrior stands a troll-timed monster with the cleave at (x, y), its level
// damage 30.
func darkWarrior(t *testing.T, em *ecs.EntityManager, x, y float64) *ecs.Entity {
	t.Helper()
	e := troll(t, em, x, y)
	m := monster(e)
	m.Archetype, m.Name = components.MonsterArchetypeDarkWarrior, "Dark Warrior"
	m.Ability = cleave
	cc, _ := e.GetComponent(ecs.ComponentTypeCombat)
	cc.(*components.CombatComponent).Attack = 30
	return e
}

// A cleave points along the facing at its wind-up's start: it hits a delver in
// front within 110 px and 60° of that facing, not one behind, nor one at the
// side past 60°, nor one in front beyond its reach. FS-C8VM7 §B R13, R14.
func TestMonsterAbility_CleaveHitsTheConeInFront(t *testing.T) {
	em := ecs.NewEntityManager()
	w := darkWarrior(t, em, 500, 500)
	target := sturdy(delver(em, 600, 500))  // in front, 100 px: aimed at
	flank := sturdy(delver(em, 550, 570))   // 54° off the facing, 86 px
	behind := sturdy(delver(em, 420, 500))  // 80 px behind
	side := sturdy(delver(em, 500, 590))    // 90° off
	far := sturdy(delver(em, 500+115, 500)) // in front, past the reach
	monster(w).Target = target.ID           // the one it is after, though another stands nearer
	brawl(em, 1)
	require.Equal(t, components.MonsterActionAbility, monster(w).Action)

	brawl(em, ticks(0.8))

	assert.Equal(t, 100000-mitigated(30, 1.6), health(target))
	assert.Equal(t, 100000-mitigated(30, 1.6), health(flank))
	assert.Equal(t, 100000, health(behind))
	assert.Equal(t, 100000, health(side))
	assert.Equal(t, 100000, health(far))
}

// The target dies during the wind-up: an area still lands where it was fixed,
// on whoever is left in it, and the cooldown stays spent. FS-C8VM7 §Edge States.
func TestMonsterAbility_TargetGoneDuringTheWindUp_TheAreaStillLands(t *testing.T) {
	em := ecs.NewEntityManager()
	b := bloodTroll(t, em, 500, 500)
	target := delver(em, 580, 500)
	other := sturdy(delver(em, 500, 400))
	brawl(em, 1)

	killDelver(target)
	brawl(em, ticks(0.9))

	assert.Equal(t, 100000-mitigated(20, 1.5), health(other))
	assert.Positive(t, monster(b).AbilityCooldown)
}

// A monster that dies mid wind-up drops its ability: nothing lands, nothing
// stays pending on the corpse. FS-C8VM7 §B R17.
func TestMonsterAbility_DiesDuringTheWindUp_NothingLands(t *testing.T) {
	em := ecs.NewEntityManager()
	b := bloodTroll(t, em, 500, 500)
	d := sturdy(delver(em, 580, 500))
	brawl(em, 1)

	hc, _ := b.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	NewMonsterDeathSystem(em, 4).Update(tickSeconds, em.GetAllEntities())
	brawl(em, ticks(0.9))

	assert.Zero(t, monster(b).AbilityPending.Remaining)
	assert.Equal(t, 100000, health(d))
}

// The shot abilities, as R11 gives them.
var (
	volley = components.MonsterAbility{
		Kind: components.MonsterAbilityVolley, Shape: components.AbilityShots,
		MaxRange: 320, WindUp: 0.6, Cooldown: 5, Multiplier: 1,
		ProjectileType: "bone_arrow", ShotSpeed: 420, ShotRadius: 8, ShotMaxFlight: 850, Shots: 3, Fan: 12,
	}
	thrownDagger = components.MonsterAbility{
		Kind: components.MonsterAbilityDagger, Shape: components.AbilityShots,
		MinRange: 90, MaxRange: 260, WindUp: 0.4, Cooldown: 5, Multiplier: 1,
		ProjectileType: "thrown_dagger", ShotSpeed: 480, ShotRadius: 8, ShotMaxFlight: 520, Shots: 1,
	}
	rockThrow = components.MonsterAbility{
		Kind: components.MonsterAbilityRock, Shape: components.AbilityShots,
		MinRange: 140, MaxRange: 380, WindUp: 1.0, Cooldown: 7, Multiplier: 1.5,
		ProjectileType: "ogre_rock", ShotSpeed: 240, ShotRadius: 18, ShotMaxFlight: 420, Shots: 1,
	}
)

// goblin stands a ghoul-timed monster with the thrown dagger at (x, y), its
// aggro wide enough to see a delver at its dagger's reach.
func goblin(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := hunter(em, x, y)
	m := monster(e)
	m.Archetype, m.Name = components.MonsterArchetypeGoblin, "Goblin"
	m.AggroRadius = 280
	m.Ability = thrownDagger
	return e
}

// aloft is a projectile in the air: what it is and where it heads.
type aloft struct {
	shot  *components.ProjectileComponent
	angle float64 // degrees
	speed float64
}

func aloftShots(em *ecs.EntityManager) []aloft {
	var out []aloft
	for _, e := range em.GetAllEntities() {
		pc, ok := e.GetComponent(ecs.ComponentTypeProjectile)
		if !ok {
			continue
		}
		vc, _ := e.GetComponent(ecs.ComponentTypeVelocity)
		v := vc.(*components.VelocityComponent)
		out = append(out, aloft{
			shot:  pc.(*components.ProjectileComponent),
			angle: math.Atan2(v.VY, v.VX) * 180 / math.Pi,
			speed: math.Hypot(v.VX, v.VY),
		})
	}
	return out
}

// A Wight Archer's volley looses 3 `bone_arrow`s 12° apart, the middle one on
// its target, at the arrow's numbers. FS-C8VM7 §B R11, R14, R18.
func TestMonsterAbility_VolleyLoosesThreeArrowsFanned(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 500, 500)
	monster(a).Ability = volley
	delver(em, 700, 500)

	brawl(em, 1)
	require.Equal(t, components.MonsterActionAbility, monster(a).Action)
	brawl(em, ticks(0.6))

	got := aloftShots(em)
	require.Len(t, got, 3)
	var angles []float64
	for _, f := range got {
		assert.Equal(t, "bone_arrow", f.shot.ProjectileType)
		assert.InDelta(t, 420.0, f.speed, 1e-9)
		assert.Equal(t, 8.0, f.shot.Radius)
		assert.Equal(t, 850.0, f.shot.MaxDistance)
		assert.True(t, f.shot.Attack.FromMonster)
		assert.Equal(t, 1.0, f.shot.Attack.Coefficient)
		angles = append(angles, f.angle)
	}
	assert.ElementsMatch(t, []float64{-12, 0, 12}, roundAll(angles))
}

func roundAll(vs []float64) []float64 {
	out := make([]float64, len(vs))
	for i, v := range vs {
		out[i] = math.Round(v*1e6) / 1e6
	}
	return out
}

// A goblin at 200 px with its dagger ready stops chasing and throws it, as a
// `thrown_dagger` with R11's numbers, at where its target stands as the
// wind-up ends; with the dagger cooling it chases. FS-C8VM7 §B R12, R13.
func TestMonsterAbility_GoblinAt200px_ThrowsItsDaggerOrChases(t *testing.T) {
	t.Run("ready: stops and throws", func(t *testing.T) {
		em := ecs.NewEntityManager()
		g := goblin(em, 500, 500)
		d := delver(em, 700, 500)

		brawl(em, 1)
		assert.Equal(t, components.MonsterActionAbility, monster(g).Action)
		assert.Zero(t, velocityOf(t, g).VX, "it stops to throw")

		moveTo(t, d, 700, 600) // the dagger tracks them through the wind-up
		brawl(em, ticks(0.4))

		got := aloftShots(em)
		require.Len(t, got, 1)
		assert.Equal(t, "thrown_dagger", got[0].shot.ProjectileType)
		assert.InDelta(t, 480.0, got[0].speed, 1e-9)
		assert.Equal(t, 8.0, got[0].shot.Radius)
		assert.Equal(t, 520.0, got[0].shot.MaxDistance)
		assert.InDelta(t, math.Atan2(100, 200)*180/math.Pi, got[0].angle, 1e-6)
		assert.InDelta(t, 100/math.Hypot(100, 200), monster(g).FacingY, 1e-9, "it turned with its target")
	})
	t.Run("cooling: chases", func(t *testing.T) {
		em := ecs.NewEntityManager()
		g := goblin(em, 500, 500)
		delver(em, 700, 500)
		monster(g).AbilityCooldown = 2

		brawl(em, 1)

		assert.Equal(t, components.MonsterActionMove, monster(g).Action)
		assert.Empty(t, aloftShots(em))
	})
}

// Inside a shot ability's least distance it is not used: an ogre at 100 px
// swings, never throws. FS-C8VM7 §B R11, R12.
func TestMonsterAbility_InsideTheLeastDistance_IsNotUsed(t *testing.T) {
	em := ecs.NewEntityManager()
	o := troll(t, em, 500, 500)
	monster(o).Ability = rockThrow
	delver(em, 550, 500)

	brawl(em, 1)

	assert.Equal(t, components.MonsterActionAttack, monster(o).Action)
}

// An ogre's rock leaves as an `ogre_rock` with R11's numbers and lands at 1.5
// × its level damage; a wall in its flight stops it. FS-C8VM7 §B R14, R18.
func TestMonsterAbility_OgreRock(t *testing.T) {
	t.Run("lands at × 1.5", func(t *testing.T) {
		em := ecs.NewEntityManager()
		o := troll(t, em, 500, 500)
		monster(o).Ability = rockThrow
		cc, _ := o.GetComponent(ecs.ComponentTypeCombat)
		cc.(*components.CombatComponent).Attack = 24
		d := sturdy(delver(em, 700, 500))

		skirmish(em, ticks(1.0))
		got := aloftShots(em)
		require.Len(t, got, 1)
		assert.Equal(t, "ogre_rock", got[0].shot.ProjectileType)
		assert.InDelta(t, 240.0, got[0].speed, 1e-9)
		assert.Equal(t, 18.0, got[0].shot.Radius)
		assert.Equal(t, 420.0, got[0].shot.MaxDistance)

		skirmish(em, ticks(1.0))
		assert.Equal(t, 100000-mitigated(24, 1.5), health(d))
	})
	t.Run("a wall stops it", func(t *testing.T) {
		em := ecs.NewEntityManager()
		o := troll(t, em, 500, 500)
		monster(o).Ability = rockThrow
		d := sturdy(delver(em, 700, 500))
		wall := em.CreateEntity()
		wall.AddComponent(components.NewWallComponent(uuid.New(), uuid.New(), 20, 100))
		wall.AddComponent(components.NewTransformComponent(600, 450))

		skirmish(em, ticks(3))

		assert.Positive(t, monster(o).AbilityCooldown, "it threw")
		assert.Equal(t, 100000, health(d))
		assert.Empty(t, aloftShots(em))
	})
}

// A shot ability is used only in sight, by the shot sight test at its own
// radius: a goblin with rock between it and its target walks on; with a clear
// flight it stands and throws. FS-C8VM7 §B R12.
func TestMonsterAbility_ShotOutOfSight_IsNotUsed(t *testing.T) {
	tests := []struct {
		name         string
		gx, gy       float64
		dx, dy       float64
		wantThrowing bool
	}{
		{"rock between", 200, 180, 200, 380, false},
		{"through the gap", 600, 200, 600, 400, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			grid, _ := floorOf(t, em, behindAWall)
			g := goblin(em, tt.gx, tt.gy)
			delver(em, tt.dx, tt.dy)

			NewMonsterAISystem(firstRoll, grid).Update(tickSeconds, em.GetAllEntities())

			if tt.wantThrowing {
				assert.Equal(t, components.MonsterActionAbility, monster(g).Action)
				return
			}
			assert.Equal(t, components.MonsterActionMove, monster(g).Action)
			assert.Zero(t, monster(g).AbilityCooldown, "still ready")
		})
	}
}

// A Banshee's wail is the widest circle: from 200 px it winds up, and it lands
// on a delver whose body overlaps its 180 px at 1.2 × level damage, never on
// one who backed out of it. FS-C8VM7 §B R11, R14.
func TestMonsterAbility_WailLandsOnItsCircle(t *testing.T) {
	em := ecs.NewEntityManager()
	b := hunter(em, 500, 500)
	m := monster(b)
	m.Archetype, m.Name, m.AggroRadius = components.MonsterArchetypeBanshee, "Banshee", 300
	m.Ability = components.MonsterAbility{
		Kind: components.MonsterAbilityWail, Shape: components.AbilityAreaAroundSelf,
		MaxRange: 200, WindUp: 0.7, Cooldown: 8, Multiplier: 1.2, Radius: 180,
	}
	leaves := sturdy(delver(em, 690, 500))
	stays := sturdy(delver(em, 500, 320))
	brawl(em, 1)
	require.Equal(t, components.MonsterActionAbility, m.Action)

	moveTo(t, leaves, 760, 500)
	brawl(em, ticks(0.7))

	assert.Equal(t, 100000, health(leaves))
	assert.Equal(t, 100000-mitigated(6, 1.2), health(stays))
}
