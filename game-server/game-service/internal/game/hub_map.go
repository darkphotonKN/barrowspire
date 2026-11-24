package game

import (
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

// hubNPC is a function NPC's fixed place in the hub.
//
// Their positions are map data, not something the world decides at runtime: a
// delver has to be able to tell someone where to stand.
type hubNPC struct {
	Name     string
	Function components.NPCFunction
	X, Y     float64
}

// The hub's function NPCs. The Elder stands near the spawn, so an arriving
// delver sees who is worth talking to without hunting the map; the Quartermaster
// keeps his store (FS-B0H2D §Requirements 8), his marker showing over its roof.
var hubNPCs = []hubNPC{
	{
		Name:     "Elder",
		Function: components.NPCFunctionStoryteller,
		X:        constants.HubSpawnX + 140,
		Y:        constants.HubSpawnY - 120,
	},
	{
		Name:     "Quartermaster",
		Function: components.NPCFunctionStorekeeper,
		// on the store's centre line, a step in from its door gap: more than talk
		// range from every one of its walls, so nobody outside talks to him
		// through one (FS-B0H2D §Requirements 14)
		X: 1280,
		Y: 270,
	},
}

// hubGate is a fixed place a player walks into to go somewhere.
//
// Map data like the NPCs and buildings: a gate is where it is on every pod and
// after every restart. FS-0XMCP §Requirements 1, 2.
type hubGate struct {
	Destination components.GateDestination
	X, Y        float64
	// Where a player coming back through it is set down; nil when nobody comes
	// back that way.
	Arrival *components.GateArrival
}

// The hub's gates: the Spire's door at the back (north), the trail west to the
// Forlorn Forest, the road east to Gentle Meadows. Each field gate's arrival
// point lies just inside the hub, beyond the gate's range. FS-0XMCP
// §Requirements 2, 3.
//
// The Forest gate stands at y 580, not 400: the Inn's great hall is too deep
// for the old trail's lane to clear it, wherever on the north side it stands,
// so the trail leaves the town further south, past the Inn's front.
var hubGates = []hubGate{
	{Destination: components.GateDestinationSpire, X: 1000, Y: 50},
	{Destination: components.GateDestinationForest, X: 40, Y: 580, Arrival: &components.GateArrival{X: 180, Y: 580}},
	{Destination: components.GateDestinationMeadows, X: 1960, Y: 360, Arrival: &components.GateArrival{X: 1820, Y: 360}},
}

// hubBuilding is one town building's footprint in the hub, and which one it is.
//
// Every town building can be walked into: a gap in its door face and a room
// inside, in this same world (FS-B0H2D §Requirements 1, 9; FS-R4MYX
// §Requirements 6). The name says which room is which for a reader and for the
// tests; nothing at runtime reads it.
//
// What stands inside a building, its furnishings here and its fixed residents in
// hubFixedResidents, is placed in absolute world coordinates, not relative to
// the building: moving a building means moving each of them with it. The client
// mirrors all three by hand, and its door spurs follow each door gap by hand,
// all held to hubTown.golden.json by hub_town_golden_test.go (rewrite it with
// -update).
type hubBuilding struct {
	Name       string
	X, Y, W, H float64
	// The outer wall its street door is cut in; the zero value is south.
	DoorFace hubDoorFace
	// The wall dividing it into two halls; nil for an undivided building. Only
	// a south door goes with one (tested).
	Partition *hubPartition
	// What stands inside, in absolute world coordinates.
	Furnishings []hubFurnishing
}

// hubDoorFace is the outer wall a town building's street door is cut in. Both
// face the camera in the iso view. Not the Inn's DoorOnEastFace, which says
// where along its south wall the Inn's door stands. FS-R4MYX §Requirements 6.
type hubDoorFace int

const (
	// hubDoorSouth is the default: a gap in the south wall, as a run house's.
	hubDoorSouth hubDoorFace = iota
	// hubDoorEast is a gap in the east wall, the south wall whole: the chapel's.
	hubDoorEast
)

// String is the face as the town golden names it.
func (f hubDoorFace) String() string {
	switch f {
	case hubDoorSouth:
		return "south"
	case hubDoorEast:
		return "east"
	default:
		panic(unknownDoorFace(f))
	}
}

// unknownDoorFace is the panic for a face that is neither south nor east: the
// town's buildings are fixed map data, so one is a programming error, never a
// south door by default.
func unknownDoorFace(f hubDoorFace) string {
	return fmt.Sprintf("hub: unknown door face %d", int(f))
}

// hubPartition is a wall of a town building's own, running north to south
// right across it from its north edge to its south edge, cut around a centred
// door gap a run door wide, the south wall's cut turned on its side: two halls
// (the Inn's great hall and taproom), one house id, one roof. It reaches the footprint's edges end on, which is how
// the client tells it from the walls round the building (on the outline) and
// from a furnishing (clear of every edge). X is its west face.
type hubPartition struct {
	X float64
	// The building's street door stands against this wall's east face, its
	// west jamb flush with it, instead of centred in the south wall: for a
	// partition that a centred gap would have standing in it (ADR-0073).
	DoorOnEastFace bool
}

// hubFurnishing is a keep-out inside a town building that a piece of furniture
// stands on: the Inn's long table, hearth, counter and tables, the smithy's
// forge.
//
// A wall like the building's own, carrying its house id, so a delver collides
// with it exactly as with a wall and the client groups it with its building. It
// touches none of the building's outer edges, which is how the client tells it
// from one of them, and keeps 50 px clear of every wall and every other
// furnishing so the room stays walkable round it; the great hall's hearth alone
// stands flush against the north wall it is built into. The kind says which prop the
// client draws on it; it is map data only and never goes on the wire.
// FS-B0H2D §Requirements 10, 12.
type hubFurnishing struct {
	Kind       string
	X, Y, W, H float64
}

// The town's buildings, laid out by hand: the Quartermaster's store, the Inn,
// the smithy and the chapel.
//
// Fixed, not scattered: a run randomises its map because every run is new, but
// the hub is somewhere a delver returns to, and "in the Quartermaster's store"
// has to mean the same thing tomorrow. The store, the Inn and the smithy stand
// north of the trails to the Forest and the Meadows and clear of the walk to the
// Spire, the chapel far south of all three trails, so nothing walls off the way
// out of town: a lane 240 px wide runs from the spawn to every gate (tested in
// hub_map_test.go). Each door faces the town. FS-B0H2D §Requirements 2-6;
// FS-R4MYX §Requirements 2-5.
var hubBuildings = []hubBuilding{
	// the largest, filling the north-west, west of the walk to the Spire and
	// above the Forest trail. A partition parts the great hall (west) from the
	// taproom (east), its door at the middle of the Inn's depth. The street door opens
	// into the taproom, 15 px east of centre (x 525 to 605): centred, a gap a
	// run door wide would have the partition standing in it (ADR-0073). The
	// counter runs north-south by its east wall, the
	// Alewife behind it, its two tables between the door and the bar. Through
	// the partition, the long table runs north-south down the great hall, five
	// places a side, the hearth built into the north wall at its head (R18)
	{Name: "Inn", X: 230, Y: 50, W: 640, H: 440, Partition: &hubPartition{X: 505, DoorOnEastFace: true}, Furnishings: []hubFurnishing{
		{Kind: "long_table", X: 352, Y: 175, W: 50, H: 240},
		{Kind: "hall_hearth", X: 300, Y: 70, W: 144, H: 48},
		{Kind: "counter", X: 715, Y: 190, W: 25, H: 140},
		{Kind: "table", X: 600, Y: 130, W: 30, H: 40},
		{Kind: "table", X: 600, Y: 300, W: 45, H: 40},
	}},
	// east of the walk to the Spire. 240 deep, not a run house's 200, so the
	// Quartermaster can stand out of talk range of every wall (R2, R14). No
	// furnishing: its shelves and crates are dressing (R12)
	{Name: "Quartermaster's store", X: 1130, Y: 150, W: 300, H: 240},
	// east of the store, above the road to the Meadows: the Inn took the
	// north-west. The forge stands against the back of the room, as near the
	// north wall as its clearance allows
	{Name: "Smithy", X: 1480, Y: 50, W: 300, H: 240, Furnishings: []hubFurnishing{
		{Kind: "forge", X: 1595, Y: 120, W: 70, H: 35},
	}},
	// in the ground the hub grew south, below the spawn and a little left of it
	// on screen, far enough east that the graveyard lies screen-left of it
	// where its roof hides none of it (FS-R4MYX §Requirements 4, 39); its door
	// in its east wall, facing down-right on screen. The aisle runs west from
	// the door, 100 wide, between three pews a side, each pew's back to the
	// door, to the altar at the west end, with open floor between the altar and
	// the first pews where the Confessor stands. Every pew stands free, 50 px
	// clear all round (ADR-0070 Decision 5): 440 deep is the least that fits
	// pews 100 long so (20 + 50 + 100 + 100 + 100 + 50 + 20)
	{Name: "Chapel", X: 960, Y: 1100, W: 620, H: 440, DoorFace: hubDoorEast, Furnishings: []hubFurnishing{
		{Kind: "pew", X: 1310, Y: 1170, W: 20, H: 100},
		{Kind: "pew", X: 1380, Y: 1170, W: 20, H: 100},
		{Kind: "pew", X: 1450, Y: 1170, W: 20, H: 100},
		{Kind: "pew", X: 1310, Y: 1370, W: 20, H: 100},
		{Kind: "pew", X: 1380, Y: 1370, W: 20, H: 100},
		{Kind: "pew", X: 1450, Y: 1370, W: 20, H: 100},
		{Kind: "altar", X: 1120, Y: 1280, W: 30, H: 80},
	}},
}

const hubWallThickness = 20

// hubDoorWidth is a town building's door gap, in its door face and in its
// partition: a run house's door width. FS-MMA2H §Requirements 2.
const hubDoorWidth = runDoorWidth

// hubResident is an ambient NPC and the quarter they keep to.
//
// Kept few on purpose: the hub is the only world doing N per-player formats per
// tick, so every resident is paid for by everyone standing in it.
type hubResident struct {
	Name       string
	Appearance string
	Region     components.WanderRegion
}

// Their quarters sit in the open ground south of the town buildings and east of
// the chapel, wholly outside every one and in front of each on screen, so no
// roof is drawn over anyone in them (FS-R4MYX §Requirements 39, the client's
// test): a walk is a straight line between two points of a quarter,
// so no resident ever crosses a door gap into a room (FS-B0H2D §Requirements 7).
// They keep away from the spawn and the two function NPCs so nobody has to walk
// through a crowd to reach the Elder: each quarter keeps a function NPC's
// talk range plus a margin clear (FS-MRZH7 §Requirements 9). A quarter may
// cross a lane; a resident does not block a corridor 240 px wide. Both tested in
// hub_map_test.go.
var hubResidents = []hubResident{
	{Name: "Cottar", Appearance: "rust_trousers", Region: components.WanderRegion{X: 560, Y: 560, W: 180, H: 200}},
	{Name: "Herbwife", Appearance: "green_skirt", Region: components.WanderRegion{X: 1260, Y: 540, W: 240, H: 220}},
	// in the open field east of the chapel, in front of it on screen: their old
	// quarters south of the spawn lay behind the chapel's roof (FS-R4MYX
	// §Requirements 5, 39)
	{Name: "Woodcutter", Appearance: "slate_trousers", Region: components.WanderRegion{X: 1780, Y: 1000, W: 180, H: 160}},
	{Name: "Bellringer", Appearance: "flax_skirt", Region: components.WanderRegion{X: 1780, Y: 1240, W: 180, H: 160}},
}

// hubFixedResident is an ambient NPC who stands at one point: no quarter, no
// velocity, function "" (FS-B0H2D §Requirements 16). Indoors, but for the
// mourners in the graveyard (FS-R4MYX §Requirements 16, 20).
type hubFixedResident struct {
	Name       string
	Appearance string
	X, Y       float64
}

// The people inside the town buildings, and the mourners outside the chapel.
// Names follow the town's role-names and are exact: the client keys each one's
// lines and facing by name. Each one indoors stands more than talk range from
// every wall of their building, so nobody outside talks to them through one,
// and within talk range of ground a delver can walk to from the door; the
// Alewife across her counter. FS-B0H2D §Requirements 13, 14, 17, 18; FS-R4MYX
// §Requirements 16, 17, 19, 20.
var hubFixedResidents = []hubFixedResident{
	// Inn, the taproom: behind the counter, on its far side from the door
	{Name: "Alewife", Appearance: "flax_skirt", X: 765, Y: 260},
	// Inn, the great hall: standing at the long table between its chairs, two
	// on its east side and one on its west, each more than talk range from the
	// partition so nobody in the taproom talks to them through it
	{Name: "Drover", Appearance: "rust_trousers", X: 418, Y: 223},
	{Name: "Gravedigger", Appearance: "slate_trousers", X: 418, Y: 319},
	{Name: "Pilgrim", Appearance: "green_skirt", X: 336, Y: 271},
	// Smithy: between the door and the forge, facing north to the forge (the
	// client keeps the facing, FS-B0H2D §Requirements 25)
	{Name: "Smith", Appearance: "rust_trousers", X: 1630, Y: 175},
	// Chapel: the Confessor in front of the dais, on the open floor between the
	// altar and the first pews at the head of the aisle, facing the east door
	// down it, in a bespoke look of his own (FS-R4MYX §Requirements 17, 18); each
	// worshipper in the bay west of their pew, near the aisle, facing the altar
	{Name: "Confessor", Appearance: "confessor", X: 1205, Y: 1320},
	{Name: "Penitent", Appearance: "rust_trousers", X: 1355, Y: 1255},
	{Name: "Chandler", Appearance: "flax_skirt", X: 1425, Y: 1255},
	{Name: "Goodwife", Appearance: "green_skirt", X: 1285, Y: 1385},
	{Name: "Ploughman", Appearance: "slate_trousers", X: 1355, Y: 1385},
	// Outdoors, the only fixed residents who are: the mourners at their graves
	// screen-left of the chapel, more than talk range from its west wall. The server
	// knows only their points; the graves are the client's dressing
	// (FS-R4MYX §Requirements 20)
	{Name: "Keener", Appearance: "flax_skirt", X: 520, Y: 1320},
	{Name: "Widower", Appearance: "slate_trousers", X: 500, Y: 1200},
	{Name: "Veteran", Appearance: "rust_trousers", X: 300, Y: 1380},
}

/**
* Places the hub's fixed residents.
*
* Deliberately NOT InitialMapObjects. A run's map is random buildings, doors,
* containers, switches, an escape door and a seeded item pool; the hub has its
* own fixed town buildings, open door gaps and none of the rest, and those entity
* kinds simply never exist here rather than being filtered out downstream
* (FS-B0H2D §Requirements 9). There are no boundary walls either — a world's
* edge is the MovementSystem clamp, the same as in a run. FS-29KSH
* §Requirements 7, 9.
**/
func (s *Session) InitialHubMapObjects() {
	for _, npc := range hubNPCs {
		CreateFunctionNPCEntity(s.EntityManager, npc)
	}

	for _, gate := range hubGates {
		s.indexGate(CreateGateEntity(s.EntityManager, gate))
	}

	for _, building := range hubBuildings {
		s.addHubBuilding(building)
	}

	for _, resident := range hubResidents {
		CreateResidentEntity(s.EntityManager, resident)
	}

	for _, resident := range hubFixedResidents {
		CreateFixedResidentEntity(s.EntityManager, resident)
	}

	slog.Info("Hub map built",
		"session_id", s.ID,
		"npcs", len(hubNPCs),
		"gates", len(hubGates),
		"buildings", len(hubBuildings),
		"residents", len(hubResidents),
		"fixed_residents", len(hubFixedResidents),
	)
}

// addHubBuilding walls a town building in, leaving a door gap in its door face,
// divides it with its partition, and stands its furnishings inside.
//
// The same cut AddBuilding makes for a run house, a run door wide, centred
// unless the building's partition takes it, but with nothing hung in it: a
// town building is a shop, so there is nothing to open, lock or sync, and the hub keeps no Door component at all. Every wall,
// partition and furnishings included, carries the building's house id, so the
// client rebuilds the footprint from the walls. FS-B0H2D §Requirements 9, 10, 12;
// FS-R4MYX §Requirements 6.
func (s *Session) addHubBuilding(building hubBuilding) {
	houseID := uuid.New()

	walls := append(outerWalls(building), partitionWalls(building)...)

	for _, furnishing := range building.Furnishings {
		walls = append(walls, WallConfig{X: furnishing.X, Y: furnishing.Y, Width: furnishing.W, Height: furnishing.H})
	}

	for _, wall := range walls {
		CreateWallEntity(s.EntityManager, wall, houseID)
	}
}

// outerWalls is the five walls round a building: the north and west walls
// whole, and of the south and east walls the one in its door face cut in two
// either side of the door gap, the other whole.
func outerWalls(building hubBuilding) []WallConfig {
	gap := streetDoorGap(building)
	eastX := building.X + building.W - hubWallThickness
	southY := building.Y + building.H - hubWallThickness

	walls := []WallConfig{
		// north
		{X: building.X, Y: building.Y, Width: building.W, Height: hubWallThickness},
		// west
		{X: building.X, Y: building.Y, Width: hubWallThickness, Height: building.H},
	}

	switch building.DoorFace {
	case hubDoorSouth:
		eastOfDoor := gap.X + gap.Width
		return append(walls,
			// east, whole
			WallConfig{X: eastX, Y: building.Y, Width: hubWallThickness, Height: building.H},
			// south, either side of the door gap
			WallConfig{X: building.X, Y: southY, Width: gap.X - building.X, Height: hubWallThickness},
			WallConfig{X: eastOfDoor, Y: southY, Width: building.X + building.W - eastOfDoor, Height: hubWallThickness},
		)
	case hubDoorEast:
		southOfDoor := gap.Y + gap.Height
		return append(walls,
			// south, whole
			WallConfig{X: building.X, Y: southY, Width: building.W, Height: hubWallThickness},
			// east, either side of the door gap
			WallConfig{X: eastX, Y: building.Y, Width: hubWallThickness, Height: gap.Y - building.Y},
			WallConfig{X: eastX, Y: southOfDoor, Width: hubWallThickness, Height: building.Y + building.H - southOfDoor},
		)
	default:
		panic(unknownDoorFace(building.DoorFace))
	}
}

// streetDoorGap is a building's street door as cut: the rect of its door face's
// wall left open between the two segments. A south door stands doorGapWest in
// from the west edge; an east door is centred in the east wall.
//
// The WallConfig it returns is the opening itself, never a wall to create:
// outerWalls walls either side of it, and the town golden records it as the
// door.
func streetDoorGap(building hubBuilding) WallConfig {
	switch building.DoorFace {
	case hubDoorSouth:
		return WallConfig{
			X:      building.X + doorGapWest(building),
			Y:      building.Y + building.H - hubWallThickness,
			Width:  hubDoorWidth,
			Height: hubWallThickness,
		}
	case hubDoorEast:
		return WallConfig{
			X:      building.X + building.W - hubWallThickness,
			Y:      building.Y + (building.H-hubDoorWidth)/2,
			Width:  hubWallThickness,
			Height: hubDoorWidth,
		}
	default:
		panic(unknownDoorFace(building.DoorFace))
	}
}

// doorGapWest is how far a south door gap stands from its building's west edge:
// centred in the south wall, unless its partition takes the door against its
// east face.
func doorGapWest(building hubBuilding) float64 {
	if p := building.Partition; p != nil && p.DoorOnEastFace {
		return p.X + hubWallThickness - building.X
	}
	return (building.W - hubDoorWidth) / 2
}

// partitionWalls is a building's partition as walled: north edge to south edge,
// either side of a centred door gap, the same cut addHubBuilding makes in its
// door face's wall. None for an undivided building.
func partitionWalls(building hubBuilding) []WallConfig {
	if building.Partition == nil {
		return nil
	}

	sideOfDoor := (building.H - hubDoorWidth) / 2
	x := building.Partition.X
	return []WallConfig{
		{X: x, Y: building.Y, Width: hubWallThickness, Height: sideOfDoor},
		{X: x, Y: building.Y + sideOfDoor + hubDoorWidth, Width: hubWallThickness, Height: sideOfDoor},
	}
}
