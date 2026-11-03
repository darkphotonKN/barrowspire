package game

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Release lets go an escaped delver only, and keeps their body: the run's end still settles them.
// Depart still refuses an escaped delver, so the release is no leave. FS-QPDKN §Requirements 14,
// 29. I-QPDKN-9.
func TestRelease_EscapedOnly(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(t *testing.T, g geared)
		wantErr error
	}{
		{"escaped", func(t *testing.T, g geared) { g.escape(t) }, nil},
		{"dead", func(t *testing.T, g geared) { g.die(t) }, ErrNotEscaped},
		{"in play", func(t *testing.T, g geared) {}, ErrStillInPlay},
		{"no body here", func(t *testing.T, g geared) { g.s.RemovePlayer(g.playerID.String()) }, ErrNotInThisWorld},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := equipRun(t, nil)
			g := gearedDelver(t, s)
			tt.resolve(t, g)

			err := s.Release(g.playerID)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				assert.NotContains(t, s.departed, g.playerID, "a refused release departs nobody")
				return
			}
			require.NoError(t, err)
			assert.True(t, s.HasPlayer(g.playerID), "the body stays for the run's settlement")
			assert.NotContains(t, s.recipientsLocked(), g.playerID, "and the run no longer speaks to them")
		})
	}
}

// An escaped delver still can't leave on their own: Depart refuses them as before, and Escaped
// tells them apart from a dead delver. FS-QPDKN §Requirements 14, 29.
func TestDepart_StillRefusesTheEscaped(t *testing.T) {
	s, _ := equipRun(t, nil)
	escaped := gearedDelver(t, s)
	escaped.escape(t)
	dead := gearedDelver(t, s)
	dead.die(t)

	assert.ErrorIs(t, s.Depart(escaped.playerID), ErrEscapedWaits)
	assert.True(t, s.Escaped(escaped.playerID))
	assert.False(t, s.Escaped(dead.playerID))
	require.NoError(t, s.Depart(dead.playerID), "a dead delver still leaves")
}
