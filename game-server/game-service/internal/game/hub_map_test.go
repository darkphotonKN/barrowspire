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
// than talk range from each of its walls. FS-B0H2D §Requirements 14.
func TestHubLayout_NobodyIndoors_IsTalkedToThroughAWall(t *testing.T) {
	houses := hubWalls(t)

	for _, npc := range hubNPCs {
		for _, house := range houses {
			if !footprintOf(house).contains(npc.X, npc.Y) {
				continue
			}
			for _, wall := range outerWallsOf(house) {
				got := wall.distanceTo(npc.X, npc.Y)
				assert.Greater(t, got, constants.NPCInteractRange,
					"the %s can be talked to through the wall at %+v (%.0f away)", npc.Name, wall, got)
			}
		}
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
