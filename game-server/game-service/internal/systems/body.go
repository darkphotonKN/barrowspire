package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
BodyKind is what a body standing on a floor's ground counts as to it: who
holds a plate, pushes a stone block, stands in a block's way (FS-5FZ4J §C
R18-R19), detects a secret door or a trap (§F R38, §D R30) and, later, fires a
trap (§D R25). The ground asks a body's kind,
never whether it is a player, so a hired ally (FS-4EC7Z) joins by becoming a
kind of its own here and answering Weighs; nothing else changes.
*/
type BodyKind int

const (
	// BodyNone is no body the ground counts: a resolved delver, dead or
	// escaped or left behind, a dead monster, anything with no body
	BodyNone BodyKind = iota
	// BodyDelver is a delver in play
	BodyDelver
	// BodyMonster is a live monster
	BodyMonster
)

// BodyKindOf is what entity counts as to the ground.
func BodyKindOf(entity *ecs.Entity) BodyKind {
	if entity.HasComponent(ecs.ComponentTypePlayer) {
		if InPlay(entity) {
			return BodyDelver
		}
		return BodyNone
	}
	if entity.HasComponent(ecs.ComponentTypeEnemy) {
		if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok && hc.(*components.HealthComponent).CurrentHealth > 0 {
			return BodyMonster
		}
	}
	return BodyNone
}

// Weighs is whether a body of this kind holds a plate it stands on: a delver
// does, a monster never (FS-5FZ4J §C R18). A hired ally (FS-4EC7Z) will.
func (k BodyKind) Weighs() bool { return k == BodyDelver }

// Pushes is whether a body of this kind pushes a stone block it walks
// against: a delver does, a monster never (FS-5FZ4J §C R19).
func (k BodyKind) Pushes() bool { return k == BodyDelver }

// Detects is whether a body of this kind detects a secret door or a trap it
// comes near: a delver in play does, a monster never (FS-5FZ4J §F R38, §D R30).
func (k BodyKind) Detects() bool { return k == BodyDelver }

// FiresTraps is whether a body of this kind fires a trap it steps on, or
// breathes a gas vent's cloud: a delver in play does, a monster never
// (FS-5FZ4J §D R25, R28). A hired ally (FS-4EC7Z) will.
func (k BodyKind) FiresTraps() bool { return k == BodyDelver }
