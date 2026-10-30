package game

import (
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

// The hub's function NPCs. The Spirewarden stands near the spawn, so an arriving
// delver sees who is worth talking to without hunting the map; the Quartermaster
// keeps his store (FS-B0H2D §Requirements 8), his marker showing over its roof.
var hubNPCs = []hubNPC{
	{
		Name:     "Spirewarden",
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
var hubGates = []hubGate{
	{Destination: components.GateDestinationSpire, X: 1000, Y: 50},
	{Destination: components.GateDestinationForest, X: 40, Y: 400, Arrival: &components.GateArrival{X: 180, Y: 400}},
	{Destination: components.GateDestinationMeadows, X: 1960, Y: 360, Arrival: &components.GateArrival{X: 1820, Y: 360}},
}

// hubBuilding is one town building's footprint in the hub, and which one it is.
//
// Every town building can be walked into: a gap in its south wall and a room
// inside, in this same world (FS-B0H2D §Requirements 1, 9). The name says which
// room is which for a reader and for the tests; nothing at runtime reads it.
//
// What stands inside a building, its furnishings here and its fixed residents in
// hubFixedResidents, is placed in absolute world coordinates, not relative to
// the building: moving a building means moving each of them with it. The client
// mirrors all three by hand, held to hubTown.golden.json by
// hub_town_golden_test.go (rewrite it with -update).
type hubBuilding struct {
	Name       string
	X, Y, W, H float64
	// What stands inside, in absolute world coordinates.
	Furnishings []hubFurnishing
}

// hubFurnishing is a keep-out inside a town building that a piece of furniture
// stands on: the Inn's counter and tables, the smithy's forge.
//
// A wall like the building's own, carrying its house id, so a delver collides
// with it exactly as with a wall and the client groups it with its building. It
// touches none of the building's outer edges, which is how the client tells it
// from one of them, and keeps 50 px clear of every wall and every other
// furnishing so the room stays walkable round it. The kind says which prop the
// client draws on it; it is map data only and never goes on the wire.
// FS-B0H2D §Requirements 10, 12.
type hubFurnishing struct {
	Kind       string
	X, Y, W, H float64
}

// The town's buildings, laid out by hand: the Quartermaster's store, the Inn and
// the smithy.
//
// Fixed, not scattered: a run randomises its map because every run is new, but
// the hub is somewhere a delver returns to, and "in the Quartermaster's store"
// has to mean the same thing tomorrow. All three stand north of the trails to
// the Forest and the Meadows and clear of the walk to the Spire, so nothing
// walls off the way out of town: a lane 240 px wide runs from the spawn to every
// gate (tested in hub_map_test.go). Each south-wall door faces the town.
// FS-B0H2D §Requirements 2-6.
var hubBuildings = []hubBuilding{
	// the largest, west of the walk to the Spire. The counter runs north-south
	// in the east half, the Alewife behind it; the three tables sit in the west
	// half, clear of the walk in from the door (R18)
	{Name: "Inn", X: 470, Y: 110, W: 400, H: 300, Furnishings: []hubFurnishing{
		{Kind: "counter", X: 715, Y: 190, W: 25, H: 140},
		{Kind: "table", X: 540, Y: 185, W: 30, H: 40},
		{Kind: "table", X: 540, Y: 285, W: 30, H: 40},
		{Kind: "table", X: 620, Y: 240, W: 45, H: 40},
	}},
	// east of the walk to the Spire. 240 deep, not a run house's 200, so the
	// Quartermaster can stand out of talk range of every wall (R2, R14). No
	// furnishing: its shelves and crates are dressing (R12)
	{Name: "Quartermaster's store", X: 1130, Y: 150, W: 300, H: 240},
	// the north-west corner, above the Forest trail. The forge stands against
	// the back of the room, as near the north wall as its clearance allows
	{Name: "Smithy", X: 110, Y: 50, W: 300, H: 240, Furnishings: []hubFurnishing{
		{Kind: "forge", X: 225, Y: 120, W: 70, H: 35},
	}},
}

const hubWallThickness = 20

// hubDoorWidth is a town building's door gap: a run house's door width.
const hubDoorWidth = 50

// hubResident is an ambient NPC and the quarter they keep to.
//
// Kept few on purpose: the hub is the only world doing N per-player formats per
// tick, so every resident is paid for by everyone standing in it.
type hubResident struct {
	Name       string
	Appearance string
	Region     components.WanderRegion
}

// Their quarters sit in the open ground south of the town buildings, wholly
// outside every one: a walk is a straight line between two points of a quarter,
// so no resident ever crosses a door gap into a room (FS-B0H2D §Requirements 7).
// They keep away from the spawn and the two function NPCs so nobody has to walk
// through a crowd to reach the Spirewarden: each quarter keeps a function NPC's
// talk range plus a margin clear (FS-MRZH7 §Requirements 9). A quarter may
// cross a lane; a resident does not block a corridor 240 px wide. Both tested in
// hub_map_test.go.
var hubResidents = []hubResident{
	{Name: "Cottar", Appearance: "rust_trousers", Region: components.WanderRegion{X: 560, Y: 560, W: 180, H: 200}},
	{Name: "Herbwife", Appearance: "green_skirt", Region: components.WanderRegion{X: 1260, Y: 540, W: 240, H: 220}},
	{Name: "Woodcutter", Appearance: "slate_trousers", Region: components.WanderRegion{X: 700, Y: 820, W: 300, H: 140}},
	{Name: "Bellringer", Appearance: "flax_skirt", Region: components.WanderRegion{X: 1180, Y: 820, W: 280, H: 140}},
}

// hubFixedResident is an ambient NPC who stands at one point indoors: no
// quarter, no velocity, function "" (FS-B0H2D §Requirements 16).
type hubFixedResident struct {
	Name       string
	Appearance string
	X, Y       float64
}

// The people inside the town buildings. Names follow the town's role-names and
// are exact: the client keys each one's lines and facing by name. Each stands
// more than talk range from every wall of their building, so nobody outside
// talks to them through one, and within talk range of ground a delver can walk
// to from the door; the Alewife across her counter. FS-B0H2D §Requirements
// 13, 14, 17, 18.
var hubFixedResidents = []hubFixedResident{
	// Inn: behind the counter, on its far side from the door
	{Name: "Alewife", Appearance: "flax_skirt", X: 765, Y: 260},
	// Inn: one patron at each table
	{Name: "Drover", Appearance: "rust_trousers", X: 590, Y: 220},
	{Name: "Gravedigger", Appearance: "slate_trousers", X: 590, Y: 300},
	{Name: "Pilgrim", Appearance: "green_skirt", X: 643, Y: 220},
	// Smithy: between the door and the forge, facing north to the forge (the
	// client keeps the facing, FS-B0H2D §Requirements 25)
	{Name: "Smith", Appearance: "rust_trousers", X: 260, Y: 175},
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

// addHubBuilding walls a town building in, leaving a door gap in its south wall,
// and stands its furnishings inside.
//
// The same cut AddBuilding makes for a run house, a run door wide and centred,
// but with nothing hung in it: a town building is a shop, so there is nothing to
// open, lock or sync, and the hub keeps no Door component at all. Every wall,
// furnishings included, carries the building's house id, so the client
// rebuilds the footprint from the walls. FS-B0H2D §Requirements 9, 10, 12.
func (s *Session) addHubBuilding(building hubBuilding) {
	houseID := uuid.New()
	sideOfDoor := (building.W - hubDoorWidth) / 2
	southY := building.Y + building.H - hubWallThickness

	walls := []WallConfig{
		// north
		{X: building.X, Y: building.Y, Width: building.W, Height: hubWallThickness},
		// west
		{X: building.X, Y: building.Y, Width: hubWallThickness, Height: building.H},
		// east
		{X: building.X + building.W - hubWallThickness, Y: building.Y, Width: hubWallThickness, Height: building.H},
		// south, either side of the door gap
		{X: building.X, Y: southY, Width: sideOfDoor, Height: hubWallThickness},
		{X: building.X + sideOfDoor + hubDoorWidth, Y: southY, Width: sideOfDoor, Height: hubWallThickness},
	}

	for _, furnishing := range building.Furnishings {
		walls = append(walls, WallConfig{X: furnishing.X, Y: furnishing.Y, Width: furnishing.W, Height: furnishing.H})
	}

	for _, wall := range walls {
		CreateWallEntity(s.EntityManager, wall, houseID)
	}
}
