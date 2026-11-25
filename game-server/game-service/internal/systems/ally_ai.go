package systems

import (
	"cmp"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
AllyAISystem decides what each hired ally does this tick (FS-4EC7Z §C R9):
fight, follow or stand. Its leader is its hirer while they are in play, else
the nearest delver in play. It engages the nearest live monster within Engage
of itself or after its hirer that its route search can reach and that stands
within Leash of its leader, walks into its sheet's reach and strikes it on its
sheet's cadence, an attack intent the CombatSystem resolves later in the same
tick through the one hit path. Past Leash of its leader itself, it engages
nothing. With none to fight it follows its leader: it sets off once past Far
of them and stops once within Near, so it keeps between the two. With no
delver in play it stands where it is.

It keeps the monster it engages while that one still qualifies, and looks
again for the nearest every engageInterval, so an unreachable monster costs a
route search that often, not every tick.

It only sets an ally's velocity, facing and action, as the monster AI does a
monster's: MovementSystem moves and collides it. On a dungeon floor it walks
by path over the floor's grid, the monsters' own, so a shut gate, a pit, a
block or a secret door is walked round as a monster walks round it. Runs in a
run only, before movement.
*/
type AllyAISystem struct {
	route router
	reach AllyReach
	// path is the scratch a reach test's route search fills
	path []int
}

// engageInterval is how often, in seconds, an ally looks again for the
// nearest monster to engage: a route search's own repath interval.
const engageInterval = repathInterval

// AllyReach is how far an ally keeps from its leader, Near to Far, how near
// a monster must be for it to engage, and how far from its leader it may
// fight, all in px (FS-4EC7Z §C R9).
type AllyReach struct {
	Near, Far, Engage, Leash float64
}

// NewAllyAISystem is the ally AI for one floor: grid is the floor's cell grid
// on a dungeon floor, nil on any other.
func NewAllyAISystem(grid NavGrid, reach AllyReach) *AllyAISystem {
	return &AllyAISystem{route: router{grid}, reach: reach}
}

// foe is a live monster an ally may fight: where it stands and whom it is
// after.
type foe struct {
	id     uuid.UUID
	at     *components.TransformComponent
	target uuid.UUID
}

// leader is a delver in play an ally may follow.
type leader struct {
	id     uuid.UUID
	member uuid.UUID
	at     *components.TransformComponent
}

// company is who an ally answers to this tick: its hirer, while in play, and
// its leader, the one it follows and is leashed to (its hirer, else the
// nearest delver in play), while it has one.
type company struct {
	hirer       leader
	hirerInPlay bool
	lead        leader
	led         bool
}

// NOTE: this runs every game tick of a run, before MovementSystem.
func (s *AllyAISystem) Update(deltaTime float64, entities []*ecs.Entity) {
	var foes []foe
	var leaders []leader
	for _, e := range entities {
		tc, ok := e.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		at := tc.(*components.TransformComponent)
		switch BodyKindOf(e) {
		case BodyMonster:
			mc, _ := e.GetComponent(ecs.ComponentTypeEnemy)
			foes = append(foes, foe{id: e.ID, at: at, target: mc.(*components.MonsterComponent).Target})
		case BodyDelver:
			pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
			leaders = append(leaders, leader{id: e.ID, member: pc.(*components.PlayerComponent).MemberID, at: at})
		}
	}

	for _, e := range entities {
		if BodyKindOf(e) != BodyAlly {
			continue
		}
		ac, isAlly := e.GetComponent(ecs.ComponentTypeAlly)
		tc, placed := e.GetComponent(ecs.ComponentTypeTransform)
		vc, moves := e.GetComponent(ecs.ComponentTypeVelocity)
		if !isAlly || !placed || !moves {
			continue
		}
		nc, _ := e.GetComponent(ecs.ComponentTypeEncounterNPC)
		s.think(deltaTime, e, nc.(*components.EncounterNPCComponent), ac.(*components.AllyComponent),
			tc.(*components.TransformComponent), vc.(*components.VelocityComponent), foes, leaders)
	}
}

// think runs one ally's tick: fight the foe it engages, else follow its
// leader, else stand.
func (s *AllyAISystem) think(
	deltaTime float64,
	entity *ecs.Entity,
	npc *components.EncounterNPCComponent,
	ally *components.AllyComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
	foes []foe,
	leaders []leader,
) {
	ally.AttackCooldown = max(ally.AttackCooldown-deltaTime, 0)
	ally.Route.SearchIn = max(ally.Route.SearchIn-deltaTime, 0)
	ally.EngageIn = max(ally.EngageIn-deltaTime, 0)

	var c company
	c.hirer, c.hirerInPlay = hirerAmong(npc.HirerID, leaders)
	c.lead, c.led = c.hirer, c.hirerInPlay
	if !c.led {
		c.lead, c.led = nearestLeader(at, leaders)
	}
	target, fighting := s.engage(ally, at, c, foes)
	if target.id != ally.Target {
		ally.Target = target.id
		forget(&ally.Route)
	}
	if fighting {
		s.fight(entity, npc, ally, at, velocity, target)
		return
	}

	if !c.led {
		ally.Following = false
		stand(npc, velocity)
		return
	}
	lead := c.lead
	d := math.Hypot(lead.at.X-at.X, lead.at.Y-at.Y)
	switch {
	case d > s.reach.Far:
		ally.Following = true
	case d <= s.reach.Near:
		ally.Following = false
	}
	if !ally.Following {
		stand(npc, velocity)
		return
	}
	s.walk(npc, ally, at, velocity, lead.at.X, lead.at.Y)
}

/*
engage is the monster the ally at at fights this tick; false with none. Past
Leash of its leader it fights none. It keeps its target while that one still
qualifies; else, and every engageInterval, it takes the nearest that does and
that its route search reaches.
*/
func (s *AllyAISystem) engage(ally *components.AllyComponent, at *components.TransformComponent, c company, foes []foe) (foe, bool) {
	if c.led && s.reach.Leash > 0 && math.Hypot(c.lead.at.X-at.X, c.lead.at.Y-at.Y) > s.reach.Leash {
		return foe{}, false
	}
	var candidates []foe
	var current foe
	keeping := false
	for _, f := range foes {
		if !s.qualifies(f, at, c) {
			continue
		}
		candidates = append(candidates, f)
		if f.id == ally.Target {
			current, keeping = f, true
		}
	}
	if keeping && ally.EngageIn > 0 {
		return current, true
	}
	ally.EngageIn = engageInterval
	slices.SortStableFunc(candidates, func(a, b foe) int {
		return cmp.Compare(math.Hypot(a.at.X-at.X, a.at.Y-at.Y), math.Hypot(b.at.X-at.X, b.at.Y-at.Y))
	})
	for _, f := range candidates {
		if s.reaches(at, f.at) {
			return f, true
		}
	}
	return foe{}, false
}

// qualifies is whether f may be engaged by an ally at at: within Engage of it
// or after its hirer in play, and within Leash of its leader when it has one.
func (s *AllyAISystem) qualifies(f foe, at *components.TransformComponent, c company) bool {
	near := math.Hypot(f.at.X-at.X, f.at.Y-at.Y) <= s.reach.Engage
	afterHirer := c.hirerInPlay && f.target == c.hirer.id
	if !near && !afterHirer {
		return false
	}
	return !c.led || s.reach.Leash <= 0 || math.Hypot(f.at.X-c.lead.at.X, f.at.Y-c.lead.at.Y) <= s.reach.Leash
}

// reaches is whether a route search from at finds a way to to over the
// floor's grid as it stands now, a shut gate or a block in the way. With no
// grid, or either end off it, a body steers straight, and so reaches it.
func (s *AllyAISystem) reaches(at, to *components.TransformComponent) bool {
	grid := s.route.grid
	if grid == nil {
		return true
	}
	from, onGround := grid.Cell(at.X, at.Y)
	goal, goalOnGround := grid.Cell(to.X, to.Y)
	if !onGround || !goalOnGround || grid.Near(from, goal) {
		return true
	}
	var found bool
	s.path, found = grid.Path(s.path[:0], from, goal)
	return found
}

// fight walks the ally into its reach of target, then stands and faces it,
// striking once its cadence allows.
func (s *AllyAISystem) fight(
	entity *ecs.Entity,
	npc *components.EncounterNPCComponent,
	ally *components.AllyComponent,
	at *components.TransformComponent,
	velocity *components.VelocityComponent,
	target foe,
) {
	ally.Following = false
	if math.Hypot(target.at.X-at.X, target.at.Y-at.Y) > ally.AttackRange {
		s.walk(npc, ally, at, velocity, target.at.X, target.at.Y)
		return
	}
	velocity.VX, velocity.VY = 0, 0
	faceNPC(npc, at, target.at.X, target.at.Y)
	if ally.AttackCooldown > 0 {
		npc.Action = components.EncounterActionIdle
		return
	}
	ally.AttackCooldown = ally.AttackInterval
	strike(entity, components.AttackIntent{Kind: components.AttackAllyStrike, TargetEntityID: target.id})
	npc.Action = components.EncounterActionAttack
}

// walk steers the ally at full pace for (x, y), by path on a dungeon floor.
func (s *AllyAISystem) walk(npc *components.EncounterNPCComponent, ally *components.AllyComponent, at *components.TransformComponent, velocity *components.VelocityComponent, x, y float64) {
	px, py := s.route.towards(&ally.Route, at, x, y)
	faceNPC(npc, at, px, py)
	velocity.VX, velocity.VY = npc.FacingX, npc.FacingY
	npc.Action = components.EncounterActionMove
}

// stand holds the ally where it is, idle.
func stand(npc *components.EncounterNPCComponent, velocity *components.VelocityComponent) {
	velocity.VX, velocity.VY = 0, 0
	npc.Action = components.EncounterActionIdle
}

// faceNPC turns npc from at towards (x, y); a point under it leaves its
// facing as it was.
func faceNPC(npc *components.EncounterNPCComponent, at *components.TransformComponent, x, y float64) {
	dx, dy := x-at.X, y-at.Y
	if d := math.Hypot(dx, dy); d > 0 {
		npc.FacingX, npc.FacingY = dx/d, dy/d
	}
}

// hirerAmong is the leader whose member id is hirer; false when they are not
// in play.
func hirerAmong(hirer uuid.UUID, leaders []leader) (leader, bool) {
	for _, l := range leaders {
		if l.member == hirer {
			return l, true
		}
	}
	return leader{}, false
}

// nearestLeader is the delver in play nearest at; false with none.
func nearestLeader(at *components.TransformComponent, leaders []leader) (leader, bool) {
	var best leader
	bestDistance := math.Inf(1)
	for _, l := range leaders {
		if d := math.Hypot(l.at.X-at.X, l.at.Y-at.Y); d < bestDistance {
			best, bestDistance = l, d
		}
	}
	return best, !math.IsInf(bestDistance, 1)
}
