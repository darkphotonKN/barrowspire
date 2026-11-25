package systems

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/**
* Levitate's crossing (FS-X2CMM §J R51, as reconciled at wave 2). While afloat
* a delver walks a chasm's shut pits as open ground (MovementSystem) and fires
* no trap and breathes no gas vent (TrapSystem). FS-5FZ4J has no fall rule: a
* body is never inside a pit. So a delver whose afloat ends with their centre
* over a shut pit is set down on the centre of the nearest walkable cell,
* unhurt. It is a move by a page, as Recall's is: a charge in flight ends and
* their timed open and cast break.
**/

// Footing is a dungeon floor's walkable cells as a set-down reads them:
// navigation.Grid's.
type Footing interface {
	// Nearest is the walkable cell whose centre lies nearest (x, y); false
	// when no cell is walkable.
	Nearest(x, y float64) (int, bool)
	// Centre is a cell's centre in px.
	Centre(cell int) (x, y float64)
}

// setDownOffPit sets a delver in play whose centre stands over a shut pit
// down on the nearest walkable cell's centre. Off a dungeon floor (no
// footing), off a pit, or with no ground left anywhere it moves no one.
func setDownOffPit(entities []*ecs.Entity, delver *ecs.Entity, ground BookGround) {
	if ground.Footing == nil || !InPlay(delver) {
		return
	}
	at, ok := bodyCentre(delver)
	if !ok || !overShutPit(entities, at.X, at.Y) {
		return
	}
	cell, ok := ground.Footing.Nearest(at.X, at.Y)
	if !ok {
		slog.Warn("Afloat ended over a pit with no walkable cell to set the delver down on", "entity_id", delver.ID)
		return
	}
	x, y := ground.Footing.Centre(cell)
	pull(delver, x, y, ground.EndCharge)
}

// overShutPit is whether (x, y) lies inside a shut pit barrier's rect.
func overShutPit(entities []*ecs.Entity, x, y float64) bool {
	for _, e := range entities {
		if !isPit(e) {
			continue
		}
		b, ok := blockerOf(e, ecs.ComponentTypeDoor)
		if !ok || b.open() {
			continue
		}
		if x0, y0, x1, y1 := extent(b); x >= x0 && x < x1 && y >= y0 && y < y1 {
			return true
		}
	}
	return false
}
