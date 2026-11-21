package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// quickRiposteCharges is what a Duelist's riposte arms at and spends
// (FS-E1ZDG §I R32). Their parry-charge max stays 3.
const quickRiposteCharges = 2

// riposteChargesOf is the parry charges a caster's cut arms the riposte at,
// and the riposte then spends: 2 for a Duelist, 3 for any other body.
// Everything else about the riposte is the row's (FS-MAMHR §E.23).
func riposteChargesOf(caster *ecs.Entity) int {
	if Specialization(caster) == passivetree.Duelist {
		return quickRiposteCharges
	}
	return riposteParryCharges
}
