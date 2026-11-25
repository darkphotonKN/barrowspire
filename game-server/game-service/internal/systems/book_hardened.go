package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Hardened's immunity (FS-X2CMM §J R53, as reconciled at wave 2 against the
* Spire's floors): while the Scar of the Pit's hardened runs, a trap's hit, a
* wrong lever's darts among them, deals the warrior nothing, and a gas vent's
* puff does not poison them. A poison already running runs on: hardened stops
* a poisoning from taking hold, it does not cure one, nor is one refreshed
* while it lasts. Poison asks it; the session's trap hit asks it.
**/

// Hardened is whether the delver is hardened (R30).
func Hardened(entity *ecs.Entity) bool {
	book, ok := bookOf(entity)
	if !ok {
		return false
	}
	_, on := book.States[components.BookStateHardened]
	return on
}
