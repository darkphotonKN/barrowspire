package cursor_test

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// encode is the happy path: a cursor built as a plain value, encoded. There is
// no constructor by design — the produce side builds one from a row it just
// read, so there is nothing to validate that the database has not already.
func encode(t *testing.T, id uuid.UUID, createdAt time.Time) string {
	t.Helper()
	return cursor.Cursor{ID: id, CreatedAt: createdAt}.Encode()
}

// encodeRaw builds the wire form of an arbitrary payload without going through
// Encode, so the decode tests can pose malformed input the encoder would never
// produce.
func encodeRaw(t *testing.T, payload string) string {
	t.Helper()
	return base64.RawURLEncoding.EncodeToString([]byte(payload))
}

// ========================= ROUND TRIP  =========================

// The contract that matters: whatever a page hands out, the next request hands
// back. Every case here goes out through Encode and comes home through Decode.
func TestEncodeDecodeRoundTripPreservesTheSortKey(t *testing.T) {
	tests := []struct {
		name      string
		createdAt time.Time
	}{
		{
			name:      "whole second",
			createdAt: time.Date(2026, 8, 25, 14, 30, 0, 0, time.UTC),
		},
		{
			name:      "nanosecond precision survives",
			createdAt: time.Date(2026, 8, 25, 14, 30, 0, 123456789, time.UTC),
		},
		{
			name:      "trailing zeros in the fraction survive",
			createdAt: time.Date(2026, 8, 25, 14, 30, 0, 100000000, time.UTC),
		},
		{
			name:      "single nanosecond",
			createdAt: time.Date(2026, 8, 25, 14, 30, 0, 1, time.UTC),
		},
		{
			name:      "the zero time",
			createdAt: time.Time{},
		},
		{
			name:      "a far-future instant",
			createdAt: time.Date(9999, 12, 31, 23, 59, 59, 999999999, time.UTC),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := uuid.New()

			got, err := cursor.Decode(encode(t, id, tt.createdAt))

			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Equal(t, id, got.ID)
			assert.True(t, tt.createdAt.Equal(got.CreatedAt),
				"want %s, got %s", tt.createdAt, got.CreatedAt)
		})
	}
}

// A caller's time.Now() carries a monotonic reading and a local zone; the row it
// describes does not. Both are stripped on the way out, so the decoded position
// must compare equal by instant even though it is no longer the same struct.
func TestRoundTripNormalisesZoneAndMonotonicClock(t *testing.T) {
	jakarta := time.FixedZone("WIB", 7*60*60)
	local := time.Date(2026, 8, 25, 21, 30, 0, 555000000, jakarta)
	id := uuid.New()

	got, err := cursor.Decode(encode(t, id, local))

	require.NoError(t, err)
	assert.True(t, local.Equal(got.CreatedAt), "the instant must survive the zone change")
	assert.Equal(t, time.UTC, got.CreatedAt.Location(), "positions come back in UTC")
}

// ADR-0012 puts cursors in URLs and in logs. RawURLEncoding is what makes that
// safe: no padding to escape, no '+' or '/' to mangle in a query string.
func TestEncodeIsURLSafeAndUnpadded(t *testing.T) {
	// a timestamp and id chosen only to exercise a full alphabet of output bytes
	encoded := encode(t, uuid.MustParse("ffffffff-ffff-4fff-bfff-ffffffffffff"),
		time.Date(2026, 8, 25, 14, 30, 0, 987654321, time.UTC))

	assert.NotContains(t, encoded, "=", "padding would need escaping in a URL")
	assert.NotContains(t, encoded, "+")
	assert.NotContains(t, encoded, "/")

	_, err := base64.RawURLEncoding.DecodeString(encoded)
	assert.NoError(t, err, "output must be decodable as raw url base64")
}

// Re-encoding a decoded cursor must yield the same string, or a client paging
// forward would see the boundary drift under it across hops.
func TestEncodeIsStableAcrossADecode(t *testing.T) {
	first := encode(t, uuid.New(), time.Date(2026, 8, 25, 14, 30, 0, 42, time.UTC))

	decoded, err := cursor.Decode(first)
	require.NoError(t, err)

	assert.Equal(t, first, decoded.Encode())
}

// With the constructor gone, Cursor is a bare value type and the zero value is
// reachable by anyone who writes Cursor{}. It encodes, and it decodes back to
// itself, so a Cursor never built from a row still produces a well-formed
// position of uuid.Nil at year zero.
//
// REVIEW: nothing in the package now rejects the nil UUID on either side. If
// that check is wanted back, Decode is the place for it — see
// TestDecodeAcceptsTheNilUUID below.
func TestZeroValueCursorEncodesAndRoundTrips(t *testing.T) {
	got, err := cursor.Decode(cursor.Cursor{}.Encode())

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, uuid.Nil, got.ID)
	assert.True(t, got.CreatedAt.IsZero())
}

// ========================= DECODE FAILURES  =========================

// The absent cursor means "start at page one", which is not an error. It is
// signalled by a nil cursor and a nil error, and that nil is the same value the
// read port already takes to mean "from the beginning".
func TestDecodeTreatsTheEmptyStringAsNoCursor(t *testing.T) {
	got, err := cursor.Decode("")

	assert.NoError(t, err)
	assert.Nil(t, got)
}

