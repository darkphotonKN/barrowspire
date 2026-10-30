package game

import (
	"math"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// hubResidentMargin is the room kept between a resident's quarter and a function
// NPC's talk range, so nobody wanders onto the person a delver came to see.
// FS-MRZH7 §Requirements 9.
const hubResidentMargin = 40

// distanceToRegion is how far a point lies from the nearest edge of a quarter;
// zero when it stands inside.
func distanceToRegion(x, y, rx, ry, rw, rh float64) float64 {
	dx := math.Max(math.Max(rx-x, 0), x-(rx+rw))
	dy := math.Max(math.Max(ry-y, 0), y-(ry+rh))
	return math.Hypot(dx, dy)
}

func TestHubResidents_QuartersClearOfFunctionNPCs_KeepTalkRangePlusMargin(t *testing.T) {
	clearance := constants.NPCInteractRange + hubResidentMargin

	for _, npc := range hubNPCs {
		for _, resident := range hubResidents {
			r := resident.Region
			got := distanceToRegion(npc.X, npc.Y, r.X, r.Y, r.W, r.H)
			if got < clearance {
				t.Errorf("%s's quarter comes within %.0f of the %s, want at least %.0f",
					resident.Name, got, npc.Name, clearance)
			}
		}
	}
}

// ----- The town's layout (FS-B0H2D §A) -----

// box is a rectangle in world space: a wall, a building's footprint, a strip of
// ground.
type box struct{ X, Y, W, H float64 }

func (b box) contains(x, y float64) bool {
	return x >= b.X && x <= b.X+b.W && y >= b.Y && y <= b.Y+b.H
}

// overlaps is true when the two share ground; boxes that only meet along an
// edge do not.
func (b box) overlaps(o box) bool {
	return b.X < o.X+o.W && o.X < b.X+b.W && b.Y < o.Y+o.H && o.Y < b.Y+b.H
}

func (b box) distanceTo(x, y float64) float64 {
	return distanceToRegion(x, y, b.X, b.Y, b.W, b.H)
}

// distanceToSegment is how close the box comes to the segment from a to b;
// zero when the segment crosses it.
func (b box) distanceToSegment(ax, ay, bx, by float64) float64 {
	if b.contains(ax, ay) || b.contains(bx, by) {
		return 0
	}

	corners := [4][2]float64{{b.X, b.Y}, {b.X + b.W, b.Y}, {b.X + b.W, b.Y + b.H}, {b.X, b.Y + b.H}}
	for i, c := range corners {
		d := corners[(i+1)%4]
		if segmentsCross(ax, ay, bx, by, c[0], c[1], d[0], d[1]) {
			return 0
		}
	}

	nearest := math.Min(b.distanceTo(ax, ay), b.distanceTo(bx, by))
	for _, c := range corners {
		nearest = math.Min(nearest, pointToSegment(c[0], c[1], ax, ay, bx, by))
	}
	return nearest
}

func pointToSegment(px, py, ax, ay, bx, by float64) float64 {
	dx, dy := bx-ax, by-ay
	t := ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)
	t = math.Max(0, math.Min(1, t))
	return math.Hypot(px-(ax+t*dx), py-(ay+t*dy))
}

func segmentsCross(ax, ay, bx, by, cx, cy, dx, dy float64) bool {
	side := func(px, py, qx, qy, rx, ry float64) float64 {
		return (qx-px)*(ry-py) - (qy-py)*(rx-px)
	}
	d1 := side(cx, cy, dx, dy, ax, ay)
	d2 := side(cx, cy, dx, dy, bx, by)
	d3 := side(ax, ay, bx, by, cx, cy)
	d4 := side(ax, ay, bx, by, dx, dy)
	return d1*d2 <= 0 && d3*d4 <= 0
}

// hubWalls is every wall the built hub holds, grouped by the building it
// belongs to.
func hubWalls(t *testing.T) map[uuid.UUID][]box {
	t.Helper()

	houses := map[uuid.UUID][]box{}
	for _, entity := range builtHub().EntityManager.GetAllEntities() {
		wallComp, isWall := entity.GetComponent(ecs.ComponentTypeWall)
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		if !isWall || !hasTransform {
			continue
		}

		wall := wallComp.(*components.WallComponent)
		at := transformComp.(*components.TransformComponent)
		houses[wall.HouseID] = append(houses[wall.HouseID], box{X: at.X, Y: at.Y, W: wall.Width, H: wall.Height})
	}
	require.NotEmpty(t, houses, "the hub has no buildings")
	return houses
}

