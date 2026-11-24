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

// The hub grew south to make room for the chapel and its graveyard: 2000 wide,
// as before, and 1700 deep, the movement clamp with it. FS-R4MYX
// §Requirements 1.
func TestHubBounds_TheTownGrewSouth(t *testing.T) {
	bounds := HubBounds()
	assert.Equal(t, [2]float64{2000, 1700}, [2]float64{bounds.Width, bounds.Height}, "the hub's size")
}

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

// transposed is the box mirrored across the diagonal, x for y: a building's
// east face turned into its south one, so one rule reads either.
func (b box) transposed() box { return box{X: b.Y, Y: b.X, W: b.H, H: b.W} }

func transposedAll(walls []box) []box {
	out := make([]box, len(walls))
	for i, w := range walls {
		out[i] = w.transposed()
	}
	return out
}

// facingWalls is a building's walls along one face: flush with that edge of its
// footprint and a wall thick across it.
func facingWalls(walls []box, face hubDoorFace) []box {
	if face == hubDoorEast {
		return transposedAll(facingWalls(transposedAll(walls), hubDoorSouth))
	}

	foot := footprintOf(walls)
	bottom := foot.Y + foot.H
	found := []box{}
	for _, w := range walls {
		if w.Y+w.H == bottom && w.H == hubWallThickness {
			found = append(found, w)
		}
	}
	return found
}

// gapIn is the opening in one face of a building: the stretch of that edge no
// wall along it covers. ok is false unless that face is exactly two segments
// with one gap between them.
func gapIn(walls []box, face hubDoorFace) (gap box, ok bool) {
	if face == hubDoorEast {
		gap, ok = gapIn(transposedAll(walls), hubDoorSouth)
		return gap.transposed(), ok
	}

	foot := footprintOf(walls)
	south := facingWalls(walls, hubDoorSouth)
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

	return box{X: left.X + left.W, Y: foot.Y + foot.H - hubWallThickness, W: right.X - (left.X + left.W), H: hubWallThickness}, true
}

// hubDoorFaces are the faces a town building's street door may be cut in.
var hubDoorFaces = []hubDoorFace{hubDoorSouth, hubDoorEast}

// doorGapOf is a building's street door, read off its walls: the gap in its
// south or its east face, and which. ok is false unless exactly one of the two
// is cut, into two segments with one gap between them. FS-R4MYX §Requirements 8.
func doorGapOf(walls []box) (gap box, face hubDoorFace, ok bool) {
	cut := 0
	for _, f := range hubDoorFaces {
		if g, isCut := gapIn(walls, f); isCut {
			gap, face = g, f
			cut++
		}
	}
	if cut != 1 {
		return box{}, hubDoorSouth, false
	}
	return gap, face, true
}

// frontOf is the ground in front of a door gap, beyond its sill: as wide as the
// gap, deep px out, south of a south door and east of an east one.
func frontOf(gap box, face hubDoorFace, deep float64) box {
	if face == hubDoorEast {
		return box{X: gap.X + gap.W, Y: gap.Y, W: deep, H: gap.H}
	}
	return box{X: gap.X, Y: gap.Y + gap.H, W: gap.W, H: deep}
}

// innStreetGapX is the west jamb of the Inn's street door: flush against the
// partition's east face, 15 px east of centre, so the partition stands clear
// of the doorway. FS-MMA2H §C, D1; ADR-0073.
const innStreetGapX = 525

