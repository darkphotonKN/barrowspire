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
// A move in flight (a charge's DashComponent, a roll's RollComponent) carries
// its body in place of the walk: a step a tick at its own speed, through bodies
// but never through a wall, a closed door, a stone block or the world's edge.
// Anything that stops a step short stops it; the CombatSystem then ends a
// charge, the RollSystem a roll (FS-7P736 §A R4).
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
// added mid-floor included, is caught the same way. A stone block is no wall
// to it: blocks move, so they are tested live beside it (FS-5FZ4J §C R19).
type MovementSystem struct {
	MapWidth, MapHeight float64
	PlayersPassThrough  bool
	// Grid is a dungeon floor's cells, nil on any other floor. The walk never
	// reads it (a floor's shell walls bound the walk); a straight move does
	// (Reach).
	Grid ClearLine

	// the tick's alone
	walls *wallIndex
}

// ClearLine is a dungeon floor's cell grid as a straight move reads it.
type ClearLine interface {
	// Clear reports whether a body of half-size half moving straight from a to
	// b overlaps only walkable cells.
	Clear(ax, ay, bx, by, half float64) bool
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
		hasCarry := carried(entity)

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

		if hasTransform && (hasVelocity || hasCarry) {
			// type assertion
			transform := transformComp.(*components.TransformComponent)

			entityCellX := int(transform.X / hashCellSize)
			entityCellY := int(transform.Y / hashCellSize)

			key := hashKey(entityCellX, entityCellY)

			cells[key] = append(cells[key], entity)
			movers = append(movers, entity)
		}

	}

	// a floor's stone blocks move, so the walk tests them live beside the
	// static index (FS-5FZ4J §C R19)
	blockers := withStoneBlocks(against(wallEntities, doorEntities), entities)
	// an afloat body's, over the same index, set up the first time one moves
	// (FS-X2CMM §J R51)
	var afloatBlockers wallTests

	for _, entity := range movers {
		targetEntity := entity
		transformComp, _ := targetEntity.GetComponent(ecs.ComponentTypeTransform)
		// type assertion
		transform := transformComp.(*components.TransformComponent)
		// calculate if there are other nearby entities in the 9-grid cells around this targetentity
		cellX := int(transform.X / hashCellSize)
		cellY := int(transform.Y / hashCellSize)

		// a charge or a roll in flight replaces the walk: held input neither
		// adds to it nor steers it, so it can never stack into a faster move,
		// and nothing that scales a walk scales it (FS-7P736 §A R3)
		var dx, dy, carryStep float64
		carry, carrying := carryOf(targetEntity)
		if carrying {
			carryStep = min(carry.Speed*deltaTime, max(carry.Remaining, 0))
			dx, dy = carry.DirX*carryStep, carry.DirY*carryStep
		} else {
			velocityComp, _ := targetEntity.GetComponent(ecs.ComponentTypeVelocity)
			velocity := velocityComp.(*components.VelocityComponent)
			speed := velocity.Speed * walkFactor(targetEntity)
			dx = velocity.VX * speed * deltaTime
			dy = velocity.VY * speed * deltaTime
		}

		// an afloat body passes a chasm's pits; walls, closed doors and
		// blocks stop it as they stop anyone. Its carry passes them too, as its
		// walk does: a roll begun over a pit is never pushed out of it
		// (FS-7P736 Reconciled at build (I-7P736-1))
		walls := blockers
		if afloat(targetEntity) {
			if afloatBlockers == nil {
				afloatBlockers = blockers.passingPits()
			}
			walls = afloatBlockers
		}

		// split-axis swept collision against walls and closed doors, X first
		newX := transform.X + dx*walls.sweepX(transform.X, transform.Y, dx)

		// Y second
		newY := transform.Y + dy*walls.sweepY(newX, transform.Y, dy)

		// check collision in 9-grid and resolve position by hashmap; a carry
		// runs through bodies, as the teleport the charge replaced did
		for i := -1; i <= 1 && !carrying; i++ {
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
		newX, newY = walls.depenetrate(newX, newY)

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
		// a charge or a roll stopped short by a wall, a closed door, a block
		// or the edge is over
		if carrying {
			if math.Hypot(newX-(transform.X+dx), newY-(transform.Y+dy)) > carryEpsilon {
				carry.Remaining = 0
			} else {
				carry.Remaining -= carryStep
			}
		}

		// update position based on velocity
		transform.X = newX
		transform.Y = newY

	}

}

// reachStep is the longest leg Reach sweeps at once, px. Each leg is swept
// continuously, so the length only bounds how far a landing strays from the
// line, never what it can pass through.
const reachStep = constants.PlayerRadius / 4

// reachBisections is how finely Reach places a landing short of rock: a leg
// halved this many times, well under a pixel.
const reachBisections = 24

