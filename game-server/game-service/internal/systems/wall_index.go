package systems

import (
	"cmp"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
	The static wall index: a uniform grid over a floor's wall and door rects, so
	a mover tests only the rects near its swept box rather than every wall on the
	floor (FS-KE075 §E Requirements 28–29, the "Spatial index for walls and
	doors" FS-QG1HR parked).

	Walls and doors never move during a floor, so their rects are bucketed once.
	A door does open and close: it keeps its bucket, and whether it is open is read
	from its entity on every test, as the full scan read it.

	Same answers as the full scan:
	  - a swept test keeps the smallest time of contact, and a rect outside the
	    swept box can only answer 1, so any superset of the rects in the box
	    gives the same minimum;
	  - depenetration pushes the body out of each rect in turn, so order counts.
	    Rects are held in one fixed order (walls, then doors, each by place) and
	    the next rect applied is the first after the last one that moves the
	    body from where it now stands. A rect that would not move it is a no-op
	    in the scan too, and one that would move it overlaps the body, so it is
	    in the body's buckets.
	The scan this replaced ranged over Go maps, whose order is unspecified and
	randomised (https://go.dev/ref/spec#For_statements); the fixed order is one it
	could take.
*/

// wallBucketSize is a bucket's side, px: a body and a step fit in one or two.
const wallBucketSize = 64.0

// wallQueryPad widens every query by a pixel, so a rect float rounding puts a
// hair outside a box is still tested; tested, it answers as the scan does.
const wallQueryPad = 1.0

// wallTests is what a mover's step asks of the walls and closed doors around
// it: how far it may sweep along each axis, and where it stands once pushed out.
type wallTests interface {
	sweepX(x, y, dx float64) float64
	sweepY(x, y, dy float64) float64
	depenetrate(x, y float64) (float64, float64)
}

// blocker is one wall or door rect, by its top-left corner.
type blocker struct {
	x, y, w, h float64
	// a door's entity, read for whether it stands open; nil for a wall
	door *ecs.Entity
}

func (b *blocker) open() bool {
	if b.door == nil {
		return false
	}
	oc, ok := b.door.GetComponent(ecs.ComponentTypeOpenable)
	return ok && oc.(*components.OpenableComponent).IsOpen
}

// blockerOf reads an entity's rect as a wall or as a door; false when it lacks
// the component or a place.
func blockerOf(e *ecs.Entity, kind ecs.ComponentType) (blocker, bool) {
	tc, hasTransform := e.GetComponent(ecs.ComponentTypeTransform)
	c, hasKind := e.GetComponent(kind)
	if !hasTransform || !hasKind {
		return blocker{}, false
	}
	at := tc.(*components.TransformComponent)
	b := blocker{x: at.X, y: at.Y}
	switch rect := c.(type) {
	case *components.WallComponent:
		b.w, b.h = rect.Width, rect.Height
	case *components.DoorComponent:
		b.w, b.h, b.door = rect.Width, rect.Height, e
	default:
		return blocker{}, false
	}
	return b, true
}

// compareBlockers orders rects by place: the fixed order depenetration takes.
func compareBlockers(a, b blocker) int {
	return cmp.Or(cmp.Compare(a.y, b.y), cmp.Compare(a.x, b.x), cmp.Compare(a.h, b.h), cmp.Compare(a.w, b.w))
}

// wallIndex buckets a floor's walls and doors on a uniform grid.
type wallIndex struct {
	// walls, then doors, each by place: the order every test takes
	blockers []blocker
	// which entities it was built from, and how many of each kind
	members      map[uuid.UUID]struct{}
	walls, doors int

	originX, originY float64
	cols, rows       int
	// cols×rows, row-major; each lists blocker indices in ascending order
	buckets [][]int32
}

func newWallIndex(walls, doors []*ecs.Entity) *wallIndex {
	w := &wallIndex{members: make(map[uuid.UUID]struct{}, len(walls)+len(doors))}
	w.walls = w.collect(walls, ecs.ComponentTypeWall)
	w.doors = w.collect(doors, ecs.ComponentTypeDoor)
	if len(w.blockers) == 0 {
		return w
	}

	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for _, b := range w.blockers {
		x0, y0, x1, y1 := extent(b)
		minX, minY, maxX, maxY = min(minX, x0), min(minY, y0), max(maxX, x1), max(maxY, y1)
	}
	w.originX, w.originY = minX, minY
	w.cols = int((maxX-minX)/wallBucketSize) + 1
	w.rows = int((maxY-minY)/wallBucketSize) + 1
	w.buckets = make([][]int32, w.cols*w.rows)

	for i, b := range w.blockers {
		c0, r0, c1, r1, _ := w.span(extent(b))
		for r := r0; r <= r1; r++ {
			for c := c0; c <= c1; c++ {
				w.buckets[r*w.cols+c] = append(w.buckets[r*w.cols+c], int32(i))
			}
		}
	}
	return w
}

// collect adds one kind's rects, by place, and reports how many it took.
func (w *wallIndex) collect(entities []*ecs.Entity, kind ecs.ComponentType) int {
	start := len(w.blockers)
	for _, e := range entities {
		if b, ok := blockerOf(e, kind); ok {
			w.blockers = append(w.blockers, b)
			w.members[e.ID] = struct{}{}
		}
	}
	slices.SortStableFunc(w.blockers[start:], compareBlockers)
	return len(w.blockers) - start
}

// extent is a rect's corners, whichever way its size runs.
func extent(b blocker) (x0, y0, x1, y1 float64) {
	return min(b.x, b.x+b.w), min(b.y, b.y+b.h), max(b.x, b.x+b.w), max(b.y, b.y+b.h)
}

// indexes reports whether the index was built from exactly these walls and doors.
func (w *wallIndex) indexes(walls, doors []*ecs.Entity) bool {
	if len(walls) != w.walls || len(doors) != w.doors {
		return false
	}
	for _, e := range walls {
		if _, ok := w.members[e.ID]; !ok {
			return false
		}
	}
	for _, e := range doors {
		if _, ok := w.members[e.ID]; !ok {
			return false
		}
	}
	return true
}

// span is the buckets a box covers, clamped to the grid; false when it misses
// the grid entirely.
func (w *wallIndex) span(x0, y0, x1, y1 float64) (c0, r0, c1, r1 int, ok bool) {
	if w.cols == 0 {
		return 0, 0, 0, 0, false
	}
	c0 = int(math.Floor((x0 - w.originX) / wallBucketSize))
	c1 = int(math.Floor((x1 - w.originX) / wallBucketSize))
	r0 = int(math.Floor((y0 - w.originY) / wallBucketSize))
	r1 = int(math.Floor((y1 - w.originY) / wallBucketSize))
	if c1 < 0 || r1 < 0 || c0 >= w.cols || r0 >= w.rows {
		return 0, 0, 0, 0, false
	}
	return max(c0, 0), max(r0, 0), min(c1, w.cols-1), min(r1, w.rows-1), true
}

// query is the buckets a body's box covers, padded.
func (w *wallIndex) query(x0, y0, x1, y1 float64) (c0, r0, c1, r1 int, ok bool) {
	return w.span(x0-wallQueryPad, y0-wallQueryPad, x1+wallQueryPad, y1+wallQueryPad)
}

func (w *wallIndex) sweepX(x, y, dx float64) float64 {
	if dx == 0 {
		return 1
	}
	r := constants.PlayerRadius
	c0, r0, c1, r1, ok := w.query(x-r+min(dx, 0), y-r, x+r+max(dx, 0), y+r)
	if !ok {
		return 1
	}
	minT := 1.0
	for row := r0; row <= r1; row++ {
		for _, bucket := range w.buckets[row*w.cols+c0 : row*w.cols+c1+1] {
			for _, i := range bucket {
				b := &w.blockers[i]
				if b.open() {
					continue
				}
				if t := SweptX(x, y, b.x, b.y, b.w, b.h, dx); t < minT {
					minT = t
				}
			}
		}
	}
	return minT
}

func (w *wallIndex) sweepY(x, y, dy float64) float64 {
	if dy == 0 {
		return 1
	}
	r := constants.PlayerRadius
	c0, r0, c1, r1, ok := w.query(x-r, y-r+min(dy, 0), x+r, y+r+max(dy, 0))
	if !ok {
		return 1
	}
	minT := 1.0
	for row := r0; row <= r1; row++ {
		for _, bucket := range w.buckets[row*w.cols+c0 : row*w.cols+c1+1] {
			for _, i := range bucket {
				b := &w.blockers[i]
				if b.open() {
					continue
				}
				if t := SweptY(x, y, b.x, b.y, b.w, b.h, dy); t < minT {
					minT = t
				}
			}
		}
	}
	return minT
}

// depenetrate pushes a body out of the rects it overlaps, one at a time in the
// index's order, as the full scan did.
func (w *wallIndex) depenetrate(x, y float64) (float64, float64) {
	r := constants.PlayerRadius
	last := int32(-1)
	for {
		c0, r0, c1, r1, ok := w.query(x-r, y-r, x+r, y+r)
		if !ok {
			return x, y
		}
		// the first rect after the last applied that moves the body from here
		next, nx, ny := int32(-1), x, y
		for row := r0; row <= r1; row++ {
			for _, bucket := range w.buckets[row*w.cols+c0 : row*w.cols+c1+1] {
				for _, i := range bucket {
					if i <= last {
						continue
					}
					if next >= 0 && i >= next {
						break
					}
					b := &w.blockers[i]
					if b.open() {
						continue
					}
					if px, py := depenetrate(x, y, b.x, b.y, b.w, b.h); px != x || py != y {
						next, nx, ny = i, px, py
						break
					}
				}
			}
		}
		if next < 0 {
			return x, y
		}
		x, y, last = nx, ny, next
	}
}