// A town building is walked into through a gap in its door face, the run
// house's cut, a run door wide, and its other face is whole. A south gap is
// centred, save the Inn's, which stands against its partition; the chapel's is
// centred in its east wall. FS-B0H2D §Requirements 9; FS-MMA2H §Requirements
// 9; FS-R4MYX §Requirements 6.
func TestHubLayout_EveryBuilding_HasADoorGapARunDoorWideInItsDoorFace(t *testing.T) {
	houses := hubWalls(t)

	for _, b := range hubBuildings {
		house := houseOf(t, houses, b.Name)
		gap, face, ok := doorGapOf(house)
		require.True(t, ok, "the %s has no single door gap", b.Name)
		assert.Equal(t, b.DoorFace, face, "the %s's door is cut in the wrong face", b.Name)

		// along the face: the gap's width and centre; the other face, whole
		along, centre, mid := gap.W, b.X+b.W/2, gap.X+gap.W/2
		otherFace, other := hubDoorEast, box{X: b.X + b.W - hubWallThickness, Y: b.Y, W: hubWallThickness, H: b.H}
		if face == hubDoorEast {
			along, centre, mid = gap.H, b.Y+b.H/2, gap.Y+gap.H/2
			otherFace, other = hubDoorSouth, box{X: b.X, Y: b.Y + b.H - hubWallThickness, W: b.W, H: hubWallThickness}
		}
		assert.Equal(t, float64(runDoorWidth), along, "the %s's door gap", b.Name)
		assert.Equal(t, []box{other}, facingWalls(house, otherFace), "the %s's %s wall is not whole", b.Name, otherFace)

		if b.Name == "Inn" {
			assert.Equal(t, float64(innStreetGapX), gap.X, "the Inn's street door does not stand against its partition")
			continue
		}
		assert.InDelta(t, centre, mid, 0.001, "the %s's door gap is off centre", b.Name)
	}
}

// A door face that is neither south nor east is a mistake in the fixed map
// data, not a south door: naming it, cutting its gap and walling its building
// all panic. FS-R4MYX §Requirements 6.
func TestHubDoorFace_Unknown_Panics(t *testing.T) {
	unknown := hubDoorFace(99)
	building := hubBuilding{Name: "Nowhere", X: 0, Y: 0, W: 300, H: 240, DoorFace: unknown}

	tests := []struct {
		name string
		call func()
	}{
		{"String", func() { _ = unknown.String() }},
		{"streetDoorGap", func() { streetDoorGap(building) }},
		{"outerWalls", func() { outerWalls(building) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Panics(t, tt.call)
		})
	}
}

// The chapel's street door is in its east wall: two segments round a centred
// gap a run door wide, the south wall whole. FS-R4MYX §Requirements 4, 6.
func TestHubLayout_Chapel_HasItsDoorInItsEastWall(t *testing.T) {
	house := houseOf(t, hubWalls(t), "Chapel")

	gap, face, ok := doorGapOf(house)
	require.True(t, ok, "the chapel has no single door gap")
	assert.Equal(t, hubDoorEast, face, "the chapel's door face")
	assert.Equal(t, box{X: 1560, Y: 1280, W: hubWallThickness, H: runDoorWidth}, gap, "the chapel's door gap")
	assert.Len(t, facingWalls(house, hubDoorEast), 2, "the chapel's east wall, either side of its door")
	assert.Len(t, facingWalls(house, hubDoorSouth), 1, "the chapel's south wall")
}

// An east door has no partition: the partition's door rule was written for a
// south door (ADR-0073), and the only east door is the chapel's.
// FS-R4MYX §Requirements 6.
func TestHubLayout_NoEastDoorBuilding_HasAPartition(t *testing.T) {
	for _, b := range hubBuildings {
		if b.DoorFace == hubDoorEast {
			assert.Nil(t, b.Partition, "the %s has an east door and a partition", b.Name)
		}
	}
}

// A door is as wide in play as it is cut: no wall, partition or furnishing of a
// building stands in its street door's gap or in its partition's.
// FS-MMA2H §Requirements 10.
func TestHubLayout_NoWall_StandsInADoorGap(t *testing.T) {
	houses := hubWalls(t)

	for _, b := range hubBuildings {
		house := houseOf(t, houses, b.Name)

		street, _, ok := doorGapOf(house)
		require.True(t, ok, "the %s has no single door gap", b.Name)
		gaps := []box{street}

		segments := partitionsOf(house)
		if b.Partition == nil {
			require.Empty(t, segments, "the %s is divided", b.Name)
		} else {
			// a partition walled as anything but two segments has no gap this
			// test can name: that is a failure, never a pass
			require.Len(t, segments, 2, "the %s's partition, either side of its door gap", b.Name)
			north, south := segments[0], segments[1]
			if north.Y > south.Y {
				north, south = south, north
			}
			gaps = append(gaps, box{X: north.X, Y: north.Y + north.H, W: north.W, H: south.Y - (north.Y + north.H)})
		}

		for _, gap := range gaps {
			for _, wall := range house {
				assert.False(t, gap.overlaps(wall), "a wall at %+v stands in the %s's door gap at %+v", wall, b.Name, gap)
			}
		}
	}
}

