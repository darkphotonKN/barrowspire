package levelgen

// Point is a position in world px.
type Point struct {
	X, Y float64
}

// Rect is an axis-aligned rect in world px with a top-left origin, the same
// convention as game.WallConfig and game.PlaceArea.
type Rect struct {
	X, Y, W, H float64
}

// Size is a width and height in world px.
type Size struct {
	W, H float64
}

// Entrance is where the trail meets the map edge.
type Entrance struct {
	// At is the centre of the mouth's opening in the border.
	At   Point
	Side Side
}

// Trail is one trail in walk order.
type Trail struct {
	// Points are the centres of the trail's steps, in walk order. A branch's
	// points start after the cell it sprouted from.
	Points []Point
	// Parent is the index of the trail this one sprouted from; -1 for the main trail.
	Parent int
}

// DeadEnd is the clearing a trail ends in.
type DeadEnd struct {
	Center Point
	// Radius is the clearing's radius in px from Center.
	Radius float64
	// Trail is the index of the trail this dead end ends.
	Trail int
	Main  bool
}

// Layout is the generator's output. Its slices are in a fixed order: Walls by
// top then left, Trails main first, DeadEnds by trail, Open row by row.
type Layout struct {
	Bounds   Size
	Walls    []Rect
	Entrance Entrance
	Trails   []Trail
	DeadEnds []DeadEnd
	// Open holds the centre of every carved cell.
	Open []Point
	// Seed is the seed Generate was given; Attempt is the retry that produced
	// the layout (0 for the first attempt).
	Seed    uint64
	Attempt int
}
