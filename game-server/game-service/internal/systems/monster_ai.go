package systems

import (
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
MonsterAISystem decides what each living monster does this tick: wander,
chase, wind up or strike. FS-77AB6 §Requirements 26. A demon, with the claw
on its sheet, picks between its two moves: the slam when it has cooled, the
fire claw otherwise (FS-VHGE7 §B R18). A ranged monster, with a shot on its
sheet, chases until it is in its shooting range with line of sight, and
shoots where the others strike (FS-B4SG9 §A R4–R6). A monster with an ability
on its sheet uses it in place of a swing when it is ready and its target is
inside its distances (FS-C8VM7 §B R12; monster_ability.go). A stunned monster
does none of it until its stun runs out (FS-04EEA §C; stun).

It only sets a monster's velocity, facing and AI state. MovementSystem moves
and collides it, exactly as it does a delver, and a strike is an attack intent
the CombatSystem resolves later in the same tick. The one exception is a
Ravener's pounce: the leap moves the monster itself, colliding with nothing
(pounce, monster_ability.go). Runs in a run only, before movement.

On a dungeon floor it is given the floor's cell grid, and monsters chase,
wander and walk home by A* paths over it (FS-KE075 §D, ADR-0062). With no grid
(floors 2-3, the fields) they steer straight, as before.
*/
type MonsterAISystem struct {
	// roll draws uniformly from [0, 1) for wander destinations; injected so
	// tests can pin it
	roll func() float64
	// grid is the dungeon floor's cell grid, nil on any other floor
	grid NavGrid
	// cells is a wander pick's scratch
	cells []int
	// nights is this tick's warriors under the Long Night (book_long_night.go)
	nights []longNight
}

/*
NavGrid is a dungeon floor's cell grid as the monster AI reads it (FS-KE075
§D). Cells are numbered by the grid; bodies are not obstacles to it.
*/
type NavGrid interface {
	// Cell is the walkable cell holding (x, y); false on rock or off the grid.
	Cell(x, y float64) (int, bool)
	// Centre is a cell's centre in px.
	Centre(cell int) (x, y float64)
	// Near reports whether b is a's cell or one legal step from it.
	Near(a, b int) bool
	// Path appends a shortest path of cells from from to to, both included,
	// to dst; false, and dst as given, when there is none.
	Path(dst []int, from, to int) ([]int, bool)
	// Clear reports whether a body of half-size half moving straight from a to
	// b overlaps only walkable cells.
	Clear(ax, ay, bx, by, half float64) bool
	// Within appends the walkable cells whose centres lie within radius of
	// (x, y) to dst.
	Within(dst []int, x, y, radius float64) []int
}

// NewMonsterAISystem is the monster AI for one floor: grid is the floor's
// cell grid on a dungeon floor, nil on any other.
func NewMonsterAISystem(roll func() float64, grid NavGrid) *MonsterAISystem {
	return &MonsterAISystem{roll: roll, grid: grid}
}

// quarry is a body a monster may chase, an in-play delver, an encounter NPC
// out of a cage or a standing hound: what it is and where it stands.
type quarry struct {
	id uuid.UUID
	at *components.TransformComponent
}

// NOTE: this runs every game tick, before MovementSystem.
func (s *MonsterAISystem) Update(deltaTime float64, entities []*ecs.Entity) {
	targets := quarries(entities)
	s.nights = longNights(s.nights[:0], entities)

	for _, entity := range entities {
		mc, isMonster := entity.GetComponent(ecs.ComponentTypeEnemy)
		if !isMonster || !alive(entity) {
			continue
		}
		monster := mc.(*components.MonsterComponent)

		tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		vc, hasVelocity := entity.GetComponent(ecs.ComponentTypeVelocity)
		if !hasTransform || !hasVelocity {
			continue
		}
		at := tc.(*components.TransformComponent)
		velocity := vc.(*components.VelocityComponent)

		s.think(deltaTime, entity, monster, at, velocity, targets)
	}
	s.runHounds(deltaTime, entities) // the archers' hounds, after them (book_hound.go)
}

// think runs one monster's tick: keep, drop or acquire a target, then stand
// out a stun, or wind up, strike, show a claw out, chase or wander.
func (s *MonsterAISystem) think(
	deltaTime float64,
	entity *ecs.Entity,
	monster *components.MonsterComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
	targets []quarry,
) {
	monster.AttackCooldown = max(monster.AttackCooldown-deltaTime, 0)
	// the slam cools whatever it does: wandering, chasing, leashing home
	monster.SlamCooldownRemaining = max(monster.SlamCooldownRemaining-deltaTime, 0)
	// and so does a monster ability (FS-C8VM7 §B R12)
	monster.AbilityCooldown = max(monster.AbilityCooldown-deltaTime, 0)
	monster.Route.SearchIn = max(monster.Route.SearchIn-deltaTime, 0)
	// a stun runs out on its own clock, whatever else it does (FS-04EEA §C R15)
	monster.StunRemaining = max(monster.StunRemaining-deltaTime, 0)

	// a fleeing monster turns on no one and answers no hit until it arrives;
	// a stun still holds it (FS-4EC7Z §E R18)
	if monster.Flight.Fleeing {
		monster.LastAttacker = uuid.Nil
		if monster.StunRemaining > stunEpsilon {
			s.stunned(deltaTime, entity, monster, at, velocity)
			return
		}
		s.flee(deltaTime, monster, at, velocity)
		return
	}

	// the Long Night turns it on the warrior first (FS-X2CMM §E R31)
	s.taunt(monster, at)
	target, hunting := s.target(monster, at, targets)

	if monster.StunRemaining > stunEpsilon {
		s.stunned(deltaTime, entity, monster, at, velocity)
		return
	}

	if monster.AbilityPending.Remaining > 0 {
		s.windUpAbility(deltaTime, entity, monster, at, velocity, target, hunting)
		return
	}
	if monster.WindUpRemaining > 0 {
		s.windUp(deltaTime, entity, monster, at, velocity, target, hunting)
		return
	}
	if monster.ClawShowRemaining > 0 {
		monster.ClawShowRemaining -= deltaTime
		if monster.ClawShowRemaining > 0 {
			// the claw already landed: it stands its show out, whoever left,
			// facing its target while it has one (FS-VHGE7 §B R24)
			velocity.VX, velocity.VY = 0, 0
			if hunting {
				face(monster, at, target.at)
			}
			monster.Action = components.MonsterActionClaw
			return
		}
		monster.ClawShowRemaining = 0
	}

	if !hunting {
		s.wander(deltaTime, monster, at, velocity)
		return
	}

	// a ready ability takes the next swing's place, and a monster out of its
	// reach but inside the ability's distances stops chasing to use it
	// (FS-C8VM7 §B R12)
	if s.abilityReady(monster, at, target) {
		startAbility(monster, at, velocity, target)
		return
	}

	// out of range, or a ranged monster with rock in its shot's flight: it
	// walks, by path on a dungeon floor, which brings it round the corner
	// (FS-B4SG9 §A R4)
	if distance(at, target.at) > monster.AttackRange || !s.sees(monster, at, target.at) {
		s.chase(monster, at, velocity, target)
		return
	}

	// in range and in sight: stand and face it, and swing once the interval
	// has elapsed
	velocity.VX, velocity.VY = 0, 0
	face(monster, at, target.at)
	if monster.AttackCooldown > 0 {
		// any action but a strike's between swings, so each one reads as new
		monster.Action = components.MonsterActionIdle
		return
	}
	monster.AttackCooldown = monster.AttackInterval
	if monster.Claw && monster.SlamCooldownRemaining > 0 {
		claw(entity, monster, target)
		return
	}
	monster.WindUpRemaining = monster.WindUp
	monster.SlamCooldownRemaining = monster.SlamCooldown
	monster.Action = components.MonsterActionAttack
}

// stunEpsilon absorbs the float drift of summing tick lengths, so a stun
// ends on the tick its length is used up.
const stunEpsilon = 1e-9

/*
stun lands a stun of seconds on a living monster. A second stun leaves the
longer of the two remaining, never their sum. A wind-up in progress, a strike,
a slam, a draw or a monster ability still on the ground, ends with nothing
landing, the cooldowns it started left spent; a claw's show gives way to the
stun. A leap already in the air is left to land. FS-04EEA §C R14, R16, R17.
*/
func stun(monster *components.MonsterComponent, seconds float64) {
	monster.StunRemaining = max(monster.StunRemaining, seconds)
	monster.WindUpRemaining = 0
	if !monster.AbilityPending.Leaping {
		monster.AbilityPending = components.PendingAbility{}
	}
	monster.ClawShowRemaining = 0
	monster.Action = components.MonsterActionStunned
}

// stunned is a stunned monster's tick once its timers have run and its target
// is settled: it stands, without turning, and starts nothing. A leap already
// in the air flies on and lands its area, and the stun holds it where it
// lands. FS-04EEA §C R13–R15; §Edge States "Stun on a monster mid-leap".
func (s *MonsterAISystem) stunned(
	deltaTime float64,
	entity *ecs.Entity,
	monster *components.MonsterComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
) {
	velocity.VX, velocity.VY = 0, 0
	if monster.AbilityPending.Leaping {
		s.pounce(deltaTime, entity, monster, at)
	}
	monster.Action = components.MonsterActionStunned
}

// claw lands a demon's fire claw on its target in range this same tick, at 1 ×
// its level damage, and shows it as `claw` for its show window. FS-VHGE7 §B
// R17, R24.
func claw(entity *ecs.Entity, monster *components.MonsterComponent, target quarry) {
	monster.ClawShowRemaining = monster.ClawShowFor
	monster.Action = components.MonsterActionClaw
	strike(entity, components.AttackIntent{Kind: components.AttackMonsterStrike, TargetEntityID: target.id})
}

// strike hands a monster's landing strike, or its shot leaving, to the
// CombatSystem.
func strike(entity *ecs.Entity, intent components.AttackIntent) {
	ic, ok := entity.GetComponent(ecs.ComponentTypeAttackIntent)
	if !ok {
		return
	}
	intents := ic.(*components.AttackIntentComponent)
	intents.Pending = append(intents.Pending, intent)
}

// target settles who the monster is after this tick. The current target is kept
// while it is in play and inside the leash radius; otherwise it is dropped. With
// none, a delver who hit it since its last tick is taken up at any distance,
// else the nearest delver inside its aggro radius. A hit is answered once.
//
// A target taken up for a hit from beyond the leash radius is exempt from the
// leash until the monster has closed inside that radius of them once, so a
// kiting archer gets no free kills. FS-77AB6 §Requirements 26 "Leash"
// (user decision 2026-10-09).
func (s *MonsterAISystem) target(monster *components.MonsterComponent, at *components.TransformComponent, targets []quarry) (quarry, bool) {
	attacker := monster.LastAttacker
	monster.LastAttacker = uuid.Nil

	target, ok := find(monster.Target, targets)
	if ok {
		if distance(at, target.at) <= monster.LeashRadius {
			monster.Retaliating = false
		} else if !monster.Retaliating && !monster.Taunted {
			ok = false
		}
	}
	if !ok {
		target, ok = find(attacker, targets)
		monster.Retaliating = ok && distance(at, target.at) > monster.LeashRadius
	}
	if !ok {
		target, ok = nearest(at, monster.AggroRadius, targets)
	}

	if !ok {
		if monster.Target != uuid.Nil {
			forget(&monster.Route)
		}
		monster.Target = uuid.Nil
		return quarry{}, false
	}
	if monster.Target != target.id {
		monster.Target = target.id
		// back from the hunt, it walks somewhere fresh, not to a stale spot
		monster.Wander = components.Wandering{}
		forget(&monster.Route)
	}
	return target, true
}

// windUp holds a monster still through its wind-up and, when it ends, strikes if
// the target is still within range × 1.25; otherwise the swing whiffs. A
// demon's wind-up strike is its slam (FS-VHGE7 §B R16).
//
// A ranged monster's wind-up is its draw: it keeps turning to face its target,
// so the draw points where the shot will go, and when it ends it shoots at
// where the target it has then stands, whatever the distance (FS-B4SG9 §A R7,
// R8).
func (s *MonsterAISystem) windUp(
	deltaTime float64,
	entity *ecs.Entity,
	monster *components.MonsterComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
	target quarry,
	hunting bool,
) {
	velocity.VX, velocity.VY = 0, 0
	monster.Action = components.MonsterActionAttack
	ranged := shoots(monster)
	if ranged && hunting {
		face(monster, at, target.at)
	}

	monster.WindUpRemaining -= deltaTime
	if monster.WindUpRemaining > 0 {
		return
	}
	monster.WindUpRemaining = 0

	if !hunting {
		return
	}
	if ranged {
		strike(entity, components.AttackIntent{
			Kind:    components.AttackMonsterShot,
			TargetX: target.at.X,
			TargetY: target.at.Y,
		})
		return
	}
	if distance(at, target.at) > monster.AttackRange*strikeReach {
		return
	}
	// a demon's slam hits at its multiple; every other strike at the row's 1
	strike(entity, components.AttackIntent{
		Kind:           components.AttackMonsterStrike,
		TargetEntityID: target.id,
		Coefficient:    monster.SlamMultiplier,
	})
}

// shoots reports whether a monster is a ranged one: its sheet carries a shot
// (FS-B4SG9 §A R1).
func shoots(monster *components.MonsterComponent) bool {
	return monster.ShotProjectileType != ""
}

// sees reports whether a monster has line of sight to a point: the straight
// flight of its shot from where it stands, at the shot's radius, crosses
// walkable cells only. Bodies never block it. It gates the start of a ranged
// monster's wind-up and nothing else: aggro, retaliation and the leash stay
// distance-only (ADR-0062 Decision 6). A monster without a shot is never
// tested, and with no grid sight always holds (FS-B4SG9 §A R5).
func (s *MonsterAISystem) sees(monster *components.MonsterComponent, at, toward *components.TransformComponent) bool {
	if !shoots(monster) || s.grid == nil {
		return true
	}
	return s.grid.Clear(at.X, at.Y, toward.X, toward.Y, monster.ShotRadius)
}

// A strike lands on a target still within this multiple of the attack range
// when the wind-up ends. FS-77AB6 §Requirements 26 "Attack".
const strikeReach = 1.25

// wander walks a monster with no target to random spots around home: on a
// dungeon floor to the centres of walkable cells near home, by path, which is
// also how a leashed monster gets home (FS-KE075 §D R25).
func (s *MonsterAISystem) wander(deltaTime float64, monster *components.MonsterComponent, at *components.TransformComponent, velocity *components.VelocityComponent) {
	pick := func() (float64, float64) { return s.nearHome(monster) }
	var via func(x, y float64) (float64, float64)
	if s.grid != nil {
		pick = func() (float64, float64) { return s.cellNearHome(monster) }
		via = func(x, y float64) (float64, float64) { return s.towards(monster, at, x, y) }
	}
	walk(deltaTime, &monster.Wander, monsterPace, at, velocity, pick, via)

	if velocity.VX == 0 && velocity.VY == 0 {
		monster.Action = components.MonsterActionIdle
		return
	}
	monster.FacingX, monster.FacingY = velocity.VX, velocity.VY
	monster.Action = components.MonsterActionMove
}

var monsterPace = pace{pause: constants.MonsterPauseSeconds, stall: constants.MonsterStallSeconds}

// nearHome is a point drawn uniformly over the disc of the home radius round
// home: a wander destination on a floor with no grid.
func (s *MonsterAISystem) nearHome(monster *components.MonsterComponent) (float64, float64) {
	r := constants.MonsterHomeRadius * math.Sqrt(s.roll())
	angle := 2 * math.Pi * s.roll()
	return monster.HomeX + r*math.Cos(angle), monster.HomeY + r*math.Sin(angle)
}

// cellNearHome is the centre of a walkable cell within the home radius of
// home, each as likely as any other: a wander destination on a dungeon floor,
// always reachable since the floor is connected (FS-KE075 §D R25). A home
// with no such cell, which a dungeon floor's spawn never gives, falls back to
// nearHome.
func (s *MonsterAISystem) cellNearHome(monster *components.MonsterComponent) (float64, float64) {
	s.cells = s.grid.Within(s.cells[:0], monster.HomeX, monster.HomeY, constants.MonsterHomeRadius)
	if len(s.cells) == 0 {
		return s.nearHome(monster)
	}
	i := min(int(s.roll()*float64(len(s.cells))), len(s.cells)-1)
	return s.grid.Centre(s.cells[i])
}

// chase steers at the target at full speed: straight with no grid, where a
// wall in between body-blocks it (FS-77AB6 §Out of Scope); by path on a
// dungeon floor (FS-KE075 §D R23).
func (s *MonsterAISystem) chase(monster *components.MonsterComponent, at *components.TransformComponent, velocity *components.VelocityComponent, target quarry) {
	x, y := s.towards(monster, at, target.at.X, target.at.Y)
	faceAt(monster, at, x, y)
	velocity.VX, velocity.VY = monster.FacingX, monster.FacingY
	monster.Action = components.MonsterActionMove
}

// repathInterval is the shortest time between two searches by one monster
// (FS-KE075 §D R24, ADR-0062 Decision 4).
const repathInterval = 0.5

// lookahead is how many cells past the one it steers for a monster looks for
// a straight walk it can take instead, cutting the path's corners.
const lookahead = 4

/*
towards is the point a monster at at steers for this tick to reach (x, y).

With no grid that is (x, y) itself. On a dungeon floor it is (x, y) too when
the two share a cell or are one legal step apart, or when either is off the
walkable cells; otherwise it is the next point of the monster's path there
(FS-KE075 §D R23). The path is searched again when the goal has moved to
another cell or the path is used up, and never more often than every
repathInterval (R24); between searches the monster keeps to the path it has, and with its
path used up it holds on its own cell's centre. A search that finds nothing
leaves it steering straight at (x, y) until its next search (R27).
*/
func (s *MonsterAISystem) towards(monster *components.MonsterComponent, at *components.TransformComponent, x, y float64) (float64, float64) {
	return router{s.grid}.towards(&monster.Route, at, x, y)
}

// router walks a body along a route over a floor's grid: a monster's, and a
// hired ally's and a hound's (book_hound.go) the same way (FS-4EC7Z §C R9). With no grid it steers
// straight.
type router struct {
	grid NavGrid
}

// towards is the point a body at at steers for this tick to reach (x, y)
// along route, as MonsterAISystem.towards tells.
func (s router) towards(route *components.Route, at *components.TransformComponent, x, y float64) (float64, float64) {
	if s.grid == nil {
		return x, y
	}
	from, onGround := s.grid.Cell(at.X, at.Y)
	goal, goalOnGround := s.grid.Cell(x, y)
	if !onGround || !goalOnGround || s.grid.Near(from, goal) {
		return x, y
	}

	if (route.Goal != goal || route.Next >= len(route.Cells)) && route.SearchIn <= 0 {
		s.search(route, from, goal)
	}
	if px, py, ok := s.follow(route, from, at); ok {
		return px, py
	}
	if len(route.Cells) > 0 {
		// used up, and not yet allowed to search again: from its own cell's
		// centre any path is clear
		return s.grid.Centre(from)
	}
	return x, y
}

// search finds a new path from cell from to goal, and starts the repath
// interval whether or not it finds one.
func (s router) search(route *components.Route, from, goal int) {
	route.SearchIn = repathInterval
	route.Goal = goal
	route.Next = 0
	var found bool
	// with no path, Path hands the emptied buffer back: no route to follow
	route.Cells, found = s.grid.Path(route.Cells[:0], from, goal)
	if !found {
		slog.Debug("Monster found no path: steering straight until its next search", "from", from, "to", goal)
	}
}

/*
follow is the point a monster at at, in cell from, steers for along its route.

Its progress is the last cell of the route it has stood in: Next, moved on
when it stands in one of the cells ahead, the next few after Next that it
steers among. It steers for the centre of the farthest of those it can walk to
straight without its body overlapping rock, so it cuts the path's corners only where the cut is clear
(ADR-0062 Consequences "smoothing"). With none clear, a cut that grazed a
corner say, it goes back to its own cell's centre, from where the next cell of
its path is a legal step and so clear. Standing there with still none clear,
it was pushed off its route; standing in the route's last cell, it has
reached it. Either way the route is used up and follow reports false, as it
does with no route.
*/
func (s router) follow(route *components.Route, from int, at *components.TransformComponent) (float64, float64, bool) {
	last := len(route.Cells) - 1
	// a corner cut can land it in any cell ahead, the farthest included,
	// without its standing in those between
	for i := min(last, route.Next+1+lookahead); i > route.Next; i-- {
		if route.Cells[i] == from {
			route.Next = i
			break
		}
	}
	if route.Next >= last {
		route.Next = len(route.Cells)
		return 0, 0, false
	}

	best := -1
	for i := route.Next + 1; i <= min(last, route.Next+1+lookahead); i++ {
		cx, cy := s.grid.Centre(route.Cells[i])
		if s.grid.Clear(at.X, at.Y, cx, cy, constants.PlayerRadius) {
			best = i
		}
	}
	if best >= 0 {
		x, y := s.grid.Centre(route.Cells[best])
		return x, y, true
	}

	x, y := s.grid.Centre(from)
	if math.Hypot(x-at.X, y-at.Y) <= arrivalRadius {
		route.Next = len(route.Cells)
		return 0, 0, false
	}
	return x, y, true
}

// forget drops a route's path, keeping its buffer and its repath interval:
// a new target or destination is searched for, but no sooner than R24 allows.
func forget(route *components.Route) {
	route.Cells = route.Cells[:0]
	route.Next = 0
}

// face turns a monster towards a point. Facing is never zero: standing on the
// point, it keeps the way it faced.
func face(monster *components.MonsterComponent, at, toward *components.TransformComponent) {
	faceAt(monster, at, toward.X, toward.Y)
}

// faceAt turns a monster towards (x, y), keeping its facing when it stands on
// the point.
func faceAt(monster *components.MonsterComponent, at *components.TransformComponent, x, y float64) {
	dx, dy := x-at.X, y-at.Y
	d := math.Hypot(dx, dy)
	if d == 0 {
		return
	}
	monster.FacingX, monster.FacingY = dx/d, dy/d
}

func distance(a, b *components.TransformComponent) float64 {
	return math.Hypot(b.X-a.X, b.Y-a.Y)
}

// quarries is every body a monster hunts (BodyKind.Hunted): a delver in play
// (alive, not escaped, not left behind), a live encounter NPC out of a cage
// (FS-4EC7Z §A R3) and every hound standing (FS-X2CMM R28). Nobody else can
// be acquired, and a target who drops out of this is dropped.
func quarries(entities []*ecs.Entity) []quarry {
	var out []quarry
	for _, entity := range entities {
		if !BodyKindOf(entity).Hunted() {
			continue
		}
		tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		out = append(out, quarry{id: entity.ID, at: tc.(*components.TransformComponent)})
	}
	return out
}

// find is the quarry with this id among those in play.
func find(id uuid.UUID, targets []quarry) (quarry, bool) {
	if id == uuid.Nil {
		return quarry{}, false
	}
	for _, d := range targets {
		if d.id == id {
			return d, true
		}
	}
	return quarry{}, false
}

// nearest is the closest quarry within radius of at, by distance alone: no line
// of sight in v1.
func nearest(at *components.TransformComponent, radius float64, targets []quarry) (quarry, bool) {
	var best quarry
	bestDistance := math.Inf(1)
	for _, d := range targets {
		distance := math.Hypot(d.at.X-at.X, d.at.Y-at.Y)
		if distance <= radius && distance < bestDistance {
			best, bestDistance = d, distance
		}
	}
	return best, !math.IsInf(bestDistance, 1)
}
