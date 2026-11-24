package game

import (
	"log/slog"
	"math/rand/v2"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
)

/**
* Traps (FS-5FZ4J §D R23-R31). A dungeon floor lays its traps last of its
* ground, after the tome and altars and before the party and the monsters
* (§H R45): floor entities, undetected until a delver comes within 2 cells or
* one fires, and gone with the floor. The TrapSystem says what fired at whom;
* the floor applies it here: a hit through the combat's one damage path, an
* ambush, or a poisoning.
*
* Hidden rooms hold no trap: they are concealed until their door opens, and a
* trap in one would be laid where nothing else of the floor may stand.
**/

// trapFactors is each hitting kind's factor on the floor's trap hit
// (FS-5FZ4J §D R26).
var trapFactors = map[components.TrapKind]float64{
	components.TrapSpikePlate: TrapFactorSpikePlate,
	components.TrapDartWall:   TrapFactorDartWall,
	components.TrapFireJet:    TrapFactorFireJet,
}

// trapCount is how many traps the floor at depth holds: 3 on floor 1, 8 from
// floor 10 (FS-5FZ4J §D R23).
func trapCount(depth int) int {
	return min(TrapCountBase+depth/TrapCountEvery, TrapCountMax)
}

// springTraps runs the floor's traps for the tick, after the walk, and applies
// what fired: a spike plate's, dart wall's or fire jet's hit, queued for this
// tick's combat; a tripwire's ambush, woken on the delver who tripped it; a gas
// vent's poison on each delver in its cloud (FS-5FZ4J §D R25-R29).
func (s *Session) springTraps(dt float64, entities []*ecs.Entity) {
	traps := systems.TrapSystem{
		CellSize:    s.dungeonCellSize(),
		RearmAfter:  TrapRearmAfter,
		CloudRadius: GasVentRadius,
		PuffEvery:   GasVentPuffEvery,
	}
	for _, spring := range traps.Update(dt, entities) {
		switch spring.Kind {
		case components.TrapTripwire:
			s.wakePieceAmbush(spring.Trap, spring.Body)
		case components.TrapGasVent:
			systems.Poison(spring.Body, PoisonDuration)
		default:
			s.hitByTrap(spring.Trap.ID, spring.Body, trapFactors[spring.Kind])
		}
	}
}

/**
* layTraps lays the floor at depth's traps (FS-5FZ4J §D R23-R24), each of a
* kind drawn uniformly, on cells of trapGround at least TrapSpacingCells apart:
* first at least half of them off the walk from the start to the stairs room's
* gate, then the rest anywhere on that ground. A floor short of ground lays
* fewer, loudly.
*
* The draws come from a source seeded by the floor's layout seed and depth, not
* the session's spawn source: a seeded run still lays the same traps every
* time, and every draw after them, the party's and the monsters', is where it
* was before floors had traps.
**/
func (s *Session) layTraps(depth int, d *dungeonFloor) {
	want := trapCount(depth)
	rng := rand.New(rand.NewPCG(d.layout.Seed, uint64(depth)))
	off, on := s.trapGround(d)
	shuffle(rng, off)
	shuffle(rng, on)

	var cells []components.Cell
	take := func(from []components.Cell, upTo int) {
		for _, c := range from {
			if len(cells) >= upTo {
				return
			}
			if trapSpaced(c, cells) {
				cells = append(cells, c)
			}
		}
	}
	take(off, (want+1)/2)
	rest := append(append([]components.Cell(nil), off...), on...)
	shuffle(rng, rest)
	take(rest, want)

	if len(cells) < want {
		slog.Warn("Floor short of trap ground", "sessionID", s.ID, "floor", depth, "want", want, "laid", len(cells))
	}
	for _, c := range cells {
		at := d.cellCentre(c)
		kind := components.TrapKinds[rng.IntN(len(components.TrapKinds))]
		CreateTrapEntity(s.EntityManager, TrapConfig{Kind: kind, Cell: c, X: at.x, Y: at.y})
	}
}

// trapSpaced is whether c stands at least TrapSpacingCells from every one of
// cells.
func trapSpaced(c components.Cell, cells []components.Cell) bool {
	for _, o := range cells {
		if cellsApart(c, o) < TrapSpacingCells {
			return false
		}
	}
	return true
}

