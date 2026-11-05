package listing

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A new listing must end between one hour and seven days after the seller asks,
// with five minutes of slack either way for clock drift and latency (FS-XEDFF
// Req 1, 3). An end at or before now keeps its own error (Req 4).
func TestCheckDuration_Bounds(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		endsAt  time.Time
		wantErr error
	}{
		{"shortest allowed (1h - 5m)", now.Add(55 * time.Minute), nil},
		{"one hour", now.Add(time.Hour), nil},
		{"seven days", now.Add(7 * 24 * time.Hour), nil},
		{"longest allowed (7d + 5m)", now.Add(7*24*time.Hour + 5*time.Minute), nil},
		{"one second too soon", now.Add(54*time.Minute + 59*time.Second), ErrListingDurationOutOfRange},
		{"one second too long", now.Add(7*24*time.Hour + 5*time.Minute + time.Second), ErrListingDurationOutOfRange},
		{"decades away", now.AddDate(30, 0, 0), ErrListingDurationOutOfRange},
		{"one second ahead", now.Add(time.Second), ErrListingDurationOutOfRange},
		{"ends now", now, ErrInvalidEndTime},
		{"ended an hour ago", now.Add(-time.Hour), ErrInvalidEndTime},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CheckDuration(now, tt.endsAt)

			if tt.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			assert.ErrorIs(t, err, tt.wantErr)
		})
	}
}

// The bound belongs to the seller's request, not to the listing's birth: the
// listing is born when ItemReserved is consumed, possibly minutes later, and a
// late event must not fail the one-hour minimum (FS-XEDFF Req 2).
func TestNewListing_DoesNotApplyTheDurationBound(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name   string
		endsAt time.Time
	}{
		{"thirty minutes ahead", now.Add(30 * time.Minute)},
		{"beyond seven days", now.Add(8 * 24 * time.Hour)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewListing(uuid.New(), uuid.New(), uuid.New(), 100, nil, now, tt.endsAt)

			require.NoError(t, err)
		})
	}
}
