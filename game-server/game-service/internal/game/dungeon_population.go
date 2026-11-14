package game

import (
	"log/slog"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/google/uuid"
)

/**
* A dungeon floor's monsters are distributed by room and role (FS-KE075 §C
* R18–20, ADR-0061 Decision 7): none in the start room, a pack in each hall,
* elite guards in each treasure room, a few rolled monsters in every other
* room and along the corridors, the floor's total held to
* [DungeonMonstersMin, DungeonMonstersMax]. Every monster is a variant of the
* floor's pool (FS-C8VM7 §C); levels and elite chance are the floor's own
* (rollMonster); only the treasure guards are always elite. On every dungeon
* floor, the pool's ranged members take some fodder's places in the ordinary
* rooms and one in each hall pack (FS-B4SG9 §B, FS-C8VM7 §C R22).
*
* Every monster stands on walkable cells of its region, off doorways, by the
* same spacing and delver exclusion as on any floor (spawnArea.valid).
**/

// spawnRole is what a dungeon monster was placed as. It decides which ones the
// floor total may trim: never a hall pack or a treasure guard.
type spawnRole int

const (
	spawnHallPack spawnRole = iota
	spawnTreasureGuard
	spawnRoom
	spawnCorridor
)

// dungeonSpawn is one monster placed on a dungeon floor, not created yet.
type dungeonSpawn struct {
	monster MonsterConfig
	role    spawnRole
	// room is the room index it stands in; -1 in a corridor
	room int
}

// dungeonPopulation is one dungeon floor's population while it is being
// placed: the floor, the spawn area every placement checks, the rolls'
// inputs and what is placed so far.
type dungeonPopulation struct {
	// session is the run's id, for the logs
	session uuid.UUID
	floor   *dungeonFloor
	area    *spawnArea
	rng     populationRand
	// pool is the floor's variants, every monster's (FS-C8VM7 §C R19)
	pool   floorPool
	level  int
	depth  int
	spawns []dungeonSpawn
}

/**
* populateDungeon places a dungeon floor's monsters, by room and role, then
* creates them. Halls and treasure rooms come first, so their packs find room
* before the rolled monsters crowd the floor; the total is then held to its
* bounds, and only then is anything created. area.placed ends holding exactly
* the monsters created, so the demon after keeps clear of them. A chest in a
* room of guards then waits on them (FS-KE075 §J). Dark Warriors past the
* floor's cap are recast once the total is held (FS-C8VM7 §C R24).
**/
func (s *Session) populateDungeon(d *dungeonFloor, area *spawnArea, pool floorPool, level, depth int) {
	p := &dungeonPopulation{session: s.ID, floor: d, area: area, rng: s.spawnRand, pool: pool, level: level, depth: depth}
	roles := d.layout.Roles

	var ordinary []int
	for room := range d.layout.Rooms {
		switch {
		case room == roles.Start:
		case slices.Contains(roles.Treasure, room):
			p.treasureGuards(room)
		case d.isHall(room):
			p.hallPack(room)
		default:
			ordinary = append(ordinary, room)
		}
	}
	for _, room := range ordinary {
		n := RoomMonstersMin + p.rng.IntN(RoomMonstersMax-RoomMonstersMin+1)
		for range n {
			p.single(room)
		}
	}
	p.corridors()
	p.holdTotal(ordinary)
	p.capDarkWarriors()
	s.endgame.settle(p.rng, pool, depth, p.monsters())

	area.placed = area.placed[:0]
	// each room's guards, by entity id, for the chests that wait on them (§J)
	guards := map[int][]uuid.UUID{}
	for _, spawn := range p.spawns {
		monster := CreateMonsterEntity(s.EntityManager, spawn.monster)
		area.placed = append(area.placed, point{spawn.monster.X, spawn.monster.Y})
		if spawn.role.guardsRoom() {
			guards[spawn.room] = append(guards[spawn.room], monster.ID)
		}
	}
	s.guardChests(d, guards)
	slog.Debug("Dungeon floor populated", "sessionID", s.ID, "floor", depth, "monsters", len(p.spawns))
}

// isHall is whether room is big enough to hold a pack: at least
// HallMinWidth × HallMinHeight cells.
func (d *dungeonFloor) isHall(room int) bool {
	r := d.layout.Rooms[room].Rect
	return r.W >= HallMinWidth && r.H >= HallMinHeight
}

