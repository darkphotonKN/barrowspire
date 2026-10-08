package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// MonsterDeathSystem is the monster death step, run after the CombatSystem in a
// run's tick. FS-77AB6 §Requirements 28, 30.
//
// A monster the CombatSystem took to 0 lies dead from that same tick: it stops
// moving and colliding (its Velocity goes, and MovementSystem only moves and
// collides what has one), drops its target and any strike it was winding up,
// and is broadcast as dead. Its corpse lies for the lifetime given, so every
// client can play the death, then the entity is removed.
//
// The kill record is not made here: the CombatSystem makes it at the killing
// blow, where the killer is known.
type MonsterDeathSystem struct {
	em             *ecs.EntityManager
	corpseLifetime float64 // seconds
}

func NewMonsterDeathSystem(em *ecs.EntityManager, corpseLifetime float64) *MonsterDeathSystem {
	return &MonsterDeathSystem{em: em, corpseLifetime: corpseLifetime}
}

// NOTE: this runs every game tick
func (s *MonsterDeathSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	var expired []uuid.UUID

	for _, entity := range entities {
		mc, isMonster := entity.GetComponent(ecs.ComponentTypeEnemy)
		if !isMonster || alive(entity) {
			continue
		}
		monster := mc.(*components.MonsterComponent)

		if monster.Action != components.MonsterActionDead {
			s.layDown(entity, monster)
			continue
		}

		monster.CorpseRemaining -= deltaTime
		if monster.CorpseRemaining <= 0 {
			expired = append(expired, entity.ID)
		}
	}

	for _, id := range expired {
		s.em.RemoveEntity(id)
	}
}

// layDown puts a monster that has just died into its dead state.
func (s *MonsterDeathSystem) layDown(entity *ecs.Entity, monster *components.MonsterComponent) {
	monster.Action = components.MonsterActionDead
	monster.Target = uuid.Nil
	monster.WindUpRemaining = 0
	monster.CorpseRemaining = s.corpseLifetime

	entity.RemoveComponent(ecs.ComponentTypeVelocity)
}
