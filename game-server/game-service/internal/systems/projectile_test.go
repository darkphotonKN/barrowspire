package systems

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

func TestProjectileSystem_MovementAndMaxDistance(t *testing.T) {
	em := ecs.NewEntityManager()

	owner := em.CreateEntity()
	ownerID := owner.ID

	// Create fireball projectile moving right (+X) at 100 px/s with max distance 150 px
	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(fireballFrom(ownerID), 100, 150, 10, "fireball"))

	sys := NewProjectileSystem(em, PlayerDamageOff)

	// Tick 1: deltaTime = 1s -> moves 100px to X=100
	sys.Update(1.0, em.GetAllEntities())

	tc, _ := projEntity.GetComponent(ecs.ComponentTypeTransform)
	transform := tc.(*components.TransformComponent)

	if transform.X != 100 {
		t.Errorf("expected X=100, got %f", transform.X)
	}

	// Tick 2: deltaTime = 1s -> moves another 100px (total 200px >= 150px max distance) -> should be removed
	sys.Update(1.0, em.GetAllEntities())

	if _, exists := em.GetEntity(projEntity.ID); exists {
		t.Errorf("expected projectile to be removed after exceeding max distance")
	}
}

func TestProjectileSystem_HitEnemy(t *testing.T) {
	em := ecs.NewEntityManager()

	// Create owner player at (0, 0)
	owner := em.CreateEntity()
	owner.AddComponent(components.NewPlayerComponent(uuid.New(), "mage", "owner", false))
	owner.AddComponent(components.NewTransformComponent(0, 0))

	// Create enemy player at (50, 0) with 100 HP
	enemy := em.CreateEntity()
	enemy.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "enemy", false))
	enemy.AddComponent(components.NewTransformComponent(50, 0))
	enemy.AddComponent(components.NewHealthComponent(100, 100))

	// Create fireball projectile at (0, 0) moving towards enemy (+X) at 100 px/s
	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(fireballFrom(owner.ID), 100, 500, 10, "fireball"))

	sys := NewProjectileSystem(em, PlayerDamageOff)

	// Tick: deltaTime = 0.35s -> moves to X=35. Distance to enemy (50, 0) is 15px <= (radius 10 + PlayerRadius 20 = 30px) -> Hit!
	impacts := sys.Update(0.35, em.GetAllEntities())

	// The impact is reported for the CombatSystem; the projectile applies nothing itself
	require.Len(t, impacts, 1)
	assert.Equal(t, enemy.ID, impacts[0].TargetEntityID)
	assert.Equal(t, fireballFrom(owner.ID), impacts[0].Attack)

	hc, _ := enemy.GetComponent(ecs.ComponentTypeHealth)
	assert.Equal(t, 100, hc.(*components.HealthComponent).CurrentHealth, "no damage outside the CombatSystem")

	// Check projectile entity removed
	if _, exists := em.GetEntity(projEntity.ID); exists {
		t.Errorf("expected projectile entity to be removed after hitting enemy")
	}
}

func TestProjectileSystem_IgnoreOwner(t *testing.T) {
	em := ecs.NewEntityManager()

	// Create owner player at (0, 0) with 100 HP
	owner := em.CreateEntity()
	owner.AddComponent(components.NewPlayerComponent(uuid.New(), "mage", "owner", false))
	owner.AddComponent(components.NewTransformComponent(0, 0))
	owner.AddComponent(components.NewHealthComponent(100, 100))

	// Create fireball projectile right at owner's position (0, 0)
	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(fireballFrom(owner.ID), 100, 500, 10, "fireball"))

	sys := NewProjectileSystem(em, PlayerDamageOff)

	// Update system
	impacts := sys.Update(0.1, em.GetAllEntities())
	assert.Empty(t, impacts)

	// Check owner health remains 100
	hc, _ := owner.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)

	if health.CurrentHealth != 100 {
		t.Errorf("expected owner health to remain 100, got %d", health.CurrentHealth)
	}
}

func TestProjectileSystem_HitWall(t *testing.T) {
	em := ecs.NewEntityManager()

	owner := em.CreateEntity()

	// Create wall at X=40, Y=0, W=20, H=50 (bounding box [40..60, -25..25])
	wall := em.CreateEntity()
	wall.AddComponent(components.NewWallComponent(uuid.New(), uuid.New(), 20, 50))
	wall.AddComponent(components.NewTransformComponent(40, -25))

	// Create fireball projectile moving towards wall
	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(fireballFrom(owner.ID), 100, 500, 10, "fireball"))

	sys := NewProjectileSystem(em, PlayerDamageOff)

	// Update system: moves to X=35 -> intersects wall at X=[40, 60], Y=[-25, 25] (distance to 40 is 5 <= radius 10)
	sys.Update(0.35, em.GetAllEntities())

	if _, exists := em.GetEntity(projEntity.ID); exists {
		t.Errorf("expected projectile to be destroyed when hitting wall")
	}
}

// fireballFrom is a level-1 mage's fireball as fired by owner.
func fireballFrom(owner uuid.UUID) components.AttackSnapshot {
	return components.AttackSnapshot{
		AttackerEntityID: owner,
		DamageType:       components.DamageMagic,
		Power:            15,
		Coefficient:      1.1,
		ScalingStat:      9,
		CritChance:       BaseCritChance,
	}
}

// Anything with health and a place is a target, not only delvers.
func TestProjectileSystem_HitsAnyDamageableEntity(t *testing.T) {
	em := ecs.NewEntityManager()
	owner := em.CreateEntity()
	owner.AddComponent(components.NewTransformComponent(0, 0))

	monster := dummy(em, 50, 0)

	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(fireballFrom(owner.ID), 100, 500, 10, "fireball"))

	impacts := NewProjectileSystem(em, PlayerDamageOff).Update(0.35, em.GetAllEntities())

	require.Len(t, impacts, 1)
	assert.Equal(t, monster.ID, impacts[0].TargetEntityID)
}

// A dead body is passed through: the projectile flies on to the next target.
func TestProjectileSystem_PassesThroughTheDead(t *testing.T) {
	em := ecs.NewEntityManager()
	owner := em.CreateEntity()

	corpse := dummy(em, 30, 0)
	hc, _ := corpse.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(fireballFrom(owner.ID), 100, 500, 10, "fireball"))

	impacts := NewProjectileSystem(em, PlayerDamageOff).Update(0.2, em.GetAllEntities())

	assert.Empty(t, impacts)
	_, stillFlying := em.GetEntity(projEntity.ID)
	assert.True(t, stillFlying)
}

// The owner dying mid-flight changes nothing: the impact still carries their identity.
func TestProjectileSystem_OwnerGoneStillReportsTheirIdentity(t *testing.T) {
	em := ecs.NewEntityManager()
	owner := em.CreateEntity()
	memberID := uuid.New()
	target := dummy(em, 50, 0)

	attack := fireballFrom(owner.ID)
	attack.AttackerMemberID = memberID

	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(attack, 100, 500, 10, "fireball"))

	em.RemoveEntity(owner.ID)

	impacts := NewProjectileSystem(em, PlayerDamageOff).Update(0.35, em.GetAllEntities())

	require.Len(t, impacts, 1)
	assert.Equal(t, target.ID, impacts[0].TargetEntityID)
	assert.Equal(t, owner.ID, impacts[0].Attack.AttackerEntityID)
	assert.Equal(t, memberID, impacts[0].Attack.AttackerMemberID)
}
