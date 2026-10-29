// Package levelgen turns a seed and a few parameters into a level layout: a
// branching trail carved out of a solid grid, with a clearing at every dead end
// and the remaining mass merged into wall rects.
//
// It is pure: no clock, no global random source, no environment, no files and no
// game packages. The same parameters and seed always return the same layout.
package levelgen

import (
	"errors"
	"fmt"
)

// ErrInvalidParams is returned, wrapped, when parameters are out of range.
var ErrInvalidParams = errors.New("levelgen: invalid params")

// Side names the map edge the trail's mouth opens on.
type Side string

const (
	SideNorth Side = "north"
	SideEast  Side = "east"
	SideSouth Side = "south"
	SideWest  Side = "west"
)

// IntRange is an inclusive [Min, Max] range.
type IntRange struct {
	Min, Max int
}

// Params shape a layout. Sizes are in cells unless named otherwise.
type Params struct {
	// CellSize is one cell's edge in world px.
	CellSize float64
	// Cols and Rows are the map size in cells, border included.
	Cols, Rows int
	// Entrance is the side the mouth opens on; the main trail walks away from it.
	Entrance Side
	// TrailWidth is how many cells wide every trail is carved.
	TrailWidth int
	// SpanShare is the share (0, 1] of the map's span along the walk axis the
	// main trail's centre line must cover, measured from the entrance edge.
	SpanShare float64
	// TurnChance is the chance [0, 1] that a step prefers a sideways turn.
	TurnChance float64
	// Branches is how many side branches an attempt tries to grow (forks count).
	Branches IntRange
	// BranchSteps is how many trail steps a branch tries to walk.
	BranchSteps IntRange
	// MaxBranchDepth caps forking: a branch off the main trail is depth 1, a
	// fork off that branch depth 2.
	MaxBranchDepth int
	// ClearingRadius is a clearing's radius in cells from the dead end's centre.
	ClearingRadius int
	// Gap is the minimum cells of wall between trail segments that are not joined.
	Gap int
	// Border is the solid wall thickness on every side (the mouth crosses it).
	Border int
	// WallBudget is the most wall rects a layout may have.
	WallBudget int
	// RetryLimit is how many retries follow a failed first attempt.
	RetryLimit int
}

// Validate reports whether p is in range, wrapping ErrInvalidParams if not.
func (p Params) Validate() error {
	invalid := func(format string, args ...any) error {
		return fmt.Errorf("%w: %s", ErrInvalidParams, fmt.Sprintf(format, args...))
	}
	switch {
	case !(p.CellSize > 0):
		return invalid("cell size %v must be positive", p.CellSize)
	case p.Cols <= 0 || p.Rows <= 0:
		return invalid("map size %dx%d must be positive", p.Cols, p.Rows)
	case !p.Entrance.valid():
		return invalid("entrance side %q is not north, east, south or west", p.Entrance)
	case p.TrailWidth <= 0:
		return invalid("trail width %d must be positive", p.TrailWidth)
	case p.Gap <= 0:
		return invalid("gap %d must be positive", p.Gap)
	case p.Border <= 0:
		return invalid("border %d must be positive", p.Border)
	case p.TrailWidth+2*p.Border > p.Cols || p.TrailWidth+2*p.Border > p.Rows:
		return invalid("trail width %d with border %d does not fit a %dx%d map",
			p.TrailWidth, p.Border, p.Cols, p.Rows)
	case !(p.SpanShare > 0 && p.SpanShare <= 1):
		return invalid("span share %v must be in (0, 1]", p.SpanShare)
	case !(p.TurnChance >= 0 && p.TurnChance <= 1):
		return invalid("turn chance %v must be in [0, 1]", p.TurnChance)
	case p.Branches.Min < 0 || p.Branches.Min > p.Branches.Max:
		return invalid("branch range %d..%d must be non-negative with min <= max",
			p.Branches.Min, p.Branches.Max)
	case p.BranchSteps.Min < 1 || p.BranchSteps.Min > p.BranchSteps.Max:
		return invalid("branch steps %d..%d must be at least 1 with min <= max",
			p.BranchSteps.Min, p.BranchSteps.Max)
	case p.Branches.Max > 0 && p.MaxBranchDepth < 1:
		return invalid("max branch depth %d must be at least 1 when branches are allowed",
			p.MaxBranchDepth)
	case 2*p.ClearingRadius <= p.TrailWidth:
		return invalid("clearing radius %d must be wider than half the trail width %d",
			p.ClearingRadius, p.TrailWidth)
	case p.WallBudget <= 0:
		return invalid("wall budget %d must be positive", p.WallBudget)
	case p.RetryLimit < 0:
		return invalid("retry limit %d must not be negative", p.RetryLimit)
	}
	return nil
}

func (s Side) valid() bool {
	switch s {
	case SideNorth, SideEast, SideSouth, SideWest:
		return true
	}
	return false
}