// The town keeps four buildings, every one enterable: the Inn the largest, a
// great hall and a taproom of about 640x440, the store and the smithy a run
// house's width and deep enough to talk to someone inside without talking
// through a wall, and the chapel 620x440, long east to west, south of the spawn
// and its centre left of it on screen (a smaller x - y). FS-B0H2D §Requirements 1, 2 (the Inn's size as enlarged); FS-R4MYX
// §Requirements 2-4.
func TestHubLayout_FourTownBuildings_SizedByWhatTheyHold(t *testing.T) {
	assert.Len(t, hubWalls(t), 4, "the hub's buildings, as walled")

	byName := map[string]hubBuilding{}
	for _, b := range hubBuildings {
		byName[b.Name] = b
	}
	require.Len(t, byName, 4, "four buildings, each named once")

	chapel, ok := byName["Chapel"]
	require.True(t, ok, "the town has no chapel")
	assert.Equal(t, [2]float64{620, 440}, [2]float64{chapel.W, chapel.H}, "the chapel's size")
	centreX, centreY := chapel.X+chapel.W/2, chapel.Y+chapel.H/2
	assert.Less(t, centreX-centreY, constants.HubSpawnX-constants.HubSpawnY, "the chapel's centre is not left of the spawn on screen")
	assert.Greater(t, chapel.Y, constants.HubSpawnY, "the chapel is not south of the spawn")

	inn, ok := byName["Inn"]
	require.True(t, ok, "the town has no Inn")
	assert.InDelta(t, 640.0, inn.W, 40, "the Inn's width")
	assert.InDelta(t, 440.0, inn.H, 40, "the Inn's depth")

	for _, name := range []string{"Quartermaster's store", "Smithy"} {
		b, ok := byName[name]
		require.True(t, ok, "the town has no %s", name)
		assert.Equal(t, [2]float64{300, 240}, [2]float64{b.W, b.H}, "the %s's size", name)
		assert.Greater(t, inn.W*inn.H, b.W*b.H, "the %s is as large as the Inn", name)
	}
}

// A door opens onto ground: a gap-wide strip 80 deep outside its door face, south
// of a south door and east of an east one, lies in the map and touches no wall.
// FS-B0H2D §Requirements 5; FS-R4MYX §Requirements 5.
func TestHubLayout_EveryDoorGap_OpensOntoClearGround(t *testing.T) {
	houses := hubWalls(t)
	walls := allWalls(houses)
	hub := box{X: 0, Y: 0, W: constants.HubMapWidth, H: constants.HubMapHeight}

	for _, house := range houses {
		gap, face, ok := doorGapOf(house)
		require.True(t, ok)

		front := frontOf(gap, face, 80)
		assert.True(t, hub.contains(front.X, front.Y) && hub.contains(front.X+front.W, front.Y+front.H),
			"the ground in front of the door at %+v runs off the map", gap)
		for _, wall := range walls {
			assert.False(t, front.overlaps(wall), "a wall at %+v stands in front of the door at %+v", wall, gap)
		}
	}
}

// Nobody is set down indoors: the spawn and every gate's arrival point lie
// outside every building, the dev test room's gate included (FS-BDRTJ R4).
// FS-B0H2D §Requirements 6; FS-R4MYX §Requirements 5.
func TestHubLayout_SpawnAndArrivals_StandOutdoors(t *testing.T) {
	points := map[string][2]float64{"the spawn": {constants.HubSpawnX, constants.HubSpawnY}}
	for _, gate := range append(append([]hubGate{}, hubGates...), devTestRoomHubGate) {
		if gate.Arrival != nil {
			points["the "+string(gate.Destination)+" arrival"] = [2]float64{gate.Arrival.X, gate.Arrival.Y}
		}
	}
	require.Len(t, points, 4, "the spawn, both field arrivals and the dev test room's")

	for _, foot := range footprints(hubWalls(t)) {
		for what, at := range points {
			assert.False(t, foot.contains(at[0], at[1]), "%s lies inside the building at %+v", what, foot)
		}
	}
}