func allWalls(houses map[uuid.UUID][]box) []box {
	walls := []box{}
	for _, house := range houses {
		walls = append(walls, house...)
	}
	return walls
}

// footprintOf is the ground a building's walls enclose: their bounding box, as
// the client rebuilds it (housesFrom).
func footprintOf(walls []box) box {
	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for _, w := range walls {
		minX, minY = math.Min(minX, w.X), math.Min(minY, w.Y)
		maxX, maxY = math.Max(maxX, w.X+w.W), math.Max(maxY, w.Y+w.H)
	}
	return box{X: minX, Y: minY, W: maxX - minX, H: maxY - minY}
}

func footprints(houses map[uuid.UUID][]box) []box {
	found := []box{}
	for _, house := range houses {
		found = append(found, footprintOf(house))
	}
	return found
}

// laneHalfWidth is half a lane: the corridor from the spawn to a gate is 240 px
// wide. FS-B0H2D §Requirements 4.
const laneHalfWidth = 120

// Nothing walls off the way out of town: the straight corridor from the spawn
// to each gate is crossed by no wall. FS-B0H2D §Requirements 4.
func TestHubLayout_LanesToEveryGate_CrossedByNoWall(t *testing.T) {
	walls := allWalls(hubWalls(t))

	for _, gate := range hubGates {
		t.Run(string(gate.Destination), func(t *testing.T) {
			for _, wall := range walls {
				got := wall.distanceToSegment(constants.HubSpawnX, constants.HubSpawnY, gate.X, gate.Y)
				assert.Greater(t, got, float64(laneHalfWidth),
					"a wall at %+v stands in the lane to the %s gate", wall, gate.Destination)
			}
		})
	}
}

// runDoorWidth is the door a run house has, and the gap every town building
// keeps. FS-B0H2D §Requirements 9.
const runDoorWidth = 50

// doorGapOf is the opening in a building's south wall: the stretch of its
// bottom edge no south-wall segment covers. ok is false unless the south wall is
// exactly two segments with one gap between them.
func doorGapOf(walls []box) (gap box, ok bool) {
	foot := footprintOf(walls)
	bottom := foot.Y + foot.H

	south := []box{}
	for _, w := range walls {
		if w.Y+w.H == bottom && w.H == hubWallThickness {
			south = append(south, w)
		}
	}
	if len(south) != 2 {
		return box{}, false
	}
	if south[0].X > south[1].X {
		south[0], south[1] = south[1], south[0]
	}
	left, right := south[0], south[1]
	if left.X != foot.X || right.X+right.W != foot.X+foot.W {
		return box{}, false
	}

	return box{X: left.X + left.W, Y: bottom - hubWallThickness, W: right.X - (left.X + left.W), H: hubWallThickness}, true
}

// A town building is walked into through a gap in its south wall, the run
// house's cut, centred and a run door wide. FS-B0H2D §Requirements 9.
func TestHubLayout_EveryBuilding_HasACentredDoorGapInItsSouthWall(t *testing.T) {
	for _, walls := range hubWalls(t) {
		foot := footprintOf(walls)

		gap, ok := doorGapOf(walls)
		require.True(t, ok, "the building at %+v has no single gap in its south wall", foot)
		assert.Equal(t, float64(runDoorWidth), gap.W, "the building at %+v", foot)
		assert.InDelta(t, foot.X+foot.W/2, gap.X+gap.W/2, 0.001, "the gap of the building at %+v is off centre", foot)
	}
}

// The town keeps three buildings, every one enterable: the Inn the largest, the
// store and the smithy a run house's width and deep enough to talk to someone
// inside without talking through a wall. FS-B0H2D §Requirements 1, 2.
func TestHubLayout_ThreeTownBuildings_SizedByWhatTheyHold(t *testing.T) {
	assert.Len(t, hubWalls(t), 3, "the hub's buildings, as walled")

	byName := map[string]hubBuilding{}
	for _, b := range hubBuildings {
		byName[b.Name] = b
	}
	require.Len(t, byName, 3, "three buildings, each named once")

	inn, ok := byName["Inn"]
	require.True(t, ok, "the town has no Inn")
	assert.LessOrEqual(t, inn.W, 400.0, "the Inn is wider than 400")
	assert.LessOrEqual(t, inn.H, 300.0, "the Inn is deeper than 300")

	for _, name := range []string{"Quartermaster's store", "Smithy"} {
		b, ok := byName[name]
		require.True(t, ok, "the town has no %s", name)
		assert.Equal(t, [2]float64{300, 240}, [2]float64{b.W, b.H}, "the %s's size", name)
		assert.Greater(t, inn.W*inn.H, b.W*b.H, "the %s is as large as the Inn", name)
	}
}

