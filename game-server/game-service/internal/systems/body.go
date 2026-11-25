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
never whether it is a player, so a hired ally (FS-4EC7Z §C R9) is a kind of
its own here that weighs and fires traps, and the archer's hound (FS-X2CMM
§J R58) one that weighs, and nothing else changes.
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
	// BodyEncounterNPC is a live peaceful encounter NPC (FS-4EC7Z §A R3): in
	// a block's way, hunted by monsters, breathing a cloud someone else keeps
	// puffing, weighing and firing nothing
	BodyEncounterNPC
	// BodyCaptive is a live encounter NPC in its cage: no monster hunts it
	// (§A R3, §D R13)
	BodyCaptive
	// BodyAlly is a live hired ally (FS-4EC7Z §C R9): a body on the floor as
	// a delver is to a plate and a trap, hunted by monsters, pushing no block
	// and detecting nothing
	BodyAlly
	// BodyHound is a standing hound, with health and time left (FS-X2CMM §E
	// R28, §J R58): holding a plate as a body does, in a block's way, hunted
	// by monsters, pushing no block, detecting nothing, firing no trap and
	// breathing no cloud
	BodyHound
)

// BodyKindOf is what entity counts as to the ground.
func BodyKindOf(entity *ecs.Entity) BodyKind {
	if entity.HasComponent(ecs.ComponentTypePlayer) {
		if InPlay(entity) {
			return BodyDelver
		}
		return BodyNone
	}
	if nc, ok := entity.GetComponent(ecs.ComponentTypeEncounterNPC); ok {
		if !alive(entity) {
			return BodyNone
		}
		switch nc.(*components.EncounterNPCComponent).Stance {
		case components.StanceCaged:
			return BodyCaptive
		case components.StanceAlly:
			return BodyAlly
		}
		return BodyEncounterNPC
	}
	if entity.HasComponent(ecs.ComponentTypeHound) {
		if standingHound(entity) {
			return BodyHound
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

// Weighs is whether a body of this kind holds a plate it stands on: a delver,
// a hired ally and a hound do, a monster never (FS-5FZ4J §C R18, FS-4EC7Z §C
// R9, FS-X2CMM §J R58).
func (k BodyKind) Weighs() bool { return k == BodyDelver || k == BodyAlly || k == BodyHound }

// Pushes is whether a body of this kind pushes a stone block it walks
// against: a delver does, a monster never (FS-5FZ4J §C R19).
func (k BodyKind) Pushes() bool { return k == BodyDelver }

// Detects is whether a body of this kind detects a secret door or a trap it
// comes near: a delver in play does, a monster never (FS-5FZ4J §F R38, §D R30).
func (k BodyKind) Detects() bool { return k == BodyDelver }

// FiresTraps is whether a body of this kind fires a trap it steps on: a
// delver in play and a hired ally do, a monster never (FS-5FZ4J §D R25,
// FS-4EC7Z §C R9).
func (k BodyKind) FiresTraps() bool { return k == BodyDelver || k == BodyAlly }

// Breathes is whether a puffing gas vent's cloud poisons a body of this kind:
// whoever fires a trap, and a peaceful encounter NPC too, who can die of it;
// never a monster or a caged captive. Only a body that FiresTraps makes a vent
// puff (FS-5FZ4J §D R28, FS-4EC7Z §C R9 amended, Edge States).
func (k BodyKind) Breathes() bool { return k.FiresTraps() || k == BodyEncounterNPC }

// Hunted is whether a monster's target choice counts a body of this kind:
// a delver in play, an encounter NPC out of a cage, an ally included, and a
// standing hound, the nearest taken (FS-77AB6 §Requirements 26, FS-4EC7Z §A
// R3, §C R9, FS-X2CMM §E R28).
func (k BodyKind) Hunted() bool {
	return k == BodyDelver || k == BodyEncounterNPC || k == BodyAlly || k == BodyHound
}

// StruckByArea is whether a monster's area or cone ability lands on a body of
// this kind: every hunted body but a hound, which only a strike or a shot
// meets (FS-X2CMM "Reconciled at review (wave 1)").
func (k BodyKind) StruckByArea() bool { return k.Hunted() && k != BodyHound }