// edgeWallsOf is a building's own walls, those reaching the edge of its
// footprint: the walls round it and a partition across it, whose segments reach
// the edge end on. Anything standing inside clear of every edge is furniture.
func edgeWallsOf(walls []box) []box {
	foot := footprintOf(walls)
	outer := []box{}
	for _, w := range walls {
		if w.X == foot.X || w.Y == foot.Y || w.X+w.W == foot.X+foot.W || w.Y+w.H == foot.Y+foot.H {
			outer = append(outer, w)
		}
	}
	return outer
}

// outlineEpsilon is the float noise the outline test allows, the client's.
const outlineEpsilon = 1e-6

// onOutline is true when a wall stands along one of its footprint's sides, one
// face of its thickness on that side's edge: a wall runs along its longer side
// (a square one along x), so one along x is on the north or south side, one
// along y the west or east. A partition reaches the edge end on, across the
// building, so it is not. The client's onOutline (game-client
// src/render/world/houses.ts), mirrored.
func onOutline(w, foot box) bool {
	near, far, lo, hi := w.X, w.X+w.W, foot.X, foot.X+foot.W
	if w.W >= w.H {
		near, far, lo, hi = w.Y, w.Y+w.H, foot.Y, foot.Y+foot.H
	}
	return math.Abs(near-lo) <= outlineEpsilon || math.Abs(far-hi) <= outlineEpsilon
}

