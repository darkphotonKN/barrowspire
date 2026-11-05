package cursor_test

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ReservedAt is the position in a read ordered by (reserved_at, id). It must
// round-trip to the microsecond Postgres stores, so a page boundary never drifts.
func TestReservedAtRoundTripPreservesTheSortKey(t *testing.T) {
	id := uuid.New()
	reservedAt := time.Date(2026, 11, 5, 9, 30, 0, 123456000, time.FixedZone("CST", 8*60*60))

	got, err := cursor.DecodeReservedAt(cursor.ReservedAt{ID: id, ReservedAt: reservedAt}.Encode())

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, id, got.ID)
	assert.True(t, reservedAt.Equal(got.ReservedAt), "want %s, got %s", reservedAt, got.ReservedAt)
	assert.Equal(t, time.UTC, got.ReservedAt.Location(), "positions come back in UTC")
}

func TestDecodeReservedAtTreatsTheEmptyStringAsNoCursor(t *testing.T) {
	got, err := cursor.DecodeReservedAt("")

	assert.NoError(t, err)
	assert.Nil(t, got)
}

// A malformed position is refused with the same sentinels the other shapes use.
func TestDecodeReservedAtRejectsMalformedCursors(t *testing.T) {
	tests := []struct {
		name    string
		encoded string
		wantErr error
	}{
		{name: "not base64", encoded: "%%not-a-cursor%%", wantErr: cursor.ErrInvalidCursor},
		{name: "date half is not a timestamp", encoded: encodeRaw(t, "soon|"+uuid.NewString()), wantErr: cursor.ErrInvalidDate},
		{name: "id half is not a uuid", encoded: encodeRaw(t, "2026-11-05T09:30:00Z|nope"), wantErr: cursor.ErrInvalidUUID},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := cursor.DecodeReservedAt(tt.encoded)

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Nil(t, got, "a rejected cursor must not be returned half-built")
		})
	}
}
