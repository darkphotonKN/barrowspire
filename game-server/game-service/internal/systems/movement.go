package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// MovementSystem integrates velocity into position, resolves collision and keeps
// entities inside the world. Bounds belong to the world, not to the system: a run's
// map and the hub are different sizes, and a run's floors may differ too (the
// session hands its floor's size over every tick, FS-KE075 §B R11).
//
// A charge in flight (DashComponent) carries its body in place of the walk: a
// step a tick at the charge's speed, through bodies but never through a wall, a
// closed door or the world's edge. Anything that stops a step short stops the
// charge; the CombatSystem then ends it.
//
// PlayersPassThrough belongs to the world, like its bounds: in the hub and the
// fields two player bodies never push each other; in a run they do. Every other
// pair of bodies collides either way (FS-0XMCP §Requirements 26–29).
//
// Walls and doors are tested through a static index over the world's rects,
// built the first tick a set of them stands and rebuilt whenever it changes: on
// a run, once per floor (FS-KE075 §E R28–29). It is built here, on the tick,
// because the first floor is built on another goroutine while the loop already
// runs (gameserver.CreateGameSession); a set changed by anything else, a wall
// added mid-floor included, is caught the same way.
type MovementSystem struct {
	MapWidth, MapHeight float64
	PlayersPassThrough  bool

	// the tick's alone
	walls *wallIndex
}

// NewMovementSystem returns a system bounded to a run floor of today's size. A
// session sets its own floor's size on the system it ticks; this default is for
// a system standing alone.
func NewMovementSystem() *MovementSystem {
	return &MovementSystem{
		MapWidth:  constants.MapWidth,
		MapHeight: constants.MapHeight,
	}
}

// hashCellSize is a spatial-hash cell's side: one body's width.
const hashCellSize = 2 * constants.PlayerRadius

// hashRowBits is how many low bits of a cell's key hold its row.
const hashRowBits = 8

// SpatialHashMaxRows is the most rows the spatial hash's key keeps apart: a
// world taller than this many cells shares keys between rows (FS-QG1HR D4).
const SpatialHashMaxRows = 1<<hashRowBits - 1

// SpatialHashRows is how many spatial-hash rows a world height tall spans.
func SpatialHashRows(height float64) int {
	return int(math.Ceil(height / hashCellSize))
}

// hashKey is a spatial-hash cell's key.
func hashKey(cellX, cellY int) int {
	return cellX<<hashRowBits | cellY
}

// NOTE: this runs every game tick
func (s *MovementSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	s.update(deltaTime, entities, s.wallIndexOf)
}

// wallIndexOf is the index over these walls and doors: the one already built,
// unless the set has changed since.
func (s *MovementSystem) wallIndexOf(walls, doors []*ecs.Entity) wallTests {
	if s.walls == nil || !s.walls.indexes(walls, doors) {
		s.walls = newWallIndex(walls, doors)
	}
	return s.walls
}

