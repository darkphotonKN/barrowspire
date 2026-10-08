package cursor

import (
	"time"

	"github.com/google/uuid"
)

// EndsAt is the position in a read ordered by (ends_at, id) — soonest-ending
// first, as marketplace's browse is.
//
// Its own shape rather than a Cursor whose CreatedAt quietly holds an end time:
// the field name is what the query's keyset predicate reads, and a CreatedAt that
// means ends_at is a bug waiting for the next reader. The wire format is the one
// Cursor uses (ADR-0012), so it carries a position and nothing else.
type EndsAt struct {
	ID     uuid.UUID
	EndsAt time.Time
}

// Encode renders the position as an opaque, URL-safe string.
func (c EndsAt) Encode() string {
	return encodePosition(c.EndsAt, c.ID)
}

// DecodeEndsAt reverses Encode. The empty string is "no cursor" — the first
// page — and answers nil with no error, the same as Decode.
func DecodeEndsAt(cursorStr string) (*EndsAt, error) {
	if cursorStr == "" {
		return nil, nil
	}

	endsAt, id, err := decodePosition(cursorStr)
	if err != nil {
		return nil, err
	}

	return &EndsAt{ID: id, EndsAt: endsAt}, nil
}