// partitionsOf is the wall dividing a building's two halls, its segments either
// side of a door gap: walls reaching the footprint's edge that are not on its
// outline. The way the client tells it from the walls round the building.
func partitionsOf(walls []box) []box {
	foot := footprintOf(walls)
	found := []box{}
	for _, w := range edgeWallsOf(walls) {
		if !onOutline(w, foot) {
			found = append(found, w)
		}
	}
	return found
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
// than talk range from each of its walls. The Inn's partition counts too, so
// nobody in the great hall talks to the Alewife through it, nor anyone in the
// taproom to a patron. Furnishings do not count: the Alewife is talked to
// across her counter. Every fixed resident stands indoors but the mourners, who
// stand outdoors in the graveyard. FS-B0H2D §Requirements 14, 18; FS-R4MYX
// §Requirements 19, 20.
func TestHubLayout_NobodyIndoors_IsTalkedToThroughAWall(t *testing.T) {
	houses := hubWalls(t)

	indoors := map[string]bool{}
	for _, npc := range npcsIn(builtHub()) {
		for _, house := range houses {
			if !footprintOf(house).contains(npc.At.X, npc.At.Y) {
				continue
			}
			indoors[npc.Name] = true
			for _, wall := range edgeWallsOf(house) {
				got := wall.distanceTo(npc.At.X, npc.At.Y)
				assert.Greater(t, got, constants.NPCInteractRange,
					"the %s can be talked to through the wall at %+v (%.0f away)", npc.Name, wall, got)
			}
		}
	}

	outdoors := []string{}
	for _, resident := range hubFixedResidents {
		if !indoors[resident.Name] {
			outdoors = append(outdoors, resident.Name)
		}
	}
	assert.ElementsMatch(t, hubMourners, outdoors, "the fixed residents standing outdoors")
}

// hubMourners are the fixed residents who stand outdoors, at the graves west of
// the chapel. FS-R4MYX §Requirements 17, 20.
var hubMourners = []string{"Keener", "Widower", "Veteran"}

// A mourner stands outdoors, so nothing but placement keeps them apart from
// everyone else: in the map and outside every building; more than talk range
// from every wall of every building, so nobody indoors talks to them through
// one; a function NPC's talk range plus a margin from each one, as a quarter
// keeps (FS-MRZH7 §Requirements 9); and out of every lane from the spawn to a
// gate, a dev build's test room gate included. FS-R4MYX §Requirements 20.
func TestHubFixedResidents_Outdoors_StandClearOfWallsNPCsAndLanes(t *testing.T) {
	hub := box{X: 0, Y: 0, W: constants.HubMapWidth, H: constants.HubMapHeight}
	houses := hubWalls(t)
	feet, walls := footprints(houses), allWalls(houses)
	gates := append(append([]hubGate{}, hubGates...), devTestRoomHubGate)

	at := map[string]hubFixedResident{}
	for _, r := range hubFixedResidents {
		at[r.Name] = r
	}

	for _, name := range hubMourners {
		t.Run(name, func(t *testing.T) {
			r, ok := at[name]
			require.True(t, ok, "the hub has no %s", name)

			assert.True(t, hub.contains(r.X, r.Y), "the %s at (%.0f, %.0f) stands off the map", name, r.X, r.Y)
			for _, foot := range feet {
				assert.False(t, foot.contains(r.X, r.Y), "the %s stands inside the building at %+v", name, foot)
			}
			for _, wall := range walls {
				got := wall.distanceTo(r.X, r.Y)
				assert.Greater(t, got, constants.NPCInteractRange,
					"the %s can be talked to through the wall at %+v (%.0f away)", name, wall, got)
			}
			for _, npc := range hubNPCs {
				got := math.Hypot(npc.X-r.X, npc.Y-r.Y)
				assert.GreaterOrEqual(t, got, constants.NPCInteractRange+hubResidentMargin,
					"the %s stands %.0f from the %s", name, got, npc.Name)
			}
			for _, gate := range gates {
				got := pointToSegment(r.X, r.Y, constants.HubSpawnX, constants.HubSpawnY, gate.X, gate.Y)
				assert.Greater(t, got, float64(laneHalfWidth),
					"the %s stands in the lane to the %s gate (%.0f from it)", name, gate.Destination, got)
			}
		})
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
// resident wears one of them: a villager's `<palette>_<build>`, or the
// Confessor's bespoke sheet. FS-B0H2D §Requirements 17; FS-R4MYX
// §Requirements 18.
var hubAppearances = []string{"rust_trousers", "green_skirt", "slate_trousers", "flax_skirt", "confessor"}

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

// The innkeeper, the patrons, the smith, the Confessor, the worshippers and the
// mourners are the ambient NPC kind pinned in place: no function, a look the
// client already draws, no quarter and no velocity, so nothing ever moves them.
// Thirteen in all. FS-B0H2D §Requirements 16, 17; FS-R4MYX §Requirements 16-18.
func TestHubFixedResidents_StandWhereTheMapPutsThem_AndNeverMove(t *testing.T) {
	hub := builtHub()
	hub.AddPlayer(uuid.New(), types.CharacterInPlay{Name: "Wren", Class: "warrior"}, "")

	want := []string{
		"Alewife", "Drover", "Gravedigger", "Pilgrim", "Smith",
		"Confessor", "Penitent", "Chandler", "Goodwife", "Ploughman",
		"Keener", "Widower", "Veteran",
	}
	require.Len(t, hubFixedResidents, len(want), "the hub's fixed residents")
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
	assert.Equal(t, "confessor", byName["Confessor"].NPC.Appearance, "the Confessor's look")

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
	outer := edgeWallsOf(walls)
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

// wallBacked is the furnishing built into a wall: the great hall's hearth
// stands flush against the Inn's north wall, its chimney breast in it, so the
// room's clearance holds on its other sides only.
const wallBacked = "hall_hearth"

// The Inn's long table, hearth, counter and two tables, the smithy's forge and
// the chapel's six pews and altar are keep-outs: walls of their building,
// touching none of its edges, with room to walk round each. The hearth is built
// into the north wall and keeps its room on every other side; no pew is
// (ADR-0070 Decision 5). The store has none. FS-B0H2D §Requirements 10, 12 (the
// Inn's furnishings as enlarged); FS-R4MYX §Requirements 12.
func TestHubFurnishings_StandInsideTheirBuilding_WithRoomAround(t *testing.T) {
	houses := hubWalls(t)
	walls := allWalls(houses)

	kinds := map[string][]string{}
	for _, b := range hubBuildings {
		for _, f := range b.Furnishings {
			kinds[b.Name] = append(kinds[b.Name], f.Kind)
		}
	}
	assert.ElementsMatch(t, []string{"long_table", "hall_hearth", "counter", "table", "table"}, kinds["Inn"], "the Inn's furnishings")
	assert.ElementsMatch(t, []string{"forge"}, kinds["Smithy"], "the smithy's furnishings")
	assert.ElementsMatch(t, []string{"pew", "pew", "pew", "pew", "pew", "pew", "altar"}, kinds["Chapel"], "the chapel's furnishings")
	assert.Empty(t, kinds["Quartermaster's store"], "the store's furnishings")

	for _, b := range hubBuildings {
		house := houseOf(t, houses, b.Name)
		require.Len(t, furnishingsOf(house), len(b.Furnishings), "the %s's furnishings, as walled", b.Name)
		northWall := box{X: b.X, Y: b.Y, W: b.W, H: hubWallThickness}

		for _, furnishing := range b.Furnishings {
			f := box{X: furnishing.X, Y: furnishing.Y, W: furnishing.W, H: furnishing.H}
			require.Contains(t, furnishingsOf(house), f, "the %s's %s, as walled", b.Name, furnishing.Kind)

			if furnishing.Kind == wallBacked {
				assert.Equal(t, northWall.Y+northWall.H, f.Y, "the %s's hearth does not stand against its north wall", b.Name)
			}
			for _, other := range walls {
				if other == f || (furnishing.Kind == wallBacked && other == northWall) {
					continue
				}
				got := distanceBetween(f, other)
				assert.GreaterOrEqual(t, got, float64(furnishingClearance),
					"the %s at %+v in the %s stands %.0f from %+v", furnishing.Kind, f, b.Name, got, other)
			}
		}
	}
}

// ----- The Inn's two rooms -----

// innOf is the Inn as hub_map.go lays it out.
func innOf(t *testing.T) hubBuilding {
	t.Helper()

	for _, b := range hubBuildings {
		if b.Name == "Inn" {
			return b
		}
	}
	require.Fail(t, "the town has no Inn")
	return hubBuilding{}
}

// The Inn is one building of two halls: a wall of its own runs north to south
// right across it, 20 thick, cut around one centred door a run door wide,
// parting the great hall from the taproom. The store and the smithy are
// undivided.
func TestHubLayout_Inn_IsSplitByOnePartition_WithACentredDoorGap(t *testing.T) {
	houses := hubWalls(t)

	for _, b := range hubBuildings {
		if b.Name != "Inn" {
			assert.Empty(t, partitionsOf(houseOf(t, houses, b.Name)), "the %s is divided", b.Name)
		}
	}

	house := houseOf(t, houses, "Inn")
	foot := footprintOf(house)
	segments := partitionsOf(house)
	require.Len(t, segments, 2, "the Inn's partition, either side of its door gap")
	if segments[0].Y > segments[1].Y {
		segments[0], segments[1] = segments[1], segments[0]
	}
	north, south := segments[0], segments[1]

	for _, s := range segments {
		assert.Equal(t, float64(hubWallThickness), s.W, "the partition's thickness")
		assert.Equal(t, north.X, s.X, "the partition's two segments are not in line")
	}
	assert.Equal(t, foot.Y, north.Y, "the partition does not reach the north wall")
	assert.Equal(t, foot.Y+foot.H, south.Y+south.H, "the partition does not reach the south wall")

	gap := south.Y - (north.Y + north.H)
	assert.Equal(t, float64(runDoorWidth), gap, "the partition's door gap")
	assert.InDelta(t, foot.Y+foot.H/2, north.Y+north.H+gap/2, 0.001, "the partition's door gap is off centre")

	// the street door opens wholly into one hall, the partition clear of its jambs
	door, _, ok := doorGapOf(house)
	require.True(t, ok)
	assert.True(t, door.X >= north.X+north.W || door.X+door.W <= north.X,
		"the partition stands in the Inn's street door at %+v", door)
}

// Each building is walled as hub_map.go lays it out and nothing more: five walls
// round it (the wall of its door face in two), its partition's two segments if it has one,
// and one wall per furnishing, every one under its house id.
func TestHubLayout_EachBuilding_IsWalledAsLaidOut(t *testing.T) {
	houses := hubWalls(t)

	for _, b := range hubBuildings {
		want := 5 + len(partitionWalls(b)) + len(b.Furnishings)
		assert.Len(t, houseOf(t, houses, b.Name), want, "the %s's walls", b.Name)
	}
	assert.Len(t, partitionWalls(innOf(t)), 2, "the Inn's partition, either side of its door gap")
}

// The partition parts a great hall from a taproom. The street door opens into
// the taproom, the bar along its east wall with the Alewife behind it and its
// small tables; through the partition's door, the great hall holds the long
// table, seating five a side, and the hearth at its head, and the patrons
// stand at the long table. FS-B0H2D §Requirements 17, 18 (as enlarged).
func TestHubLayout_Inn_GreatHallAndTaproom_HoldWhatTheyShould(t *testing.T) {
	inn := innOf(t)
	require.NotNil(t, inn.Partition, "the Inn has no partition")
	wall := inn.Partition.X

	westOf := func(x float64) bool { return x < wall }
	door, _, ok := doorGapOf(houseOf(t, hubWalls(t), "Inn"))
	require.True(t, ok)
	assert.False(t, westOf(door.X), "the street door does not open into the taproom")

	byKind := map[string][]hubFurnishing{}
	for _, f := range inn.Furnishings {
		byKind[f.Kind] = append(byKind[f.Kind], f)
		greatHall := f.Kind == "long_table" || f.Kind == "hall_hearth"
		assert.Equal(t, greatHall, westOf(f.X) && westOf(f.X+f.W), "the %s stands in the wrong hall", f.Kind)
	}

	require.Len(t, byKind["long_table"], 1, "the great hall's long table")
	table := byKind["long_table"][0]
	assert.GreaterOrEqual(t, math.Max(table.W, table.H), 240.0, "the long table seats five a side")

	at := map[string][2]float64{}
	for _, r := range hubFixedResidents {
		at[r.Name] = [2]float64{r.X, r.Y}
	}
	assert.False(t, westOf(at["Alewife"][0]), "the Alewife is not in the taproom")

	tableBox := box{X: table.X, Y: table.Y, W: table.W, H: table.H}
	for _, patron := range []string{"Drover", "Gravedigger", "Pilgrim"} {
		p := at[patron]
		assert.True(t, westOf(p[0]), "the %s is not in the great hall", patron)
		assert.LessOrEqual(t, tableBox.distanceTo(p[0], p[1]), 20.0, "the %s does not stand at the long table", patron)
	}
}

// ----- The room is reachable (FS-B0H2D §Requirements 13, 18) -----

// reachCell is the flood fill's grid: 10 px, the coarsest R13 allows. A walk
// starts on it, in a door gap: a gap is two bodies wide, so a player fits it
// anywhere within 20 px of its centre.
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

// doorwayOf is where a player stands in a building's door gap, on either face:
// the grid point nearest its centre along the wall (the Inn's street door is
// centred 5 px off the grid), the wall's middle across it. An east door is read
// as a south one on the building mirrored, as gapIn reads it.
func doorwayOf(t *testing.T, walls []box) point {
	t.Helper()

	gap, face, ok := doorGapOf(walls)
	require.True(t, ok, "the building at %+v has no door gap", footprintOf(walls))
	if face == hubDoorEast {
		return doorwayOf(t, transposedAll(walls)).transposed()
	}

	at := point{x: math.Round((gap.X+gap.W/2)/reachCell) * reachCell, y: gap.Y + gap.H/2}
	require.Zero(t, math.Mod(at.y, reachCell), "the door gap's centre is off the flood fill's grid")
	return at
}

// transposed is the point mirrored across the diagonal, x for y, as a box's.
func (p point) transposed() point { return point{x: p.y, y: p.x} }

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

// The chapel holds the Confessor and the four worshippers and nobody else, so
// the indoor rules held of everyone in a building (out of talk range of every
// wall, reached from the door) are held of them. FS-R4MYX §Requirements 17, 19.
func TestHubLayout_Chapel_HoldsTheConfessorAndTheFourWorshippers(t *testing.T) {
	chapel := footprintOf(houseOf(t, hubWalls(t), "Chapel"))

	inside := []string{}
	for _, npc := range npcsIn(builtHub()) {
		if chapel.contains(npc.At.X, npc.At.Y) {
			inside = append(inside, npc.Name)
		}
	}
	assert.ElementsMatch(t, []string{"Confessor", "Penitent", "Chandler", "Goodwife", "Ploughman"}, inside, "who stands in the chapel")
}

// The chapel's aisle runs from its east door to the altar between the pew rows,
// at least 100 wide, and the Confessor stands at its head, east of the altar on
// the open floor before the first pews, not behind the altar: the flood fill
// from the east door, started at its centre (1570, 1320), walks the aisle from
// the door to within talk range of him. FS-R4MYX §Requirements 8, 12, 13, 17.
func TestHubLayout_Chapel_AisleLeadsFromTheEastDoorToTheConfessor(t *testing.T) {
	house := houseOf(t, hubWalls(t), "Chapel")
	door := doorwayOf(t, house)
	require.Equal(t, point{x: 1570, y: 1320}, door, "the chapel's doorway")

	reached := map[point]bool{}
	for _, p := range reachableFrom(door, house) {
		reached[p] = true
	}

	var altar *hubFurnishing
	pews := []hubFurnishing{}
	for _, b := range hubBuildings {
		if b.Name != "Chapel" {
			continue
		}
		for i := range b.Furnishings {
			switch b.Furnishings[i].Kind {
			case "altar":
				altar = &b.Furnishings[i]
			case "pew":
				pews = append(pews, b.Furnishings[i])
			}
		}
	}
	require.NotNil(t, altar, "the chapel has no altar")
	require.Len(t, pews, 6, "the chapel's pews")

	// the aisle: the floor between the pews north of the door's line and those south of it
	aisleNorth, aisleSouth, firstPew := math.Inf(-1), math.Inf(1), math.Inf(1)
	for _, p := range pews {
		assert.Equal(t, [2]float64{20, 100}, [2]float64{p.W, p.H}, "the pew at (%.0f, %.0f)", p.X, p.Y)
		if p.Y+p.H <= door.y {
			aisleNorth = math.Max(aisleNorth, p.Y+p.H)
		} else {
			aisleSouth = math.Min(aisleSouth, p.Y)
		}
		firstPew = math.Min(firstPew, p.X)
	}
	assert.GreaterOrEqual(t, aisleSouth-aisleNorth, 100.0, "the aisle's width")

	for x := door.x; x-constants.PlayerRadius >= altar.X+altar.W; x -= reachCell {
		assert.True(t, reached[point{x: x, y: door.y}], "the aisle at (%.0f, %.0f) cannot be walked to from the door", x, door.y)
	}

	var confessor *hubFixedResident
	for i := range hubFixedResidents {
		if hubFixedResidents[i].Name == "Confessor" {
			confessor = &hubFixedResidents[i]
		}
	}
	require.NotNil(t, confessor, "the chapel has no Confessor")
	assert.Greater(t, confessor.X, altar.X+altar.W, "the Confessor stands at the altar, not in front of it")
	assert.Less(t, confessor.X, firstPew, "the Confessor stands among the pews")
	assert.True(t, confessor.Y > aisleNorth && confessor.Y < aisleSouth, "the Confessor stands off the aisle's head")

	aisle := []point{}
	for _, p := range reachableFrom(door, house) {
		if p.y > aisleNorth && p.y < aisleSouth {
			aisle = append(aisle, p)
		}
	}
	assert.True(t, withinTalkRange(aisle, confessor.X, confessor.Y), "nobody walking up the aisle can talk to the Confessor")
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
