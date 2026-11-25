package game

import (
	"errors"
	"log/slog"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* Contract marks (FS-4EC7Z §E). The mercenary's Take a Contract (FS-X2CMM)
* places the delve's one contract: a mark spawns far from the taker on their
* floor, a champion-scaled duelist with poison blades who calls three
* cutthroats at half its health and flees to heal at a quarter. The party
* killing it settles the contract, and the taker alone gains Contract
* Settled; the party climbing with it alive, or the taker dying or leaving,
* loses it. While it is active the taker is told the mark's rough heading.
*
* The contract lives on the run-level entity, so it outlives every floor and
* a second is refused; the mark is a floor monster, gone with its floor.
**/

// RefusalContractTaken is the reply's reason for a second contract in a
// delve, from which the client writes its own line. FS-4EC7Z §F R27.
const RefusalContractTaken = "contract_taken"

var (
	// ErrContractTaken refuses a contract once one was taken this delve.
	// FS-4EC7Z §E R16.
	ErrContractTaken = errors.New("a contract was already taken this delve")
	// ErrContractNoStairs refuses a contract on a floor without stairs, the
	// top: there is no climb to lose it to. FS-4EC7Z §E R16.
	ErrContractNoStairs = errors.New("no contract on a floor without stairs")
	// ErrNoMarkRoom refuses a contract on a floor with no room the mark may
	// spawn in (a floor of buildings, or every far room full); nothing is
	// taken. FS-4EC7Z §E R17.
	ErrNoMarkRoom = errors.New("no room on this floor holds a mark")
)

/**
* TakeContract is the contract entry point (FS-4EC7Z §E R16), the server side
* of FS-X2CMM's Take a Contract: it places the delve's one contract for
* taker, a member id, spawning its mark on the taker's floor. Refused,
* nothing changed: ErrContractTaken once a contract was taken this delve,
* ErrDelverOutOfPlay when the taker is not in play, ErrContractNoStairs on
* the top floor, ErrNoMarkRoom when no room holds the mark. It checks neither
* the page nor the class: the cast that calls it does. Call it on the tick,
* as every world change is made (a queued intent).
**/
func (s *Session) TakeContract(taker uuid.UUID) error {
	runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities())
	if !ok {
		return ErrNoMarkRoom
	}
	if runLevel.HasComponent(ecs.ComponentTypeContract) {
		return ErrContractTaken
	}
	body, ok := s.buyerInPlay(taker)
	if !ok {
		return ErrDelverOutOfPlay
	}
	floor, _ := systems.CurrentFloor(s.EntityManager.GetAllEntities())
	if !s.hasStairs(floor.Depth) {
		return ErrContractNoStairs
	}
	mark, ok := s.spawnMark(body, floor.Depth)
	if !ok {
		return ErrNoMarkRoom
	}

	contract := &components.ContractComponent{Taker: taker, Mark: mark.ID, State: components.ContractActive}
	s.refreshHeading(contract, body, mark)
	runLevel.AddComponent(contract)
	slog.Info("Contract taken", "sessionID", s.ID, "taker", taker, "mark", mark.ID, "floor", floor.Depth)
	return nil
}

// contract is the delve's contract; false before one is taken.
func (s *Session) contract() (*components.ContractComponent, bool) {
	runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities())
	if !ok {
		return nil, false
	}
	cc, ok := runLevel.GetComponent(ecs.ComponentTypeContract)
	if !ok {
		return nil, false
	}
	return cc.(*components.ContractComponent), true
}

