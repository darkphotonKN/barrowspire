package levelgen

import (
	"errors"
	"math"
	"testing"
)

func TestValidateParams_ForestParams_IsValid(t *testing.T) {
	if err := ForestParams.Validate(); err != nil {
		t.Fatalf("ForestParams.Validate() = %v, want nil", err)
	}
}

func TestValidateParams_OutOfRange_ReturnsError(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(p *Params)
	}{
		{"zero cell size", func(p *Params) { p.CellSize = 0 }},
		{"negative cell size", func(p *Params) { p.CellSize = -80 }},
		{"NaN cell size", func(p *Params) { p.CellSize = math.NaN() }},
		{"zero cols", func(p *Params) { p.Cols = 0 }},
		{"negative rows", func(p *Params) { p.Rows = -1 }},
		{"unknown entrance side", func(p *Params) { p.Entrance = Side("up") }},
		{"zero trail width", func(p *Params) { p.TrailWidth = 0 }},
		{"trail wider than the map", func(p *Params) { p.TrailWidth = 40 }},
		{"trail wider than the map height", func(p *Params) { p.Rows = 3 }},
		{"zero span share", func(p *Params) { p.SpanShare = 0 }},
		{"span share above one", func(p *Params) { p.SpanShare = 1.01 }},
		{"NaN span share", func(p *Params) { p.SpanShare = math.NaN() }},
		{"negative turn chance", func(p *Params) { p.TurnChance = -0.1 }},
		{"turn chance above one", func(p *Params) { p.TurnChance = 1.5 }},
		{"negative branch min", func(p *Params) { p.Branches = IntRange{Min: -1, Max: 3} }},
		{"branch min above max", func(p *Params) { p.Branches = IntRange{Min: 5, Max: 3} }},
		{"zero branch steps", func(p *Params) { p.BranchSteps = IntRange{Min: 0, Max: 3} }},
		{"branch steps min above max", func(p *Params) { p.BranchSteps = IntRange{Min: 4, Max: 2} }},
		{"zero depth with branches", func(p *Params) { p.MaxBranchDepth = 0 }},
		{"clearing no wider than the trail", func(p *Params) { p.ClearingRadius = 1 }},
		{"zero gap", func(p *Params) { p.Gap = 0 }},
		{"zero border", func(p *Params) { p.Border = 0 }},
		{"zero wall budget", func(p *Params) { p.WallBudget = 0 }},
		{"negative retry limit", func(p *Params) { p.RetryLimit = -1 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := ForestParams
			tt.mutate(&p)

			err := p.Validate()
			if !errors.Is(err, ErrInvalidParams) {
				t.Fatalf("Validate() = %v, want ErrInvalidParams", err)
			}

			layout, err := Generate(p, 1)
			if !errors.Is(err, ErrInvalidParams) {
				t.Fatalf("Generate() error = %v, want ErrInvalidParams", err)
			}
			if layout.Walls != nil || layout.Trails != nil || layout.Open != nil {
				t.Fatalf("Generate() walked despite invalid params: %+v", layout)
			}
		})
	}
}
