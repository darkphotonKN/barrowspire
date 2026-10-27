package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
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
