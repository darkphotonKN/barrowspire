package systems

import (
	"math"
	"slices"

	commonconstants "github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

type ProjectileSystem struct {
	em           *ecs.EntityManager
	playerDamage PlayerDamage
}

func NewProjectileSystem(em *ecs.EntityManager, playerDamage PlayerDamage) *ProjectileSystem {
	return &ProjectileSystem{em: em, playerDamage: playerDamage}
}

// Update moves projectiles and reports the ones that reached a damageable entity.
// It never applies damage: each Impact goes to the CombatSystem on the same tick.
// FS-77AB6 §Requirements 10.
func (s *ProjectileSystem) Update(deltaTime float64, entities []*ecs.Entity) []Impact {
	var toRemove []uuid.UUID
	var impacts []Impact

	// 1. Group entities by targetables (anything with Health and a place) and
	// obstacles (Walls, closed Doors)
	var targets []*ecs.Entity
	var wallEntities []*ecs.Entity
	var doorEntities []*ecs.Entity

	for _, entity := range entities {
		if entity.HasComponent(ecs.ComponentTypeHealth) && entity.HasComponent(ecs.ComponentTypeTransform) {
			targets = append(targets, entity)
		}
		if _, isWall := entity.GetComponent(ecs.ComponentTypeWall); isWall {
			wallEntities = append(wallEntities, entity)
		}
		if _, isDoor := entity.GetComponent(ecs.ComponentTypeDoor); isDoor {
			doorEntities = append(doorEntities, entity)
		}
	}

	// 2. Process each projectile
	for _, entity := range entities {
		projComp, isProj := entity.GetComponent(ecs.ComponentTypeProjectile)
		if !isProj {
			continue
		}

		proj := projComp.(*components.ProjectileComponent)
		if proj.ShouldDestroy {
			toRemove = append(toRemove, entity.ID)
			continue
		}

		tc, hasTrans := entity.GetComponent(ecs.ComponentTypeTransform)
		vc, hasVel := entity.GetComponent(ecs.ComponentTypeVelocity)
		if !hasTrans || !hasVel {
			continue
		}

		transform := tc.(*components.TransformComponent)
		velocity := vc.(*components.VelocityComponent)

		// Calculate movement delta
		dx := velocity.VX * deltaTime
		dy := velocity.VY * deltaTime
		distMoved := math.Hypot(dx, dy)

		newX := transform.X + dx
		newY := transform.Y + dy
		proj.TraveledDistance += distMoved

		// Update position
		transform.X = newX
		transform.Y = newY

		// Exceed max distance -> mark destroy
		if proj.TraveledDistance >= proj.MaxDistance {
			proj.ShouldDestroy = true
			toRemove = append(toRemove, entity.ID)
			continue
		}

		// Check collision with Wall entities
		hitObstacle := false
		for _, wallEntity := range wallEntities {
			wallC, _ := wallEntity.GetComponent(ecs.ComponentTypeWall)
			wallTransC, _ := wallEntity.GetComponent(ecs.ComponentTypeTransform)
			wall := wallC.(*components.WallComponent)
			wallTrans := wallTransC.(*components.TransformComponent)

			if isCircleIntersectingRect(newX, newY, proj.Radius, wallTrans.X, wallTrans.Y, wall.Width, wall.Height) {
				hitObstacle = true
				break
			}
		}

		if hitObstacle {
			proj.ShouldDestroy = true
			toRemove = append(toRemove, entity.ID)
			continue
		}

		// Check collision with closed Door entities
		for _, doorEntity := range doorEntities {
			openableC, hasOpenable := doorEntity.GetComponent(ecs.ComponentTypeOpenable)
			if hasOpenable {
				openable := openableC.(*components.OpenableComponent)
				if openable.IsOpen {
					continue // Open doors do not block projectiles
				}
			}
			doorC, _ := doorEntity.GetComponent(ecs.ComponentTypeDoor)
			doorTransC, _ := doorEntity.GetComponent(ecs.ComponentTypeTransform)
			door := doorC.(*components.DoorComponent)
			doorTrans := doorTransC.(*components.TransformComponent)

			if isCircleIntersectingRect(newX, newY, proj.Radius, doorTrans.X, doorTrans.Y, door.Width, door.Height) {
				hitObstacle = true
				break
			}
		}

		if hitObstacle {
			proj.ShouldDestroy = true
			toRemove = append(toRemove, entity.ID)
			continue
		}

		// Check collision with damageable entities: the first one it can hit stops
		// it, unless it has pierce left, when it flies on and never hits that one
		// again. Whatever it cannot hit is passed through without spending pierce:
		// the dead, delvers out of play and, with player damage off, a delver's
		// shot through other delvers.
		for _, target := range targets {
			if target.ID == proj.OwnerEntityID {
				continue // Do not hit self
			}
			if slices.Contains(proj.HitEntityIDs, target.ID) {
				continue
			}

			if !CanHit(proj.Attack, target, s.playerDamage) {
				continue
			}

			tTransC, _ := target.GetComponent(ecs.ComponentTypeTransform)
			tTrans := tTransC.(*components.TransformComponent)

			if math.Hypot(newX-tTrans.X, newY-tTrans.Y) <= (proj.Radius + commonconstants.PlayerRadius) {
				impacts = append(impacts, Impact{Attack: proj.Attack, TargetEntityID: target.ID})
				proj.HitEntityIDs = append(proj.HitEntityIDs, target.ID)

				if proj.PierceLeft > 0 {
					proj.PierceLeft--
					continue
				}

				proj.ShouldDestroy = true
				toRemove = append(toRemove, entity.ID)
				break
			}
		}
	}

	// 3. Remove destroyed projectile entities from EntityManager
	if s.em != nil {
		for _, id := range toRemove {
			s.em.RemoveEntity(id)
		}
	}

	return impacts
}

// isCircleIntersectingRect checks if a circle at (cx, cy) with radius r intersects a rectangle at (rx, ry) with width w, height h
func isCircleIntersectingRect(cx, cy, r, rx, ry, w, h float64) bool {
	closestX := math.Max(rx, math.Min(cx, rx+w))
	closestY := math.Max(ry, math.Min(cy, ry+h))

	distX := cx - closestX
	distY := cy - closestY

	distanceSquared := (distX * distX) + (distY * distY)
	return distanceSquared <= (r * r)
}