/**
* spawnMark stands the mark (FS-4EC7Z §E R17-R18) on the floor at depth: in a
* room drawn from those at least the median walk from the taker's body, not
* the start, the stairs, a hidden or a respite room, at a spot clear of
* every delver by MonsterDelverExclusion; a champion at the floor's champion
* level in a look drawn from MarkLooks with its server name and the boss
* plate, its health scaled by the delvers in play. False when no room holds
* it.
**/
func (s *Session) spawnMark(taker *ecs.Entity, depth int) (*ecs.Entity, bool) {
	d := s.dungeon
	if d == nil {
		return nil, false
	}
	tc, _ := taker.GetComponent(ecs.ComponentTypeTransform)
	from := tc.(*components.TransformComponent)
	field := s.walkField(from.X, from.Y)

	walks := make([]int, len(d.layout.Rooms))
	var reached []int
	for room := range d.layout.Rooms {
		walks[room] = d.roomWalk(field, room)
		if walks[room] >= 0 {
			reached = append(reached, walks[room])
		}
	}
	median := medianOf(reached)
	var rooms []int
	for room, walk := range walks {
		if walk >= 0 && float64(walk) >= median && d.markRoomOpen(room) {
			rooms = append(rooms, room)
		}
	}
	shuffle(s.spawnRand, rooms)

	entities := s.EntityManager.GetAllEntities()
	area := s.summonArea(entities)
	for _, room := range rooms {
		x, y, ok := area.placeOnRegion(s.spawnRand, d, d.roomRegion(room), area.valid)
		if !ok {
			continue
		}
		look := MarkLooks[s.spawnRand.IntN(len(MarkLooks))]
		mark := CreateMonsterEntity(s.EntityManager, MonsterConfig{
			Archetype: components.MonsterArchetypeContractMark,
			Level:     demonLevel(s.floorPartyLevel(depth), depth),
			Boss:      true,
			Champion:  true,
			Name:      MarkNames[look],
			Look:      look,
			X:         x,
			Y:         y,
		})
		hc, _ := mark.GetComponent(ecs.ComponentTypeHealth)
		health := hc.(*components.HealthComponent)
		health.MaxHealth = markHealth(health.MaxHealth, s.delversInPlay())
		health.CurrentHealth = health.MaxHealth
		mark.AddComponent(&components.MarkComponent{})
		return mark, true
	}
	slog.Warn("Contract refused: no far room holds the mark", "sessionID", s.ID, "rooms", len(rooms))
	return nil, false
}

// markHealth is the mark's max health from a champion's: × (1 +
// MarkHealthPerExtraDelver × (living − 1)), living counted at least 1.
// FS-4EC7Z §E R18.
func markHealth(champion, living int) int {
	return int(math.Round(float64(champion) * (1 + MarkHealthPerExtraDelver*float64(max(living, 1)-1))))
}

// markRoomOpen is whether room may hold a mark: not the start, the stairs, a
// hidden or a respite room. FS-4EC7Z §E R17.
func (d *dungeonFloor) markRoomOpen(room int) bool {
	roles := d.layout.Roles
	return room != roles.Start && room != roles.Stairs && !d.isHidden(room) && !d.isRespite(room)
}

/**
* advanceContract runs the delve's contract a tick, after the combat and the
* elimination (FS-4EC7Z §E R18-R21): the mark's kill by a party member or an
* ally settles it; the mark gone with its floor (a climb), dead uncredited,
* or the taker out of play (dead, escaped, left behind or gone) loses it;
* else the mark's call, flight and heal, and every ContractHeadingInterval
* the taker's heading.
**/
func (s *Session) advanceContract(dt float64, kills []systems.KillRecord) {
	c, ok := s.contract()
	if !ok || c.State != components.ContractActive {
		return
	}
	if slices.ContainsFunc(kills, func(k systems.KillRecord) bool {
		return k.MonsterEntityID == c.Mark && k.KillerMemberID != uuid.Nil
	}) {
		s.settleContract(c)
		return
	}
	mark, here := s.EntityManager.GetEntity(c.Mark)
	taker, inPlay := s.buyerInPlay(c.Taker)
	if !here || !alive(mark) || !inPlay {
		c.State, c.Heading = components.ContractLost, ""
		slog.Info("Contract lost", "sessionID", s.ID, "taker", c.Taker, "markHere", here, "takerInPlay", inPlay)
		return
	}

	s.driveMark(mark)
	c.HeadingIn -= dt
	if c.HeadingIn <= headingEpsilon {
		s.refreshHeading(c, taker, mark)
	}
}

