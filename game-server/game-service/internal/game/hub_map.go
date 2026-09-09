package game

import (
	"log/slog"

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

	slog.Info("Hub map built", "session_id", s.ID, "npcs", len(hubNPCs))
}