// A door opens onto ground: a gap-wide strip 80 deep in front of it lies in the
// map and touches no wall. FS-B0H2D §Requirements 5.
func TestHubLayout_EveryDoorGap_OpensOntoClearGround(t *testing.T) {
	houses := hubWalls(t)
	walls := allWalls(houses)
	hub := box{X: 0, Y: 0, W: constants.HubMapWidth, H: constants.HubMapHeight}

	for _, house := range houses {
		gap, ok := doorGapOf(house)
		require.True(t, ok)

		front := box{X: gap.X, Y: gap.Y + gap.H, W: gap.W, H: 80}
		assert.True(t, hub.contains(front.X, front.Y) && hub.contains(front.X+front.W, front.Y+front.H),
			"the ground in front of the door at %+v runs off the map", gap)
		for _, wall := range walls {
			assert.False(t, front.overlaps(wall), "a wall at %+v stands in front of the door at %+v", wall, gap)
		}
	}
}

// Nobody is set down indoors: the spawn and every gate's arrival point lie
// outside every building. FS-B0H2D §Requirements 6.
func TestHubLayout_SpawnAndArrivals_StandOutdoors(t *testing.T) {
	points := map[string][2]float64{"the spawn": {constants.HubSpawnX, constants.HubSpawnY}}
	for _, gate := range hubGates {
		if gate.Arrival != nil {
			points["the "+string(gate.Destination)+" arrival"] = [2]float64{gate.Arrival.X, gate.Arrival.Y}
		}
	}
	require.Len(t, points, 3, "the spawn and both field arrivals")

	for _, foot := range footprints(hubWalls(t)) {
		for what, at := range points {
			assert.False(t, foot.contains(at[0], at[1]), "%s lies inside the building at %+v", what, foot)
		}
	}
}

// outerWallsOf is a building's own walls, those on the edge of its footprint;
// anything standing inside the room clear of every edge is furniture.
func outerWallsOf(walls []box) []box {
	foot := footprintOf(walls)
	outer := []box{}
	for _, w := range walls {
		if w.X == foot.X || w.Y == foot.Y || w.X+w.W == foot.X+foot.W || w.Y+w.H == foot.Y+foot.H {
			outer = append(outer, w)
		}
	}
	return outer
}

// The Quartermaster keeps his store: he stands inside it, and is still who he
// was. FS-B0H2D §Requirements 8.
func TestHubLayout_Quartermaster_StandsInHisStore(t *testing.T) {
	var store *hubBuilding
	for i := range hubBuildings {
		if hubBuildings[i].Name == "Quartermaster's store" {
			store = &hubBuildings[i]
		}
	}
	require.NotNil(t, store, "the town has no store")
	inside := box{X: store.X, Y: store.Y, W: store.W, H: store.H}

	found := false
	for _, npc := range hubNPCs {
		if npc.Name != "Quartermaster" {
			continue
		}
		found = true
		assert.Equal(t, components.NPCFunctionStorekeeper, npc.Function)
		assert.True(t, inside.contains(npc.X, npc.Y), "the Quartermaster at (%.0f, %.0f) is not in his store", npc.X, npc.Y)
	}
	assert.True(t, found, "the hub has no Quartermaster")
}

// Talk is gated by distance alone, so placement is all that stops a delver
// outside from talking through a wall: everyone inside a building stands more
// than talk range from each of its walls. Furnishings do not count: the Alewife
// is talked to across her counter. Every fixed resident stands indoors.
// FS-B0H2D §Requirements 14, 18.
func TestHubLayout_NobodyIndoors_IsTalkedToThroughAWall(t *testing.T) {
	houses := hubWalls(t)

	indoors := map[string]bool{}
	for _, npc := range npcsIn(builtHub()) {
		for _, house := range houses {
			if !footprintOf(house).contains(npc.At.X, npc.At.Y) {
				continue
			}
			indoors[npc.Name] = true
			for _, wall := range outerWallsOf(house) {
				got := wall.distanceTo(npc.At.X, npc.At.Y)
				assert.Greater(t, got, constants.NPCInteractRange,
					"the %s can be talked to through the wall at %+v (%.0f away)", npc.Name, wall, got)
			}
		}
	}

	for _, resident := range hubFixedResidents {
		assert.True(t, indoors[resident.Name], "the %s stands outdoors", resident.Name)
	}
}