// headingEpsilon absorbs the float drift of summing tick lengths, so the
// heading refreshes on the tick its interval is used up.
const headingEpsilon = 1e-9

// settleContract settles c and gives its taker, if still in play, Contract
// Settled; it never stacks. FS-4EC7Z §E R19.
func (s *Session) settleContract(c *components.ContractComponent) {
	c.State, c.Heading = components.ContractSettled, ""
	if body, ok := s.buyerInPlay(c.Taker); ok {
		systems.SettleContract(body, ContractSettledDamageFactor)
	}
	slog.Info("Contract settled", "sessionID", s.ID, "taker", c.Taker)
}

// refreshHeading gives c the compass word for mark from taker, the next due
// ContractHeadingInterval from now. FS-4EC7Z §E R21.
func (s *Session) refreshHeading(c *components.ContractComponent, taker, mark *ecs.Entity) {
	from, _ := taker.GetComponent(ecs.ComponentTypeTransform)
	to, _ := mark.GetComponent(ecs.ComponentTypeTransform)
	a, b := from.(*components.TransformComponent), to.(*components.TransformComponent)
	c.Heading = compassWord(b.X-a.X, b.Y-a.Y)
	c.HeadingIn = ContractHeadingInterval
}

// compassWords are the eight headings, anticlockwise from east, north being
// the world's -y (the top of the map).
var compassWords = [8]string{"east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"}

// compassWord is the compass word nearest the direction (dx, dy); east for
// none.
func compassWord(dx, dy float64) string {
	sector := int(math.Round(math.Atan2(-dy, dx) / (math.Pi / 4)))
	return compassWords[(sector%8+8)%8]
}

/**
* driveMark runs the mark's thresholds a tick (FS-4EC7Z §E R18): once at
* MarkCallAt of its max health it calls its cutthroats, once at MarkFleeAt it
* flees; both crossed by one hit fire both, the call first. Arrived where it
* fled, it heals MarkFleeHeal of its max health, once, and makes the spot its
* home.
**/
func (s *Session) driveMark(mark *ecs.Entity) {
	mc, ok := mark.GetComponent(ecs.ComponentTypeMark)
	if !ok {
		return
	}
	m := mc.(*components.MarkComponent)
	ec, _ := mark.GetComponent(ecs.ComponentTypeEnemy)
	monster := ec.(*components.MonsterComponent)
	hc, _ := mark.GetComponent(ecs.ComponentTypeHealth)
	health := hc.(*components.HealthComponent)
	tc, _ := mark.GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)

	share := float64(health.CurrentHealth) / float64(max(health.MaxHealth, 1))
	if !m.Called && share <= MarkCallAt {
		m.Called = true
		s.callCutthroats(at)
	}
	if !m.Fled && share <= MarkFleeAt {
		m.Fled = true
		s.fleeMark(monster, at)
	}
	if monster.Flight.Arrived {
		monster.Flight = components.Flight{}
		m.Healed = true
		health.CurrentHealth = min(health.CurrentHealth+int(math.Round(float64(health.MaxHealth)*MarkFleeHeal)), health.MaxHealth)
		monster.HomeX, monster.HomeY = at.X, at.Y
		slog.Debug("Mark healed where it fled", "sessionID", s.ID, "health", health.CurrentHealth)
	}
}