// update is Update with the wall tests taken from against, so a test can set
// the full scan beside the index.
func (s *MovementSystem) update(deltaTime float64, entities []*ecs.Entity, against func(walls, doors []*ecs.Entity) wallTests) {
	// O(n) spatial hashing for collision. A cell holds every body in it: bodies
	// close enough to collide are the likeliest to share one (FS-QG1HR D4).
	cells := make(map[int][]*ecs.Entity)
	// what this tick moves, iterated in place of the index so no body is skipped
	movers := make([]*ecs.Entity, 0, len(entities))

	var wallEntities, doorEntities []*ecs.Entity
	for _, entity := range entities {

		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		_, hasVelocity := entity.GetComponent(ecs.ComponentTypeVelocity)
		hasCharge := entity.HasComponent(ecs.ComponentTypeDash)

		_, hasWallComp := entity.GetComponent(ecs.ComponentTypeWall)
		if hasWallComp {
			wallEntities = append(wallEntities, entity)
		}

		_, hasDoorComp := entity.GetComponent(ecs.ComponentTypeDoor)
		if hasDoorComp {
			doorEntities = append(doorEntities, entity)
		}

		// Projectiles are moved and processed by ProjectileSystem
		if entity.HasComponent(ecs.ComponentTypeProjectile) {
			continue
		}

		// A resolved delver, dead or escaped, keeps a body at coordinates that
		// may belong to a floor the party has left: it neither moves nor stands
		// in anyone's way (FS-F6F88 §Requirements 15, FS-77AB6 §Requirements 17)
		if entity.HasComponent(ecs.ComponentTypePlayer) && !InPlay(entity) {
			continue
		}

		if hasTransform && (hasVelocity || hasCharge) {
			// type assertion
			transform := transformComp.(*components.TransformComponent)

			entityCellX := int(transform.X / hashCellSize)
			entityCellY := int(transform.Y / hashCellSize)

			key := hashKey(entityCellX, entityCellY)

			cells[key] = append(cells[key], entity)
			movers = append(movers, entity)
		}

	}

	blockers := against(wallEntities, doorEntities)

	for _, entity := range movers {
		targetEntity := entity
		transformComp, _ := targetEntity.GetComponent(ecs.ComponentTypeTransform)
		// type assertion
		transform := transformComp.(*components.TransformComponent)
		// calculate if there are other nearby entities in the 9-grid cells around this targetentity
		cellX := int(transform.X / hashCellSize)
		cellY := int(transform.Y / hashCellSize)

		// a charge in flight replaces the walk: held input neither adds to it
		// nor steers it, so it can never stack into a faster move
		var dx, dy, chargeStep float64
		dashComp, charging := targetEntity.GetComponent(ecs.ComponentTypeDash)
		var charge *components.DashComponent
		if charging {
			charge = dashComp.(*components.DashComponent)
			chargeStep = min(charge.Speed*deltaTime, max(charge.Remaining, 0))
			dx, dy = charge.DirX*chargeStep, charge.DirY*chargeStep
		} else {
			velocityComp, _ := targetEntity.GetComponent(ecs.ComponentTypeVelocity)
			velocity := velocityComp.(*components.VelocityComponent)
			speed := velocity.Speed * walkFactor(targetEntity)
			dx = velocity.VX * speed * deltaTime
			dy = velocity.VY * speed * deltaTime
		}

		// split-axis swept collision against walls and closed doors, X first
		newX := transform.X + dx*blockers.sweepX(transform.X, transform.Y, dx)

		// Y second
		newY := transform.Y + dy*blockers.sweepY(newX, transform.Y, dy)

		// check collision in 9-grid and resolve position by hashmap; a charge
		// runs through bodies, as the teleport it replaced did
		for i := -1; i <= 1 && !charging; i++ {
			for j := -1; j <= 1; j++ {
				cellKey := hashKey(cellX+i, cellY+j)
				for _, other := range cells[cellKey] {
					if other.ID == targetEntity.ID {
						continue
					}
					if s.PlayersPassThrough && bothPlayers(targetEntity, other) {
						continue
					}
					resolvedX, resolvedY, collided := resolveCollision(newX, newY, other)
					if collided {
						newX = resolvedX
						newY = resolvedY
					}
				}
			}
		}

		// depenetration: push player out of walls, then closed doors, after
		// entity collision resolve
		newX, newY = blockers.depenetrate(newX, newY)

		// clamp position to this world's boundaries
		mapWidth, mapHeight := s.bounds()

		if newX < constants.PlayerRadius {
			newX = constants.PlayerRadius
		}
		if newX > mapWidth-constants.PlayerRadius {
			newX = mapWidth - constants.PlayerRadius
		}
		if newY < constants.PlayerRadius {
			newY = constants.PlayerRadius
		}
		if newY > mapHeight-constants.PlayerRadius {
			newY = mapHeight - constants.PlayerRadius
		}
		// a charge stopped short by a wall, a closed door or the edge is over
		if charging {
			if math.Hypot(newX-(transform.X+dx), newY-(transform.Y+dy)) > dashEpsilon {
				charge.Remaining = 0
			} else {
				charge.Remaining -= chargeStep
			}
		}

		// update position based on velocity
		transform.X = newX
		transform.Y = newY

	}

}

// walkFactor is what the entity's walk is paced at this tick, as a share of
// its move speed: AttackSlowFactor inside an attack slow, else 1. It scales the
// walk only, never VelocityComponent.Speed, which gear owns and the wire
// reports. FS-JS7C8 §C R15.
func walkFactor(entity *ecs.Entity) float64 {
	if entity.HasComponent(ecs.ComponentTypeAttackSlow) {
		return AttackSlowFactor
	}
	return 1
}

// bothPlayers reports whether a and b are both player bodies: the one pair a
// shared world lets through (FS-0XMCP §Requirements 26).
func bothPlayers(a, b *ecs.Entity) bool {
	return a.HasComponent(ecs.ComponentTypePlayer) && b.HasComponent(ecs.ComponentTypePlayer)
}