// A resident never walks indoors: a walk is a straight line between two points
// of its quarter, so a quarter wholly outside every building can never cross a
// door gap. Quarters stay in the map. FS-B0H2D §Requirements 7.
func TestHubResidents_QuartersLieOutdoors_InsideTheMap(t *testing.T) {
	hub := box{X: 0, Y: 0, W: constants.HubMapWidth, H: constants.HubMapHeight}
	feet := footprints(hubWalls(t))

	for _, resident := range hubResidents {
		r := resident.Region
		quarter := box{X: r.X, Y: r.Y, W: r.W, H: r.H}

		assert.True(t, hub.contains(quarter.X, quarter.Y) && hub.contains(quarter.X+quarter.W, quarter.Y+quarter.H),
			"%s's quarter runs off the map", resident.Name)
		for _, foot := range feet {
			assert.False(t, quarter.overlaps(foot), "%s's quarter reaches into the building at %+v", resident.Name, foot)
		}
	}
}

// ----- The people inside (FS-B0H2D §D) -----

// hubAppearances are the looks the client already draws for a person; a fixed
// resident wears one of them. FS-B0H2D §Requirements 17.
var hubAppearances = []string{"rust_trousers", "green_skirt", "slate_trousers", "flax_skirt"}

// hubNPCAt is one NPC as the built hub holds it.
type hubNPCAt struct {
	Name   string
	Entity *ecs.Entity
	NPC    *components.NPCComponent
	At     *components.TransformComponent
}

func npcsIn(s *Session) []hubNPCAt {
	found := []hubNPCAt{}
	for _, entity := range s.EntityManager.GetAllEntities() {
		npcComp, isNPC := entity.GetComponent(ecs.ComponentTypeNPC)
		transformComp, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		if !isNPC || !hasTransform {
			continue
		}
		npc := npcComp.(*components.NPCComponent)
		found = append(found, hubNPCAt{Name: npc.Name, Entity: entity, NPC: npc, At: transformComp.(*components.TransformComponent)})
	}
	return found
}

// The innkeeper, the patrons and the smith are the ambient NPC kind pinned in
// place: no function, a look the client already draws, no quarter and no
// velocity, so nothing ever moves them. FS-B0H2D §Requirements 16, 17.
func TestHubFixedResidents_StandWhereTheMapPutsThem_AndNeverMove(t *testing.T) {
	hub := builtHub()
	hub.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")

	want := []string{"Alewife", "Drover", "Gravedigger", "Pilgrim", "Smith"}
	byName := map[string]hubNPCAt{}
	for _, npc := range npcsIn(hub) {
		byName[npc.Name] = npc
	}

	start := map[string][2]float64{}
	for _, name := range want {
		npc, ok := byName[name]
		require.True(t, ok, "the hub has no %s", name)

		assert.Equal(t, components.NPCFunctionNone, npc.NPC.Function, "the %s opens something", name)
		assert.Contains(t, hubAppearances, npc.NPC.Appearance, "the %s wears a look the client cannot draw", name)
		assert.Nil(t, npc.NPC.Wander, "the %s keeps a quarter", name)
		assert.False(t, npc.Entity.HasComponent(ecs.ComponentTypeVelocity), "the %s can be moved", name)
		assert.True(t, npc.Entity.HasComponent(ecs.ComponentTypeInteractable), "the %s cannot be talked to", name)
		start[name] = [2]float64{npc.At.X, npc.At.Y}
	}

	for range 120 {
		tick(hub)
	}

	for _, name := range want {
		at := byName[name].At
		assert.Equal(t, start[name], [2]float64{at.X, at.Y}, "the %s moved", name)
	}
}

// ----- Furnishings (FS-B0H2D §C) -----

// furnishingClearance is the room kept around a furnishing, so a delver can walk
// round it. FS-B0H2D §Requirements 12.
const furnishingClearance = 50

// furnishingsOf is what stands inside a building: its walls that touch none of
// its outer edges, the way the client tells them apart.
func furnishingsOf(walls []box) []box {
	outer := outerWallsOf(walls)
	inside := []box{}
	for _, w := range walls {
		isOuter := false
		for _, o := range outer {
			if w == o {
				isOuter = true
			}
		}
		if !isOuter {
			inside = append(inside, w)
		}
	}
	return inside
}

