package levelgen

import "testing"

// The property test only means something if validate rejects broken layouts.
func TestValidate_BrokenLayout_ReturnsError(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(p *Params, l *Layout)
	}{
		{"missing wall rect", func(_ *Params, l *Layout) { l.Walls = l.Walls[1:] }},
		{"overlapping wall rects", func(_ *Params, l *Layout) { l.Walls = append(l.Walls, l.Walls[0]) }},
		{"wall over open ground", func(_ *Params, l *Layout) {
			o := l.Open[len(l.Open)/2]
			l.Walls = append(l.Walls, Rect{X: o.X - 40, Y: o.Y - 40, W: 80, H: 80})
		}},
		{"over wall budget", func(p *Params, l *Layout) { p.WallBudget = len(l.Walls) - 1 }},
		{"open border outside the mouth", func(_ *Params, l *Layout) { l.Open = append(l.Open, Point{X: 40, Y: 40}) }},
		{"dead end missing", func(_ *Params, l *Layout) { l.DeadEnds = l.DeadEnds[1:] }},
		{"branch deeper than allowed", func(p *Params, _ *Layout) { p.MaxBranchDepth = 0 }},
		{"too few branches", func(_ *Params, l *Layout) { l.Trails, l.DeadEnds = l.Trails[:1], l.DeadEnds[:1] }},
		{"main trail short of the span", func(p *Params, _ *Layout) { p.SpanShare = 1 }},
		{"bounds mismatch", func(_ *Params, l *Layout) { l.Bounds.W++ }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := ForestParams
			l, err := Generate(p, 42)
			if err != nil {
				t.Fatalf("Generate() error = %v", err)
			}

			tt.mutate(&p, &l)

			if err := validate(p, l); err == nil {
				t.Fatal("validate() = nil, want an error")
			}
		})
	}
}
