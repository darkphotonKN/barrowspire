package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
	The Spellwarden's two rules (FS-E1ZDG §E R19–21): spell resistance takes
	spellResistance off a magic hit after magic resistance, and the Arcane Ward
	takes arcaneWardShare of every hit from mana before HP.
*/

const (
	spellResistance = 0.10
	arcaneWardShare = 0.25
)

// spellResistanceOf is the share a magic hit on target loses after magic
// resistance: spellResistance on a Spellwarden, 0 on any other body.
func spellResistanceOf(target *ecs.Entity) float64 {
	if Specialization(target) != passivetree.Spellwarden {
		return 0
	}
	return spellResistance
}

// arcaneWard takes a Spellwarden's ward share of a hit of damage, its quarter
// rounded, from their mana, never below 0, and returns what is left for HP:
// the other three quarters and whatever mana could not cover. A hit of 1, whose
// quarter rounds to 0, goes wholly to HP. Any other body's hit goes wholly to
// HP, with nothing written.
func arcaneWard(target *ecs.Entity, damage int) int {
	if Specialization(target) != passivetree.Spellwarden {
		return damage
	}
	rc, ok := target.GetComponent(ecs.ComponentTypeResource)
	if !ok {
		return damage
	}
	mana := rc.(*components.ResourceComponent)
	absorbed := min(whole(float64(damage)*arcaneWardShare), mana.Current)
	mana.Current -= absorbed
	return damage - absorbed
}