// distanceBetween is the gap between two boxes; zero when they meet.
func distanceBetween(a, b box) float64 {
	dx := math.Max(math.Max(b.X-(a.X+a.W), a.X-(b.X+b.W)), 0)
	dy := math.Max(math.Max(b.Y-(a.Y+a.H), a.Y-(b.Y+b.H)), 0)
	return math.Hypot(dx, dy)
}

// houseOf is the walls of the named building, found by its footprint.
func houseOf(t *testing.T, houses map[uuid.UUID][]box, name string) []box {
	t.Helper()

	for _, b := range hubBuildings {
		if b.Name != name {
			continue
		}
		for _, house := range houses {
			if footprintOf(house) == (box{X: b.X, Y: b.Y, W: b.W, H: b.H}) {
				return house
			}
		}
	}
	require.Failf(t, "no such building", "the hub has no %s", name)
	return nil
}

// The Inn's counter and three tables and the smithy's forge are keep-outs: walls
// of their building, touching none of its edges, with room to walk round each.
// The store has none. FS-B0H2D §Requirements 10, 12.
func TestHubFurnishings_StandInsideTheirBuilding_WithRoomAround(t *testing.T) {
	houses := hubWalls(t)
	walls := allWalls(houses)

	kinds := map[string][]string{}
	for _, b := range hubBuildings {
		for _, f := range b.Furnishings {
			kinds[b.Name] = append(kinds[b.Name], f.Kind)
		}
	}
	assert.ElementsMatch(t, []string{"counter", "table", "table", "table"}, kinds["Inn"], "the Inn's furnishings")
	assert.ElementsMatch(t, []string{"forge"}, kinds["Smithy"], "the smithy's furnishings")
	assert.Empty(t, kinds["Quartermaster's store"], "the store's furnishings")

	for _, b := range hubBuildings {
		house := houseOf(t, houses, b.Name)
		furnishings := furnishingsOf(house)
		require.Len(t, furnishings, len(b.Furnishings), "the %s's furnishings, as walled", b.Name)

		for _, f := range furnishings {
			for _, other := range walls {
				if other == f {
					continue
				}
				got := distanceBetween(f, other)
				assert.GreaterOrEqual(t, got, float64(furnishingClearance),
					"the furnishing at %+v in the %s stands %.0f from %+v", f, b.Name, got, other)
			}
		}
	}
}

// ----- The room is reachable (FS-B0H2D §Requirements 13, 18) -----

// reachCell is the flood fill's grid: 10 px, the coarsest R13 allows. Door-gap
// centres sit on it, and a player only fits a 50 px gap within 5 px of centre.
const reachCell = 10

// walkerFits is true when a player's body, centred at p, overlaps no wall.
// Bodies are the MovementSystem's: a square PlayerRadius either side of centre,
// free to touch a wall but not to enter it.
func walkerFits(p point, walls []box) bool {
	r := constants.PlayerRadius
	body := box{X: p.x - r, Y: p.y - r, W: 2 * r, H: 2 * r}
	for _, w := range walls {
		if body.overlaps(w) {
			return false
		}
	}
	return true
}

// reachableFrom is every grid point inside a building's footprint a player can
// walk to from start without crossing a wall or a furnishing.
func reachableFrom(start point, walls []box) []point {
	foot := footprintOf(walls)
	if !walkerFits(start, walls) {
		return nil
	}

	seen := map[point]bool{start: true}
	queue := []point{start}
	for len(queue) > 0 {
		p := queue[0]
		queue = queue[1:]
		for _, step := range [4]point{{x: reachCell}, {x: -reachCell}, {y: reachCell}, {y: -reachCell}} {
			next := point{x: p.x + step.x, y: p.y + step.y}
			if seen[next] || !foot.contains(next.x, next.y) || !walkerFits(next, walls) {
				continue
			}
			seen[next] = true
			queue = append(queue, next)
		}
	}

	reached := make([]point, 0, len(seen))
	for p := range seen {
		reached = append(reached, p)
	}
	return reached
}

