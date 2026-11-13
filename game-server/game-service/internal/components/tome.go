package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// TomePlanComponent is a tome run's plan: where the Tome of Filth lies, where
// the Altar of Consecration stands, whether the party carries the tome and
// whether it has been burned. It sits on the run-level entity, beside the
// floor component, so it survives every floor change; only a tome run has one.
// It never reaches a client as such. FS-3103M §B R7.
type TomePlanComponent struct {
	// TomeFloor is the floor the tome lies on, in [1, height - 2].
	TomeFloor int
	// AltarFloor is the floor the altar stands on, above the tome's, never
	// the top.
	AltarFloor int
	// Carried is whether the party took the tome and has not burned it.
	Carried bool
	// Burned is whether the tome was burned at the altar.
	Burned bool
}

func (p *TomePlanComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeTomePlan
}

func NewTomePlanComponent(tomeFloor, altarFloor int) *TomePlanComponent {
	return &TomePlanComponent{TomeFloor: tomeFloor, AltarFloor: altarFloor}
}

// TomeComponent marks the Tome of Filth lying on its floor. FS-3103M §C R8.
type TomeComponent struct{}

func (t *TomeComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeTome
}

func NewTomeComponent() *TomeComponent {
	return &TomeComponent{}
}

// AltarComponent marks the Altar of Consecration on its floor. Whether it is
// burned is the run's plan's. FS-3103M §C R9.
type AltarComponent struct{}

func (a *AltarComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeAltar
}

func NewAltarComponent() *AltarComponent {
	return &AltarComponent{}
}