// cellsApart is how many cells apart a and b stand on the grid: the larger of
// their columns' and rows' differences. On whole cells it is under n exactly
// when their centres are under n cells apart.
func cellsApart(a, b components.Cell) int {
	return max(a.X-b.X, b.X-a.X, a.Y-b.Y, b.Y-a.Y)
}

/**
* trapGround is every cell a trap may lie on, split by whether its room or
* corridor segment is off the walk from the start to the stairs room's gate
* (FS-5FZ4J §D R23): walkable; not in the start room nor within
* TrapStartClearCells of it, which holds every start spot of the party; not a
* doorway; not a barrier's cell, the gate's or a secret door's; not in a hidden
* room; not a seal piece's cell, a stone block's included; and clear of
* everything the build has held so far, fixtures, containers, the tome and
* altars and the whole Weighted Plates room among them.
**/
func (s *Session) trapGround(d *dungeonFloor) (off, on []components.Cell) {
	cols, rows := d.layout.Cols, d.layout.Rows
	barred := map[components.Cell]bool{}
	hold := func(r levelgen.CellRect) {
		for _, c := range cellsOf(r) {
			barred[c] = true
		}
	}
	hold(d.layout.Stairs.Barrier)
	hiddenRegion := map[int]bool{}
	for _, h := range d.layout.Hidden {
		hold(h.Barrier)
		hiddenRegion[d.roomRegion(h.Room)] = true
	}
	for _, e := range s.EntityManager.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok {
			barred[pc.(*components.SealPieceComponent).Cell] = true
		}
	}

	start := d.layout.Rooms[d.layout.Roles.Start].Rect
	path := d.gateWalkRegions()
	size := d.layout.CellSize
	for y := range rows {
		for x := range cols {
			c, i := components.Cell{X: x, Y: y}, y*cols+x
			region := d.region[i]
			switch {
			case region == 0, d.doorway[i], barred[c], hiddenRegion[region]:
				continue
			case x >= start.X-TrapStartClearCells && x < start.X+start.W+TrapStartClearCells &&
				y >= start.Y-TrapStartClearCells && y < start.Y+start.H+TrapStartClearCells:
				continue
			case !s.isFree(PlaceArea{X: float64(x) * size, Y: float64(y) * size, W: size, H: size}):
				continue
			}
			if path[region] {
				on = append(on, c)
			} else {
				off = append(off, c)
			}
		}
	}
	return off, on
}

// cellsOf is r's cells, row by row.
func cellsOf(r levelgen.CellRect) []components.Cell {
	cells := make([]components.Cell, 0, max(r.W*r.H, 0))
	for y := r.Y; y < r.Y+r.H; y++ {
		for x := r.X; x < r.X+r.W; x++ {
			cells = append(cells, components.Cell{X: x, Y: y})
		}
	}
	return cells
}

/**
* gateWalkRegions is the regions, rooms and corridor segments, one shortest
* walk from the start room's centre to the nearest of the stairs room's gate
* cells crosses (FS-5FZ4J §D R23). A floor with no gate, the top floor, has no
* such walk: none.
**/
func (d *dungeonFloor) gateWalkRegions() map[int]bool {
	gate := cellsOf(d.layout.Stairs.Barrier)
	regions := map[int]bool{}
	if len(gate) == 0 {
		return regions
	}
	cols := d.layout.Cols
	dist := d.walkFrom(d.cellOf(d.roomCentre(d.layout.Roles.Start)))
	end := -1
	for _, c := range gate {
		if i := c.Y*cols + c.X; dist[i] >= 0 && (end < 0 || dist[i] < dist[end]) {
			end = i
		}
	}
	// back from the gate, a step nearer the start each time
	for i := end; i >= 0; {
		regions[d.region[i]] = true
		if dist[i] == 0 {
			break
		}
		x, y, next := i%cols, i/cols, -1
		for _, n := range [4][2]int{{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}} {
			if n[0] < 0 || n[1] < 0 || n[0] >= cols || n[1] >= d.layout.Rows {
				continue
			}
			if j := n[1]*cols + n[0]; dist[j] == dist[i]-1 {
				next = j
				break
			}
		}
		i = next
	}
	return regions
}