// ADR-0012: an undecodable cursor is a 422, never a silent reset to page one.
// Every case below must therefore surface an error and no cursor. The sentinel
// matters as much as the error — the ledger handler's mapError switches on
// these, so anything that escapes unwrapped becomes a 500.
func TestDecodeRejectsMalformedCursors(t *testing.T) {
	validID := uuid.New().String()
	validDate := "2026-08-25T14:30:00Z"

	tests := []struct {
		name    string
		encoded string
		wantErr error
	}{
		{
			name:    "not base64 at all",
			encoded: "!!!not-base64!!!",
			wantErr: cursor.ErrInvalidCursor,
		},
		{
			name:    "standard base64 padding",
			encoded: "YWJjZA==",
			wantErr: cursor.ErrInvalidCursor,
		},
		{
			name:    "standard base64 alphabet",
			encoded: "++//",
			wantErr: cursor.ErrInvalidCursor,
		},
		{
			name:    "truncated mid-character",
			encoded: encode(t, uuid.New(), time.Now())[:1],
			wantErr: cursor.ErrInvalidCursor,
		},
		{
			name:    "no separator",
			encoded: encodeRaw(t, validDate+validID),
			wantErr: cursor.ErrInvalidCursor,
		},
		{
			name:    "an extra separator",
			encoded: encodeRaw(t, validDate+"|"+validID+"|extra"),
			wantErr: cursor.ErrInvalidCursor,
		},
		{
			// two empty halves still satisfy the arity check, so this falls
			// through to the date parse rather than the shape check
			name:    "separator only",
			encoded: encodeRaw(t, "|"),
			wantErr: cursor.ErrInvalidDate,
		},
		{
			name:    "date half is not a timestamp",
			encoded: encodeRaw(t, "yesterday|"+validID),
			wantErr: cursor.ErrInvalidDate,
		},
		{
			name:    "date half is empty",
			encoded: encodeRaw(t, "|"+validID),
			wantErr: cursor.ErrInvalidDate,
		},
		{
			name:    "date half is a bare date",
			encoded: encodeRaw(t, "2026-08-25|"+validID),
			wantErr: cursor.ErrInvalidDate,
		},
		{
			name:    "the halves are swapped",
			encoded: encodeRaw(t, validID+"|"+validDate),
			wantErr: cursor.ErrInvalidDate,
		},
		{
			name:    "id half is not a uuid",
			encoded: encodeRaw(t, validDate+"|not-a-uuid"),
			wantErr: cursor.ErrInvalidUUID,
		},
		{
			name:    "id half is empty",
			encoded: encodeRaw(t, validDate+"|"),
			wantErr: cursor.ErrInvalidUUID,
		},
		{
			name:    "id half is truncated",
			encoded: encodeRaw(t, validDate+"|"+validID[:len(validID)-1]),
			wantErr: cursor.ErrInvalidUUID,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := cursor.Decode(tt.encoded)

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Nil(t, got, "a rejected cursor must not be returned half-built")
		})
	}
}

// REVIEW: uuid.Parse is happy with the all-zero form, so a client can hand back
// a position no row occupies and Decode will honour it. Harmless against a
// keyset predicate, but it is the one validation the removed constructor used
// to carry, and Decode is now the only side that faces untrusted input.
// Pinning the current accepting behaviour, not endorsing it.
func TestDecodeAcceptsTheNilUUID(t *testing.T) {
	encoded := encodeRaw(t, "2026-08-25T14:30:00Z|"+uuid.Nil.String())

	got, err := cursor.Decode(encoded)

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, uuid.Nil, got.ID)
}

// The payload is split on '|', and RFC3339Nano offsets contain none, so a zoned
// timestamp on the wire still splits into exactly two halves and decodes to the
// instant it names.
func TestDecodeAcceptsAZonedTimestampOnTheWire(t *testing.T) {
	id := uuid.New()
	encoded := encodeRaw(t, "2026-08-25T21:30:00+07:00|"+id.String())

	got, err := cursor.Decode(encoded)

	require.NoError(t, err)
	assert.Equal(t, id, got.ID)
	assert.True(t, time.Date(2026, 8, 25, 14, 30, 0, 0, time.UTC).Equal(got.CreatedAt))
}

// Cursors are held by clients for an unbounded interval and come back
// unvalidated, so decoding must survive hostile input rather than panic.
func TestDecodeSurvivesHostileInput(t *testing.T) {
	tests := []struct {
		name    string
		encoded string
	}{
		{name: "nul bytes", encoded: encodeRaw(t, "\x00|\x00")},
		{name: "unicode payload", encoded: encodeRaw(t, "２０２６年|識別子")},
		{name: "newlines", encoded: encodeRaw(t, "2026-08-25T14:30:00Z\n|\n"+uuid.New().String())},
		{name: "a very long payload", encoded: encodeRaw(t, strings.Repeat("a", 100_000))},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := cursor.Decode(tt.encoded)

			assert.Error(t, err)
			assert.Nil(t, got)
		})
	}
}
