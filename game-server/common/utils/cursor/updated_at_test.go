package cursor_test

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// UpdatedAt is the position in a read ordered by (updated_at, id). It must
// round-trip to the microsecond Postgres stores, so a page boundary never drifts.
func TestUpdatedAtRoundTripPreservesTheSortKey(t *testing.T) {
	id := uuid.New()
	updatedAt := time.Date(2026, 11, 5, 9, 30, 0, 123456000, time.FixedZone("CST", 8*60*60))

	got, err := cursor.DecodeUpdatedAt(cursor.UpdatedAt{ID: id, UpdatedAt: updatedAt}.Encode())

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, id, got.ID)
	assert.True(t, updatedAt.Equal(got.UpdatedAt), "want %s, got %s", updatedAt, got.UpdatedAt)
	assert.Equal(t, time.UTC, got.UpdatedAt.Location(), "positions come back in UTC")
}

func TestDecodeUpdatedAtTreatsTheEmptyStringAsNoCursor(t *testing.T) {
	got, err := cursor.DecodeUpdatedAt("")

	assert.NoError(t, err)
	assert.Nil(t, got)
}

// A malformed position is refused with the same sentinels the other shapes use.
func TestDecodeUpdatedAtRejectsMalformedCursors(t *testing.T) {
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
			got, err := cursor.DecodeUpdatedAt(tt.encoded)

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Nil(t, got, "a rejected cursor must not be returned half-built")
		})
	}
}