/*
Reach is where a body standing at from lands moving straight toward to: to
itself, or the farthest point short of the first thing on the line that blocks
a walk, a wall, a closed door, the world's edge or, given a Grid, a cell that
is not walkable. Bodies never block it. Nothing beyond the first blocker is
reached, even with open ground past it. FS-04EEA §D R19–R20.

The line is cut into legs of at most reachStep, and each leg is swept as a
walk's step is, X then Y, against the walls and closed doors: so no wall,
however thin, is crossed. A leg either axis's sweep cuts short ends the move
there; it never slides along what stopped it. On a dungeon floor each leg is
first tested against the grid, and one that would touch rock is cut back to
where it stops touching.
*/
func (s *MovementSystem) Reach(entities []*ecs.Entity, fromX, fromY, toX, toY float64) (float64, float64) {
	dx, dy := toX-fromX, toY-fromY
	length := math.Hypot(dx, dy)
	if length == 0 {
		return fromX, fromY
	}
	share := s.shareInside(fromX, fromY, dx, dy)
	if share <= 0 {
		return fromX, fromY
	}
	dx, dy = dx*share, dy*share

	blockers := withStoneBlocks(s.wallIndexOf(wallsAndDoors(entities)), entities)
	legs := max(1, int(math.Ceil(length*share/reachStep)))
	legX, legY := dx/float64(legs), dy/float64(legs)

	x, y := fromX, fromY
	for range legs {
		share, stopped := 1.0, false
		if s.Grid != nil && !s.Grid.Clear(x, y, x+legX, y+legY, constants.PlayerRadius) {
			share, stopped = s.clearShare(x, y, legX, legY), true
		}
		var cut bool
		x, y, cut = sweepLeg(blockers, x, y, legX*share, legY*share)
		if stopped || cut {
			break
		}
	}
	return x, y
}

// legSweeps bounds how often sweepLeg shrinks a leg before it settles for
// the last point it found clear off the line.
const legSweeps = 8

// sweepLeg moves a body from (x, y) by (dx, dy), swept X then Y against the
// walls and closed doors, and reports whether anything cut the leg short. A
// leg cut short is swept again at the share it reached, until the whole of
// that share passes on both axes: so the body stops on the line, never ahead
// of it on the axis that was not cut.
func sweepLeg(blockers wallTests, x, y, dx, dy float64) (float64, float64, bool) {
	share, cut := 1.0, false
	// the last point reached clear, the fallback if the share never settles
	clearX, clearY := x, y
	for range legSweeps {
		tX := blockers.sweepX(x, y, dx*share)
		nextX := x + dx*share*tX
		tY := blockers.sweepY(nextX, y, dy*share*tX)
		if tX == 1 && tY == 1 {
			return x + dx*share, y + dy*share, cut
		}
		clearX, clearY = nextX, y+dy*share*tX*tY
		share *= tX * tY
		cut = true
		if share == 0 {
			break
		}
	}
	return clearX, clearY, true
}

// shareInside is the share, 0 to 1, of the move (dx, dy) from (x, y) a body
// makes before it would leave this world's bounds.
func (s *MovementSystem) shareInside(x, y, dx, dy float64) float64 {
	width, height := s.bounds()
	r := constants.PlayerRadius
	share := 1.0
	if dx > 0 {
		share = min(share, (width-r-x)/dx)
	} else if dx < 0 {
		share = min(share, (r-x)/dx)
	}
	if dy > 0 {
		share = min(share, (height-r-y)/dy)
	} else if dy < 0 {
		share = min(share, (r-y)/dy)
	}
	return max(share, 0)
}

// clearShare is the largest share of the leg (dx, dy) from (x, y) the grid
// finds clear, found by halving: a leg is shorter than half a cell, so the
// grid tests it as one box, and a shorter share is clear whenever a longer one
// is.
func (s *MovementSystem) clearShare(x, y, dx, dy float64) float64 {
	lo, hi := 0.0, 1.0
	for range reachBisections {
		mid := (lo + hi) / 2
		if s.Grid.Clear(x, y, x+dx*mid, y+dy*mid, constants.PlayerRadius) {
			lo = mid
		} else {
			hi = mid
		}
	}
	return lo
}

// wallsAndDoors picks the walls and the doors out of the entities.
func wallsAndDoors(entities []*ecs.Entity) (walls, doors []*ecs.Entity) {
	for _, entity := range entities {
		if entity.HasComponent(ecs.ComponentTypeWall) {
			walls = append(walls, entity)
		}
		if entity.HasComponent(ecs.ComponentTypeDoor) {
			doors = append(doors, entity)
		}
	}
	return walls, doors
}

// walkFactor is what the entity's walk is paced at this tick, as a share of
// its move speed: 0 while pinned, else 1. It scales the walk only, never
// VelocityComponent itself: the held direction is kept through the pin, so the
// body walks it on the first tick after, and Speed stays what gear set and the
// wire reports. FS-JS7C8 §Change: Attacking pins the attacker R49, R52.
func walkFactor(entity *ecs.Entity) float64 {
	if entity.HasComponent(ecs.ComponentTypeAttackPin) {
		return 0
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