// doorwayOf is where a player stands in a building's door gap: its centre.
func doorwayOf(t *testing.T, walls []box) point {
	t.Helper()

	gap, ok := doorGapOf(walls)
	require.True(t, ok, "the building at %+v has no door gap", footprintOf(walls))
	at := point{x: gap.X + gap.W/2, y: gap.Y + gap.H/2}
	require.Zero(t, math.Mod(at.x, reachCell), "the door gap's centre is off the flood fill's grid")
	require.Zero(t, math.Mod(at.y, reachCell), "the door gap's centre is off the flood fill's grid")
	return at
}

// withinTalkRange is true when some reached point is in talk range of (x, y).
func withinTalkRange(reached []point, x, y float64) bool {
	for _, p := range reached {
		if math.Hypot(p.x-x, p.y-y) <= constants.NPCInteractRange {
			return true
		}
	}
	return false
}

// The flood fill sees a sealed room: a counter flush across it leaves the far
// side out of reach, and an open room is reached end to end.
func TestReachableFrom_StopsAtAWallAcrossTheRoom(t *testing.T) {
	// a 300x240 house, its door gap centred at x 150
	shell := []box{
		{X: 0, Y: 0, W: 300, H: 20},
		{X: 0, Y: 0, W: 20, H: 240},
		{X: 280, Y: 0, W: 20, H: 240},
		{X: 0, Y: 220, W: 125, H: 20},
		{X: 175, Y: 220, W: 125, H: 20},
	}
	door := point{x: 150, y: 230}
	farSide := point{x: 150, y: 50}

	tests := []struct {
		name  string
		walls []box
		want  bool
	}{
		{"an open room", shell, true},
		{"a counter flush across it", append(append([]box{}, shell...), box{X: 20, Y: 120, W: 260, H: 20}), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reached := reachableFrom(door, tt.walls)
			assert.NotEmpty(t, reached, "a player cannot stand in the doorway")
			assert.Equal(t, tt.want, withinTalkRange(reached, farSide.x, farSide.y))
		})
	}
}

// From each door gap a player can walk to within talk range of everyone inside
// that building, furnishings and all. FS-B0H2D §Requirements 13.
func TestHubLayout_EveryoneIndoors_CanBeReachedFromTheDoor(t *testing.T) {
	houses := hubWalls(t)
	npcs := npcsIn(builtHub())

	for _, b := range hubBuildings {
		t.Run(b.Name, func(t *testing.T) {
			house := houseOf(t, houses, b.Name)
			reached := reachableFrom(doorwayOf(t, house), house)
			require.NotEmpty(t, reached, "a player cannot stand in the %s's doorway", b.Name)

			for _, npc := range npcs {
				if !footprintOf(house).contains(npc.At.X, npc.At.Y) {
					continue
				}
				assert.True(t, withinTalkRange(reached, npc.At.X, npc.At.Y),
					"nobody walking in from the door can reach the %s at (%.0f, %.0f)", npc.Name, npc.At.X, npc.At.Y)
			}
		})
	}
}

// The Alewife stands behind her counter, on its far side from the door, and is
// talked to across it from the door's side. FS-B0H2D §Requirements 18.
func TestHubLayout_Alewife_IsTalkedToAcrossHerCounter(t *testing.T) {
	houses := hubWalls(t)
	house := houseOf(t, houses, "Inn")
	door := doorwayOf(t, house)

	var counter *hubFurnishing
	for _, b := range hubBuildings {
		for i := range b.Furnishings {
			if b.Name == "Inn" && b.Furnishings[i].Kind == "counter" {
				counter = &b.Furnishings[i]
			}
		}
	}
	require.NotNil(t, counter, "the Inn has no counter")

	var alewife *hubFixedResident
	for i := range hubFixedResidents {
		if hubFixedResidents[i].Name == "Alewife" {
			alewife = &hubFixedResidents[i]
		}
	}
	require.NotNil(t, alewife, "the Inn has no Alewife")

	require.Less(t, door.x, counter.X, "the counter does not stand east of the door")
	assert.Greater(t, alewife.X, counter.X+counter.W, "the Alewife is not behind her counter")
	assert.True(t, alewife.Y > counter.Y && alewife.Y < counter.Y+counter.H, "the Alewife is not behind her counter")

	nearSide := []point{}
	for _, p := range reachableFrom(door, house) {
		if p.x+constants.PlayerRadius <= counter.X {
			nearSide = append(nearSide, p)
		}
	}
	assert.True(t, withinTalkRange(nearSide, alewife.X, alewife.Y),
		"nobody on the door's side of the counter can talk to the Alewife")
}
