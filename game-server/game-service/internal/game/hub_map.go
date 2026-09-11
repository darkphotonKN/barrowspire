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

// The hub's residents. Placed near the spawn so an arriving delver can see who
// is worth talking to without hunting the map.
var hubNPCs = []hubNPC{
	{
		Name:     "Spirewarden",
		Function: components.NPCFunctionDelve,
		X:        constants.HubSpawnX + 140,
		Y:        constants.HubSpawnY - 120,
	},
	{
		Name:     "Quartermaster",
		Function: components.NPCFunctionStorekeeper,
		X:        constants.HubSpawnX - 140,
		Y:        constants.HubSpawnY - 120,
	},
}

// hubBuilding is one structure's footprint in the hub.
//
// Exteriors only: four walls and no door. A delver cannot go inside one, so
// there is nothing to open and no interior to build (FS-0008 §Out of Scope).
type hubBuilding struct {
	X, Y, W, H float64
}

// The hub's buildings, laid out by hand.
//
// Fixed, not scattered: a run randomises its map because every run is new, but
// the hub is somewhere a delver returns to, and "left of the Quartermaster" has
// to mean the same thing tomorrow. The middle of the map is left open — that is
// where delvers arrive, where both function NPCs stand, and where the residents
// of I-0052 need room to wander without wedging in a corner.
var hubBuildings = []hubBuilding{
	// the north row, behind the NPCs
	{X: 620, Y: 180, W: 300, H: 200},
	{X: 1080, Y: 180, W: 260, H: 200},
	// the west side
	{X: 240, Y: 460, W: 220, H: 260},
	// the east side, leaving the walk south of the spawn clear
	{X: 1560, Y: 420, W: 240, H: 300},
	// the south-east corner
	{X: 1500, Y: 800, W: 300, H: 140},
}

const hubWallThickness = 20

// hubResident is an ambient NPC and the quarter they keep to.
//
// Kept few on purpose: the hub is the only world doing N per-player formats per
// tick, so every resident is paid for by everyone standing in it.
type hubResident struct {
	Name   string
	Region components.WanderRegion
}

// Their quarters sit in the open ground the buildings leave, and away from the
// spawn and the two function NPCs so nobody has to walk through a crowd to reach
// the Spirewarden.
var hubResidents = []hubResident{
	{Name: "Cottar", Region: components.WanderRegion{X: 560, Y: 560, W: 260, H: 200}},
	{Name: "Herbwife", Region: components.WanderRegion{X: 1120, Y: 540, W: 260, H: 220}},
	{Name: "Woodcutter", Region: components.WanderRegion{X: 700, Y: 820, W: 300, H: 140}},
	{Name: "Bellringer", Region: components.WanderRegion{X: 1180, Y: 820, W: 280, H: 140}},
}

/**
* Places the hub's fixed residents.
*
* Deliberately NOT InitialMapObjects. A run's map is buildings, doors, containers,
* switches, an escape door and a seeded item pool; the hub has none of those, and
* those entity kinds simply never exist here rather than being filtered out
* downstream. There are no boundary walls either — a world's edge is the
* MovementSystem clamp, the same as in a run. FS-0008 §Requirements 7, 9.
**/
func (s *Session) InitialHubMapObjects() {
	for _, npc := range hubNPCs {
		CreateFunctionNPCEntity(s.EntityManager, npc)
	}

	for _, building := range hubBuildings {
		s.addHubBuilding(building)
	}

	for _, resident := range hubResidents {
		CreateResidentEntity(s.EntityManager, resident)
	}

	slog.Info("Hub map built",
		"session_id", s.ID,
		"npcs", len(hubNPCs),
		"buildings", len(hubBuildings),
		"residents", len(hubResidents),
	)
}

// addHubBuilding walls a footprint in on all four sides.
//
// Deliberately not AddBuilding, which cuts a gap in the south wall and hangs a
// door in it: a run's buildings are meant to be entered and looted, and the
// hub's are scenery.
func (s *Session) addHubBuilding(building hubBuilding) {
	houseID := uuid.New()

	walls := []WallConfig{
		{X: building.X, Y: building.Y, Width: building.W, Height: hubWallThickness},
		{X: building.X, Y: building.Y + building.H - hubWallThickness, Width: building.W, Height: hubWallThickness},
		{X: building.X, Y: building.Y, Width: hubWallThickness, Height: building.H},
		{X: building.X + building.W - hubWallThickness, Y: building.Y, Width: hubWallThickness, Height: building.H},
	}

	for _, wall := range walls {
		CreateWallEntity(s.EntityManager, wall, houseID)
	}
}