// resolveCollision checks collision and returns resolved position
// if there's a collision, pushes position to just not overlapping
func resolveCollision(newX, newY float64, other *ecs.Entity) (float64, float64, bool) {
	otherTransformComp, hasTransform := other.GetComponent(ecs.ComponentTypeTransform)
	_, hasVelocity := other.GetComponent(ecs.ComponentTypeVelocity)

	if !hasTransform || !hasVelocity {
		return newX, newY, false
	}

	otherTransform := otherTransformComp.(*components.TransformComponent)

	dx := newX - otherTransform.X
	dy := newY - otherTransform.Y
	distance := math.Hypot(dx, dy)

	minDist := 2 * constants.PlayerRadius

	if distance < minDist && distance > 0 {
		// collision detected, push to just not overlapping position
		ratio := minDist / distance
		resolvedX := otherTransform.X + dx*ratio
		resolvedY := otherTransform.Y + dy*ratio
		return resolvedX, resolvedY, true
	}

	return newX, newY, false
}

func SweptX(playerX, playerY, wallX, wallY, wallW, wallH, dx float64) float64 {
	if dx == 0 {
		return 1
	}

	wallLeft := wallX
	wallRight := wallX + wallW
	wallTop := wallY
	wallBottom := wallY + wallH

	playerLeft := playerX - constants.PlayerRadius
	playerRight := playerX + constants.PlayerRadius
	playerTop := playerY - constants.PlayerRadius
	playerBottom := playerY + constants.PlayerRadius

	var tEnter float64

	if playerBottom <= wallTop {
		return 1
	}

	if playerTop >= wallBottom {
		return 1
	}

	// 往右走

	if dx > 0 {
		tEnter = (wallLeft - playerRight) / dx
	}
	// 往左走
	if dx < 0 {
		tEnter = (wallRight - playerLeft) / dx
	}

	if tEnter >= 1 || tEnter < 0 {
		return 1
	}
	return tEnter
}

func SweptY(playerX, playerY, wallX, wallY, wallW, wallH, dy float64) float64 {

	if dy == 0 {
		return 1
	}
	wallLeft := wallX
	wallRight := wallX + wallW
	wallTop := wallY
	wallBottom := wallY + wallH

	playerLeft := playerX - constants.PlayerRadius
	playerRight := playerX + constants.PlayerRadius
	playerTop := playerY - constants.PlayerRadius
	playerBottom := playerY + constants.PlayerRadius

	var tEnter float64
	if playerRight <= wallLeft {
		return 1
	}

	if playerLeft >= wallRight {
		return 1
	}

	// 往下走
	if dy > 0 {
		tEnter = (wallTop - playerBottom) / dy
	}
	// 往上走
	if dy < 0 {
		tEnter = (wallBottom - playerTop) / dy
	}

	if tEnter >= 1 || tEnter < 0 {
		return 1
	}
	return tEnter
}

func depenetrate(playerX, playerY, wallX, wallY, wallW, wallH float64) (float64, float64) {
	playerLeft := playerX - constants.PlayerRadius
	playerRight := playerX + constants.PlayerRadius
	playerTop := playerY - constants.PlayerRadius
	playerBottom := playerY + constants.PlayerRadius

	wallRight := wallX + wallW
	wallBottom := wallY + wallH

	// no overlap
	if playerRight <= wallX || playerLeft >= wallRight ||
		playerBottom <= wallY || playerTop >= wallBottom {
		return playerX, playerY
	}

	// overlap in each direction
	overlapLeft := playerRight - wallX
	overlapRight := wallRight - playerLeft
	overlapTop := playerBottom - wallY
	overlapBottom := wallBottom - playerTop

	// push out in the direction of smallest overlap
	minOverlap := overlapLeft
	pushX := -overlapLeft
	pushY := 0.0

	if overlapRight < minOverlap {
		minOverlap = overlapRight
		pushX = overlapRight
		pushY = 0
	}
	if overlapTop < minOverlap {
		minOverlap = overlapTop
		pushX = 0
		pushY = -overlapTop
	}
	if overlapBottom < minOverlap {
		pushX = 0
		pushY = overlapBottom
	}

	return playerX + pushX, playerY + pushY
}

// bounds falls back to a run floor of today's size so a zero-value
// MovementSystem never clamps everyone to the origin. A session always sets its
// own size, so the fallback is only ever a bare system's.
func (s *MovementSystem) bounds() (width, height float64) {
	width, height = s.MapWidth, s.MapHeight

	if width == 0 {
		width = constants.MapWidth
	}
	if height == 0 {
		height = constants.MapHeight
	}

	return width, height
}
