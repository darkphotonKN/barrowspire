package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func standMonster(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.MonsterComponent{
		Archetype: components.MonsterArchetypeGhoul, Level: 3,
		Name: "Ghoul", Action: components.MonsterActionIdle, FacingY: 1,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 90))
	e.AddComponent(components.NewHealthComponent(1000, 1000))
	return e
}

// FS-E1ZDG §G R28: a Hunter's split arrow is an ordinary arrow on the wire,
// in the state's projectiles, so the client draws it with no change.
// I-E1ZDG-7.
func TestFormatStateToClientState_ASplitArrowIsAnArrowInTheProjectiles(t *testing.T) {
	em := ecs.NewEntityManager()
	hunter := uuid.New()
	body := seatCaster(em, hunter, "archer", stamina(100, 100), components.AttackShadowShot)
	body.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"archer.t6a": 1}))
	struck := standMonster(em, 300, 100)
	standMonster(em, 300, 250)

	alwaysCrit := func() float64 { return 0 }
	systems.NewCombatSystem(em, alwaysCrit, systems.PlayerDamageOff, systems.UniqueEffectTuning{}).
		Update(1.0/60, em.GetAllEntities(), []systems.Impact{{
			Attack: components.AttackSnapshot{
				AttackerEntityID: body.ID, AttackerMemberID: hunter, Kind: components.AttackArrow,
				DamageType: components.DamagePhysical, Power: 12, Coefficient: 1.4, CritChance: 0.5,
			},
			TargetEntityID: struck.ID,
		}})

	_, frame := wireFor(t, em, types.WorldTypeRun, hunter)
	shots, _ := frame["projectiles"].([]any)
	require.Len(t, shots, 1)
	shot := shots[0].(map[string]any)
	assert.Equal(t, "arrow", shot["projectile_type"])
	assert.Equal(t, map[string]any{"x": float64(300), "y": float64(100)}, shot["position"])
}
