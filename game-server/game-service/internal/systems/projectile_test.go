package systems

import (
	"testing"

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
	projEntity.AddComponent(components.NewProjectileComponent(ownerID, 25, 100, 150, 10, "fireball"))

	sys := NewProjectileSystem(em)

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
	owner.AddComponent(components.NewPlayerComponent(uuid.New(), "mage", "owner", false, false, false))
	owner.AddComponent(components.NewTransformComponent(0, 0))

	// Create enemy player at (50, 0) with 100 HP
	enemy := em.CreateEntity()
	enemy.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "enemy", false, false, false))
	enemy.AddComponent(components.NewTransformComponent(50, 0))
	enemy.AddComponent(components.NewHealthComponent(100, 100))

	// Create fireball projectile at (0, 0) moving towards enemy (+X) at 100 px/s
	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(owner.ID, 25, 100, 500, 10, "fireball"))

	sys := NewProjectileSystem(em)

	// Tick: deltaTime = 0.35s -> moves to X=35. Distance to enemy (50, 0) is 15px <= (radius 10 + PlayerRadius 20 = 30px) -> Hit!
	sys.Update(0.35, em.GetAllEntities())

	// Check enemy health
	hc, _ := enemy.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)

	if health.CurrentHealth != 75 {
		t.Errorf("expected enemy health to be 75 after 25 damage, got %d", health.CurrentHealth)
	}

	// Check projectile entity removed
	if _, exists := em.GetEntity(projEntity.ID); exists {
		t.Errorf("expected projectile entity to be removed after hitting enemy")
	}
}

func TestProjectileSystem_IgnoreOwner(t *testing.T) {
	em := ecs.NewEntityManager()

	// Create owner player at (0, 0) with 100 HP
	owner := em.CreateEntity()
	owner.AddComponent(components.NewPlayerComponent(uuid.New(), "mage", "owner", false, false, false))
	owner.AddComponent(components.NewTransformComponent(0, 0))
	owner.AddComponent(components.NewHealthComponent(100, 100))

	// Create fireball projectile right at owner's position (0, 0)
	projEntity := em.CreateEntity()
	projEntity.AddComponent(components.NewTransformComponent(0, 0))
	projEntity.AddComponent(components.NewVelocityComponent(100, 0, 100))
	projEntity.AddComponent(components.NewProjectileComponent(owner.ID, 25, 100, 500, 10, "fireball"))

	sys := NewProjectileSystem(em)

	// Update system
	sys.Update(0.1, em.GetAllEntities())

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
	projEntity.AddComponent(components.NewProjectileComponent(owner.ID, 25, 100, 500, 10, "fireball"))

	sys := NewProjectileSystem(em)

	// Update system: moves to X=35 -> intersects wall at X=[40, 60], Y=[-25, 25] (distance to 40 is 5 <= radius 10)
	sys.Update(0.35, em.GetAllEntities())

	if _, exists := em.GetEntity(projEntity.ID); exists {
		t.Errorf("expected projectile to be destroyed when hitting wall")
	}
}