// callCutthroats stands MarkCallCount `cutthroat` monsters beside the mark
// at at, at the floor's monster level in the Cutthroats' looks by turn, each
// hunting the delver in play nearest the mark at any distance. A mark with
// too little open ground beside it calls fewer, loudly. FS-4EC7Z §E R18.
func (s *Session) callCutthroats(at *components.TransformComponent) {
	d := s.dungeon
	if d == nil {
		return
	}
	area := s.summonArea(s.EntityManager.GetAllEntities())
	prey, hunted := nearestOf(s.huntedBodies(nil), point{at.X, at.Y})
	level := s.floorMonsterLevel()
	called := 0
	for i := range MarkCallCount {
		x, y, ok := s.besidePoint(d, &area, point{at.X, at.Y})
		if !ok {
			break
		}
		area.placed = append(area.placed, point{x, y})
		monster := CreateMonsterEntity(s.EntityManager, MonsterConfig{
			Archetype: components.MonsterArchetypeCutthroat,
			Level:     level,
			Look:      CutthroatLooks[i%len(CutthroatLooks)],
			X:         x,
			Y:         y,
		})
		if hunted {
			mc, _ := monster.GetComponent(ecs.ComponentTypeEnemy)
			// taken up at any distance, past the leash, as a wave's prey is
			mc.(*components.MonsterComponent).LastAttacker = prey
		}
		called++
	}
	if called < MarkCallCount {
		slog.Warn("Mark called fewer cutthroats: too little open ground beside it", "sessionID", s.ID, "called", called)
	}
}

// fleeMark sends the mark at at to the room farthest by walk from the
// delver in play nearest it, to the cell of that room the walk reaches
// nearest its centre. With no delver in play, or no room reached, it stays.
// FS-4EC7Z §E R18.
func (s *Session) fleeMark(monster *components.MonsterComponent, at *components.TransformComponent) {
	d := s.dungeon
	if d == nil {
		return
	}
	delvers := inPlayPositions(delversOf(s.EntityManager.GetAllEntities()))
	nearest, best := point{}, math.Inf(1)
	for _, p := range delvers {
		if dist := math.Hypot(p.x-at.X, p.y-at.Y); dist < best {
			nearest, best = p, dist
		}
	}
	if math.IsInf(best, 1) {
		return
	}
	field := s.walkField(nearest.x, nearest.y)
	farthest, walk := -1, -1
	for room := range d.layout.Rooms {
		if w := d.roomWalk(field, room); w > walk {
			farthest, walk = room, w
		}
	}
	if farthest < 0 {
		return
	}
	to := d.reachedNearCentre(field, farthest)
	systems.Flee(monster, to.x, to.y, MarkFleeMaxSeconds)
	slog.Debug("Mark flees", "sessionID", s.ID, "room", farthest, "walk", walk)
}

// walkField is the floor's walk in cells from (x, y) over its grid as it
// stands now, a shut barrier blocking it; nil on a floor without a grid or
// from off it.
func (s *Session) walkField(x, y float64) []int {
	if s.navGrid == nil {
		return nil
	}
	from, ok := s.navGrid.Cell(x, y)
	if !ok {
		return nil
	}
	return s.navGrid.WalkDistances(from)
}

// roomWalk is room's walk in field: the least over its cells, -1 when the
// walk reaches none of them.
func (d *dungeonFloor) roomWalk(field []int, room int) int {
	walk := -1
	d.eachRoomCell(room, func(c int) {
		if c < len(field) && field[c] >= 0 && (walk < 0 || field[c] < walk) {
			walk = field[c]
		}
	})
	return walk
}

// reachedNearCentre is the centre of room's cell nearest the room's centre
// among those the walk in field reaches; the room's centre when it reaches
// none.
func (d *dungeonFloor) reachedNearCentre(field []int, room int) point {
	centre, cell := d.roomCentre(room), d.layout.CellSize
	best, at := math.Inf(1), centre
	d.eachRoomCell(room, func(c int) {
		if c >= len(field) || field[c] < 0 {
			return
		}
		p := point{(float64(c%d.layout.Cols) + 0.5) * cell, (float64(c/d.layout.Cols) + 0.5) * cell}
		if dist := math.Hypot(p.x-centre.x, p.y-centre.y); dist < best {
			best, at = dist, p
		}
	})
	return at
}

// eachRoomCell calls f with every cell index of room's rect.
func (d *dungeonFloor) eachRoomCell(room int, f func(c int)) {
	r := d.layout.Rooms[room].Rect
	for y := r.Y; y < r.Y+r.H; y++ {
		for x := r.X; x < r.X+r.W; x++ {
			f(y*d.layout.Cols + x)
		}
	}
}