/**
* hallPack places a hall's pack: a brute of the pool leading members drawn from
* its fodder, each within HallPackRadius of the leader (FS-C8VM7 §C R23). It
* tries a few leader spots and keeps the first that fits the whole pack, else
* the one that fitted the most; a member that fits nowhere is skipped and the
* floor total tops up (FS-KE075 §Edge States "A pack does not fit in its
* hall"). Members are placed in order, so the first, the archer slots a ranged
* member of the pool fills, are the last a short pack loses (FS-B4SG9 §B R16,
* FS-C8VM7 §C R22).
**/
func (p *dungeonPopulation) hallPack(room int) {
	region := p.floor.roomRegion(room)
	leader, ok := p.pool.brute(p.rng)
	if !ok {
		leader, _ = p.pool.fodder(p.rng)
	}
	head := p.rollAs(leader.rollLook(p.rng), eliteChance(p.depth))
	followers := make([]MonsterConfig, HallPackFodderMin+p.rng.IntN(HallPackFodderMax-HallPackFodderMin+1))
	for i := range followers {
		member, _ := p.pool.fodder(p.rng)
		if i < HallPackBoneArchers {
			if archer, ok := p.pool.ranged(p.rng); ok {
				member = archer
			}
		}
		followers[i] = p.rollAs(member.rollLook(p.rng), eliteChance(p.depth))
	}

	var best []point
	for range HallPackBruteTries {
		at := p.packAround(region, len(followers))
		if len(at) > len(best) {
			best = at
		}
		if len(best) == 1+len(followers) {
			break
		}
	}
	if len(best) == 0 {
		slog.Warn("Hall pack skipped: no spot for its leader", "sessionID", p.session, "room", room)
		return
	}
	if len(best) < 1+len(followers) {
		slog.Warn("Hall pack short: not every follower fitted",
			"sessionID", p.session, "room", room, "followers", len(best)-1, "rolled", len(followers))
	}

	members := append([]MonsterConfig{head}, followers...)
	for i, at := range best {
		p.add(members[i], at, spawnHallPack, room)
	}
}

// packAround draws one leader spot in region and as many of n followers
// around it as fit, returning their points, the leader's first; none when the
// leader finds no spot. It places nothing: the area is left as it was found.
func (p *dungeonPopulation) packAround(region, n int) []point {
	mark := len(p.area.placed)
	defer func() { p.area.placed = p.area.placed[:mark] }()

	tx, ty, ok := p.area.placeOnRegion(p.rng, p.floor, region, p.area.valid)
	if !ok {
		return nil
	}
	at := []point{{tx, ty}}
	p.area.placed = append(p.area.placed, at[0])

	nearTroll := func(x, y float64) bool {
		return math.Hypot(x-tx, y-ty) <= HallPackRadius && p.area.valid(x, y)
	}
	for range n {
		x, y, ok := p.area.placeOnRegion(p.rng, p.floor, region, nearTroll)
		if !ok {
			continue
		}
		at = append(at, point{x, y})
		p.area.placed = append(p.area.placed, point{x, y})
	}
	return at
}

// treasureGuards places a treasure room's guard: one elite, or at
// TreasureGuardPackShare a pack of elites, each a rolled monster of the pool
// (FS-C8VM7 §C R23).
func (p *dungeonPopulation) treasureGuards(room int) {
	n := 1
	if p.rng.Float64() < TreasureGuardPackShare {
		n = TreasureGuardPackMin + p.rng.IntN(TreasureGuardPackMax-TreasureGuardPackMin+1)
	}
	for range n {
		// Float64 is below 1, so every guard is promoted
		guard := p.rollAs(rollArchetype(p.rng, p.pool, p.depth), 1)
		if !p.placeIn(p.floor.roomRegion(room), guard, spawnTreasureGuard, room) {
			slog.Warn("Treasure guard skipped: no valid spawn point", "sessionID", p.session, "room", room)
		}
	}
}

/**
* single places one rolled monster in room; false when it found no spot. A
* roll that comes up fodder is a ranged member of the pool instead at
* BoneArcherRoomShare, on a draw of its own, on every dungeon floor; with no
* ranged member in the pool no draw is made (FS-B4SG9 §B R14–R15,
* FS-C8VM7 §C R22).
**/
func (p *dungeonPopulation) single(room int) bool {
	variant := p.pool.rolled(p.rng, p.depth)
	if p.pool.isFodder(variant) && len(p.pool.of(roleRanged)) > 0 && p.rng.Float64() < BoneArcherRoomShare {
		variant, _ = p.pool.ranged(p.rng)
	}
	monster := p.rollAs(variant.rollLook(p.rng), eliteChance(p.depth))
	return p.placeIn(p.floor.roomRegion(room), monster, spawnRoom, room)
}

