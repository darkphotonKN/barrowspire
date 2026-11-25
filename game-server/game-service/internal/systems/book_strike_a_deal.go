package systems

import (
	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/**
* Strike a Deal (FS-X2CMM §B R11, §J R56). The mercenary's page hires a
* willing encounter group within 4 cells for the rest of the floor, as
* FS-4EC7Z's hire entry point does (game/cutthroats.go Hire), with no gold.
* The group has no body of its own on the wire, so the cast names it by any
* of its living NPCs, as the client shows them (encounter_npcs); the entry
* point resolves the NPC to its group and judges whether it is willing. The
* book reaches it through GroupHirer, which the session supplies on the page's
* ground, so this package never knows the session. It is had when the 2 s
* cast completes, before the page is paid for, so a refusal by the world (not
* willing, already hired, too many allies) spends nothing.
**/

// ErrNoHires refuses a Strike a Deal in a world that supplies no hire entry
// point.
var ErrNoHires = errors.New("the world hires no group")

// GroupHirer is the world's hire entry point: it makes the encounter group of
// group, the entity id of one of its NPCs, allies of hirer, a member id, or
// refuses with nothing changed. FS-4EC7Z §D R15.
type GroupHirer interface {
	Hire(group, hirer uuid.UUID) error
}

// enterStrikeADeal has Strike a Deal's effect: the world hires the target's
// group for the caster, or its refusal comes back as the cast's.
func enterStrikeADeal(cast BookCast) error {
	if cast.Hires == nil {
		return ErrNoHires
	}
	return cast.Hires.Hire(cast.Target.ID, memberIDOf(cast.Caster))
}

// isLivingEncounterNPC is whether e is a living encounter NPC, the one body
// that names its group to Strike a Deal.
func isLivingEncounterNPC(e *ecs.Entity) bool {
	return e.HasComponent(ecs.ComponentTypeEncounterNPC) && alive(e)
}
