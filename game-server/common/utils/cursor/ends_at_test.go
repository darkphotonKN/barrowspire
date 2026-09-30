package cursor_test

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// EndsAt is the position in a read ordered by (ends_at, id). It must round-trip
// the same way Cursor does, so a page boundary never drifts between hops.
func TestEndsAtRoundTripPreservesTheSortKey(t *testing.T) {
	id := uuid.New()
	endsAt := time.Date(2026, 10, 1, 18, 0, 0, 123456789, time.FixedZone("WIB", 7*60*60))

	got, err := cursor.DecodeEndsAt(cursor.EndsAt{ID: id, EndsAt: endsAt}.Encode())

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, id, got.ID)
	assert.True(t, endsAt.Equal(got.EndsAt), "want %s, got %s", endsAt, got.EndsAt)
	assert.Equal(t, time.UTC, got.EndsAt.Location(), "positions come back in UTC")
}

func TestDecodeEndsAtTreatsTheEmptyStringAsNoCursor(t *testing.T) {
	got, err := cursor.DecodeEndsAt("")

	assert.NoError(t, err)
	assert.Nil(t, got)
}

// A malformed position is refused with the same sentinels Decode uses, so an
// adapter maps both cursor shapes with one rule.
func TestDecodeEndsAtRejectsMalformedCursors(t *testing.T) {
	tests := []struct {
		name    string
		encoded string
		wantErr error
	}{
		{name: "not base64", encoded: "%%not-a-cursor%%", wantErr: cursor.ErrInvalidCursor},
		{name: "no separator", encoded: encodeRaw(t, "2026-10-01T18:00:00Z"), wantErr: cursor.ErrInvalidCursor},
		{name: "date half is not a timestamp", encoded: encodeRaw(t, "soon|"+uuid.NewString()), wantErr: cursor.ErrInvalidDate},
		{name: "id half is not a uuid", encoded: encodeRaw(t, "2026-10-01T18:00:00Z|nope"), wantErr: cursor.ErrInvalidUUID},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := cursor.DecodeEndsAt(tt.encoded)

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Nil(t, got, "a rejected cursor must not be returned half-built")
		})
	}
}