// corridors places the corridors' rolled monsters, one per segment at most,
// in segments drawn at random until the count is placed or none are left.
func (p *dungeonPopulation) corridors() {
	var segments []int
	for _, region := range p.floor.layout.Regions {
		if region.Kind == levelgen.RegionCorridor {
			segments = append(segments, region.ID)
		}
	}
	shuffle(p.rng, segments)

	want := CorridorMonstersMin + p.rng.IntN(CorridorMonstersMax-CorridorMonstersMin+1)
	placed := 0
	for _, segment := range segments {
		if placed == want {
			break
		}
		if p.placeIn(segment, rollMonster(p.rng, p.pool, p.level, p.depth), spawnCorridor, -1) {
			placed++
		}
	}
	if placed < want {
		slog.Warn("Corridors hold fewer monsters than rolled", "sessionID", p.session, "placed", placed, "rolled", want)
	}
}

/**
* holdTotal holds the floor's monsters to [DungeonMonstersMin,
* DungeonMonstersMax] (FS-KE075 §C R18): below, single rolled monsters go to
* random ordinary rooms, none past RoomMonstersTopUpMax; above, monsters are
* removed from ordinary rooms, then corridors. Hall packs and treasure guards
* are never trimmed.
**/
func (p *dungeonPopulation) holdTotal(ordinary []int) {
	// the ordinary rooms a top-up may still go to
	room := slices.Clone(ordinary)
	for len(p.spawns) < DungeonMonstersMin && len(room) > 0 {
		i := p.rng.IntN(len(room))
		if p.inRoom(room[i]) >= RoomMonstersTopUpMax || !p.single(room[i]) {
			room = slices.Delete(room, i, i+1)
		}
	}
	if len(p.spawns) < DungeonMonstersMin {
		slog.Warn("Dungeon floor holds fewer monsters than its minimum",
			"sessionID", p.session, "monsters", len(p.spawns), "min", DungeonMonstersMin)
	}

	for _, role := range []spawnRole{spawnRoom, spawnCorridor} {
		for len(p.spawns) > DungeonMonstersMax {
			if !p.trimOne(role) {
				break
			}
		}
	}
	if len(p.spawns) > DungeonMonstersMax {
		slog.Warn("Dungeon floor holds more monsters than its maximum",
			"sessionID", p.session, "monsters", len(p.spawns), "max", DungeonMonstersMax)
	}
}

// capDarkWarriors holds the floor's Dark Warriors to its cap once its total
// stands, recasting the excess in place (FS-C8VM7 §C R24).
func (p *dungeonPopulation) capDarkWarriors() {
	p.pool.capDarkWarriors(p.rng, p.monsters())
}

// monsters points at every monster placed so far, for a pass that changes
// them in place.
func (p *dungeonPopulation) monsters() []*MonsterConfig {
	monsters := make([]*MonsterConfig, len(p.spawns))
	for i := range p.spawns {
		monsters[i] = &p.spawns[i].monster
	}
	return monsters
}

// trimOne removes one random monster placed as role; false when there is none.
func (p *dungeonPopulation) trimOne(role spawnRole) bool {
	var of []int
	for i, spawn := range p.spawns {
		if spawn.role == role {
			of = append(of, i)
		}
	}
	if len(of) == 0 {
		return false
	}
	i := of[p.rng.IntN(len(of))]
	p.spawns = slices.Delete(p.spawns, i, i+1)
	return true
}

// inRoom is how many monsters are placed in room.
func (p *dungeonPopulation) inRoom(room int) int {
	n := 0
	for _, spawn := range p.spawns {
		if spawn.room == room {
			n++
		}
	}
	return n
}

// placeIn places monster on region at a valid spot; false when it found none.
func (p *dungeonPopulation) placeIn(region int, monster MonsterConfig, role spawnRole, room int) bool {
	x, y, ok := p.area.placeOnRegion(p.rng, p.floor, region, p.area.valid)
	if !ok {
		return false
	}
	p.add(monster, point{x, y}, role, room)
	return true
}

// add records monster at at, holding its spot for every placement after.
func (p *dungeonPopulation) add(monster MonsterConfig, at point, role spawnRole, room int) {
	monster.X, monster.Y = at.x, at.y
	p.spawns = append(p.spawns, dungeonSpawn{monster: monster, role: role, room: room})
	p.area.placed = append(p.area.placed, at)
}

// rollAs is a monster of archetype rolled as on any floor: its level, and at
// elite chance its promotion.
func (p *dungeonPopulation) rollAs(archetype components.MonsterArchetype, elite float64) MonsterConfig {
	return rollAs(p.rng, archetype, p.level, p.depth, elite)
}

// demonOdds is how a floor came by its demon: on its rare roll, or guaranteed
// on the top floor.
type demonOdds int

const (
	demonRolled demonOdds = iota
	demonGuaranteed
)

// demonOddsOf is the top floor's guaranteed demon, any other floor's rolled one.
func demonOddsOf(topFloor bool) demonOdds {
	if topFloor {
		return demonGuaranteed
	}
	return demonRolled
}

