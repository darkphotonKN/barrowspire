package game

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// A resolved delver may leave the run early, escaped or dead: an escapee is
// settled the moment they escape, so nothing is left to wait for. Their body
// stays and the run no longer speaks to them. FS-GV8WN §F R16, I-GV8WN-7.
func TestDepart_ResolvedDelver_EscapedOrDead_Leaves(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(t *testing.T, g geared)
		wantErr error
	}{
		{"escaped", func(t *testing.T, g geared) { g.escape(t) }, nil},
		{"dead", func(t *testing.T, g geared) { g.die(t) }, nil},
		{"in play", func(t *testing.T, g geared) {}, ErrStillInPlay},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			g := gearedDelver(t, s)
			tt.resolve(t, g)

			err := s.Depart(g.playerID)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.NotContains(t, s.departed, g.playerID, "a refused leave departs nobody")
				return
			}
			assert.NoError(t, err)
			assert.True(t, s.HasPlayer(g.playerID), "the body stays")
			assert.NotContains(t, s.recipientsLocked(), g.playerID, "and the run no longer speaks to them")
		})
	}
}
