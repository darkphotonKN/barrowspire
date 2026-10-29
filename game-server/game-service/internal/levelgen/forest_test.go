package levelgen_test

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
)

// An external test package, so the real PlayerRadius can be checked without
// levelgen itself importing anything outside the standard library.
func TestForestParams_TrailFitsTwoBodiesSideBySide(t *testing.T) {
	p := levelgen.ForestParams

	width := float64(p.TrailWidth) * p.CellSize

	if min := 4 * constants.PlayerRadius; width < min {
		t.Fatalf("trail width %v px < 4 x PlayerRadius (%v px)", width, min)
	}
}