/**
* placeDungeonDemon stands a dungeon floor's demon in the room farthest from
* the start, by walking distance, that has a valid spot, never the start room
* (FS-KE075 §C R19). A guaranteed demon finding none tries again with the
* delver exclusion relaxed, as placeDemon does. It reports the room it used,
* -1 and false when skipped, so the blood demon can keep out of it
* (FS-VHGE7 §A R10).
**/
func (s *Session) placeDungeonDemon(d *dungeonFloor, area *spawnArea, demon MonsterConfig, floor int, odds demonOdds) (int, bool) {
	rooms := slices.DeleteFunc(d.roomsFarthestFirst(), func(room int) bool { return room == d.layout.Roles.Start })

	fits := []func(x, y float64) bool{area.valid}
	if odds == demonGuaranteed {
		fits = append(fits, area.open)
	}
	for _, fit := range fits {
		if room, ok := s.placeInRooms(d, area, demon, rooms, fit); ok {
			return room, true
		}
	}
	if odds == demonGuaranteed {
		slog.Error("Guaranteed boss skipped: no valid spawn point on the dungeon floor even relaxed",
			"sessionID", s.ID, "floor", floor, "archetype", demon.Archetype)
		return -1, false
	}
	slog.Warn("Demon skipped: no valid spawn point on the dungeon floor", "sessionID", s.ID, "floor", floor)
	return -1, false
}

/**
* placeDungeonBloodDemon stands a dungeon floor's blood demon in the first room
* of its search (bloodDemonRooms) with a valid spot. It is never guaranteed, so
* there is no relaxed pass: with no room it is skipped with a warning.
* demonRoom is the room the demon stands in, -1 with none. FS-VHGE7 §A R10.
**/
func (s *Session) placeDungeonBloodDemon(d *dungeonFloor, area *spawnArea, blood MonsterConfig, floor, demonRoom int) {
	if _, ok := s.placeInRooms(d, area, blood, d.bloodDemonRooms(demonRoom), area.valid); !ok {
		slog.Warn("Blood demon skipped: no valid spawn point on the dungeon floor",
			"sessionID", s.ID, "floor", floor, "archetype", blood.Archetype)
	}
}

// placeInRooms creates monster in the first of rooms with a spot fit accepts,
// and reports which room that was.
func (s *Session) placeInRooms(d *dungeonFloor, area *spawnArea, monster MonsterConfig, rooms []int, fit func(x, y float64) bool) (int, bool) {
	for _, room := range rooms {
		if x, y, ok := area.placeOnRegion(s.spawnRand, d, d.roomRegion(room), fit); ok {
			monster.X, monster.Y = x, y
			CreateMonsterEntity(s.EntityManager, monster)
			area.placed = append(area.placed, point{x, y})
			return room, true
		}
	}
	return -1, false
}

// roomsFarthestFirst is every room of the floor, the start included, farthest
// from the start first by walking distance; ties keep their room order.
func (d *dungeonFloor) roomsFarthestFirst() []int {
	rooms := make([]int, len(d.layout.Rooms))
	for room := range rooms {
		rooms[room] = room
	}
	slices.SortStableFunc(rooms, func(a, b int) int { return d.layout.Rooms[b].Distance - d.layout.Rooms[a].Distance })
	return rooms
}

/**
* bloodDemonRooms is where a blood demon searches, in order: from the
* second-farthest room on down, never the start room or demonRoom (-1 for no
* demon). It starts at the second-farthest whether or not the demon took the
* farthest, so a floor of two rooms has nowhere for it. FS-VHGE7 §A R10.
**/
func (d *dungeonFloor) bloodDemonRooms(demonRoom int) []int {
	ordered := d.roomsFarthestFirst()
	if len(ordered) < 2 {
		return nil
	}
	var rooms []int
	for _, room := range ordered[1:] {
		if room != d.layout.Roles.Start && room != demonRoom {
			rooms = append(rooms, room)
		}
	}
	return rooms
}

// placeOnRegion draws points from region's cells until one holds a body wholly
// on the region, off its doorways, and fits accepts it, a bounded number of
// times: positive sampling (FS-KE075 §B R16, §C R20).
func (a *spawnArea) placeOnRegion(rng populationRand, d *dungeonFloor, region int, fits func(x, y float64) bool) (x, y float64, ok bool) {
	r := constants.PlayerRadius
	for range MonsterPlacementAttempts {
		x, y = d.draw(rng, region)
		if d.stands(centredArea(x, y, r, r), region, offDoorways) && fits(x, y) {
			return x, y, true
		}
	}
	return 0, 0, false
}
