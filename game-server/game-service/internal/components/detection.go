package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// Spot is a place on the floor in world px.
type Spot struct {
	X, Y float64
}

/*
DetectableComponent marks something the server keeps off the wire until the
party has seen it: a secret door (FS-5FZ4J §F R38) and, from slice 5, a trap
(§D R30). Spots are the centres of the cells it covers; it is Detected from the
tick a delver's body centre comes within the detection radius of any of them,
for the floor's life. Nothing ever clears Detected: a floor change clears the
entity with the floor.
*/
type DetectableComponent struct {
	Spots    []Spot
	Detected bool
}

func (d *DetectableComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeDetectable
}

/*
ConcealedComponent marks something standing in a hidden room whose secret door
is still shut (FS-5FZ4J §F R37, R39): By is that door's entity id. Nothing
concealed reaches the wire, so nothing names the room; the door's opening takes
the mark off everything it concealed.
*/
type ConcealedComponent struct {
	By uuid.UUID
}

func (c *ConcealedComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeConcealed
}
