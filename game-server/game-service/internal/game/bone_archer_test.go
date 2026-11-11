package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// boneArcher spawns a level-1 Bone Archer from its sheet at (x, y).
func boneArcher(s *Session, x, y float64) *ecs.Entity {
	return CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeBoneArcher, Level: 1, X: x, Y: y})
}

// boneArrows is every bone arrow in the air.
func boneArrows(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypeProjectile); ok && pc.(*components.ProjectileComponent).ProjectileType == "bone_arrow" {
			out = append(out, e)
		}
	}
	return out
}

// tickUntilLoosed ticks until a bone arrow is in the air and returns it with
// the ticks it took, failing the test if none is loosed within a second.
func tickUntilLoosed(t *testing.T, s *Session, each func()) (*ecs.Entity, int) {
	t.Helper()
	for n := 1; n <= constants.GameFrameRate; n++ {
		if each != nil {
			each()
		}
		tick(s)
		if arrows := boneArrows(s); len(arrows) > 0 {
			require.Len(t, arrows, 1)
			return arrows[0], n
		}
	}
	require.FailNow(t, "no arrow was loosed")
	return nil, 0
}

const tickLength = 1.0 / float64(constants.GameFrameRate)

// A Bone Archer with a delver in range draws for 0.6 s, standing still and
// reporting `attack`, then one bone arrow exists where it stands, flying at
// 420 px/s at where its target stood on the release tick, not where they
// stood when the draw began. FS-B4SG9 §A R6–R9.
func TestBoneArcher_DrawsThenLoosesOneArrowAtWhereItsTargetStands(t *testing.T) {
	s := unstartedRun(t)
	archer := boneArcher(s, 1000, 1000)
	_, delver := placeDelver(t, s, "warrior", 1300, 1000)
	m := monsterOf(archer)

	var aimX, aimY float64
	arrow, n := tickUntilLoosed(t, s, func() {
		if m.Target != uuid.Nil {
			// every tick of the draw before the release
			assert.Equal(t, components.MonsterActionAttack, m.Action)
		}
		// the target walks round it through the draw
		at := transformOf(t, delver)
		at.Y += 5
		aimX, aimY = at.X, at.Y
	})

	// the draw began on the first tick and the arrow left on the n-th: 0.6 s,
	// or a tick over, since the wind-up's clock sums tick lengths
	drawn := float64(n-1) * tickLength
	assert.GreaterOrEqual(t, drawn, 0.6-1e-9)
	assert.LessOrEqual(t, drawn, 0.6+tickLength+1e-9)
	assert.Equal(t, components.MonsterActionAttack, m.Action)
	at := transformOf(t, archer)
	assert.Equal(t, 1000.0, at.X, "it stood through the draw")
	assert.Equal(t, 1000.0, at.Y)

	shot, _ := arrow.GetComponent(ecs.ComponentTypeProjectile)
	assert.Equal(t, archer.ID, shot.(*components.ProjectileComponent).OwnerEntityID)
	from := transformOf(t, arrow)
	assert.Equal(t, 1000.0, from.X, "it first moves on the next tick")
	assert.Equal(t, 1000.0, from.Y)

	dist := math.Hypot(aimX-1000, aimY-1000)
	v := velocityOf(arrow)
	assert.InDelta(t, 420*(aimX-1000)/dist, v.VX, 1e-9)
	assert.InDelta(t, 420*(aimY-1000)/dist, v.VY, 1e-9)
	assert.InDelta(t, (aimX-1000)/dist, m.FacingX, 1e-9, "the draw pointed where the arrow went")
	assert.InDelta(t, (aimY-1000)/dist, m.FacingY, 1e-9)
}

// Successive arrows at a standing target leave 2.0 s apart. FS-B4SG9 §A R6.
func TestBoneArcher_ArrowsLeaveTwoSecondsApart(t *testing.T) {
	s := unstartedRun(t)
	boneArcher(s, 1000, 1000)
	_, delver := placeDelver(t, s, "warrior", 1300, 1000)
	hc, _ := delver.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)

	seen := map[uuid.UUID]bool{}
	var loosedAt []float64
	for n := 0; n < 7*constants.GameFrameRate; n++ {
		health.CurrentHealth = health.MaxHealth // stands through it
		tick(s)
		for _, arrow := range boneArrows(s) {
			if !seen[arrow.ID] {
				seen[arrow.ID] = true
				loosedAt = append(loosedAt, float64(n)*tickLength)
			}
		}
	}

	require.Len(t, loosedAt, 4)
	for i := 1; i < len(loosedAt); i++ {
		assert.InDelta(t, 2.0, loosedAt[i]-loosedAt[i-1], 1e-9)
	}
}

// From 320 px, a delver who strafes across the line at 200 px/s as the arrow
// leaves is not hit; one who runs straight away at 200 px/s is. FS-B4SG9 §A
// R8, user stories 5–6.
func TestBoneArcher_StrafingDodgesTheArrowRunningStraightAwayDoesNot(t *testing.T) {
	tests := []struct {
		name   string
		vx, vy float64
		hit    bool
	}{
		{"strafing across the line", 0, 1, false},
		{"running straight away", 1, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := unstartedRun(t)
			boneArcher(s, 1000, 1000)
			_, delver := placeDelver(t, s, "warrior", 1320, 1000)

			tickUntilLoosed(t, s, nil)
			full := currentHealth(delver)
			v := velocityOf(delver)
			require.Equal(t, 200.0, v.Speed)
			v.VX, v.VY = tt.vx, tt.vy
			tickFor(s, 3)

			require.Empty(t, boneArrows(s), "the arrow is spent")
			if tt.hit {
				assert.Less(t, currentHealth(delver), full)
				return
			}
			assert.Equal(t, full, currentHealth(delver))
		})
	}
}

// A Bone Archer killed mid-draw looses nothing. FS-B4SG9 §A R12.
func TestBoneArcher_KilledMidDraw_LoosesNothing(t *testing.T) {
	s := unstartedRun(t)
	archer := boneArcher(s, 1000, 1000)
	_, delver := placeDelver(t, s, "warrior", 1300, 1000)
	tickFor(s, 0.3)
	require.Equal(t, components.MonsterActionAttack, monsterOf(archer).Action)
	full := currentHealth(delver)

	hc, _ := archer.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	for range 2 * constants.GameFrameRate {
		tick(s)
		assert.Empty(t, boneArrows(s))
	}

	assert.Equal(t, full, currentHealth(delver))
}

// An arrow in the air when its archer dies still lands. FS-B4SG9 §A R9.
func TestBoneArcher_KilledWithAnArrowInTheAir_TheArrowStillLands(t *testing.T) {
	s := unstartedRun(t)
	archer := boneArcher(s, 1000, 1000)
	_, delver := placeDelver(t, s, "warrior", 1300, 1000)
	tickUntilLoosed(t, s, nil)
	full := currentHealth(delver)

	hc, _ := archer.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	tickFor(s, 1)

	assert.Less(t, currentHealth(delver), full)
	assert.Empty(t, boneArrows(s))
}
