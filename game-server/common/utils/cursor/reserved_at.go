package cursor

import (
	"time"

	"github.com/google/uuid"
)

// ReservedAt is the position in a read ordered by (reserved_at, id), oldest
// reservation first, as items' stale-reservation listing is (FS-9BJCP Req 5).
//
// Its own shape for the reason EndsAt and UpdatedAt are: the field name is what
// the query's keyset predicate reads. The wire format is the one Cursor uses
// (ADR-0012), so it carries a position and nothing else.
type ReservedAt struct {
	ID         uuid.UUID
	ReservedAt time.Time
}

// Encode renders the position as an opaque, URL-safe string.
func (c ReservedAt) Encode() string {
	return encodePosition(c.ReservedAt, c.ID)
}

// DecodeReservedAt reverses Encode. The empty string is "no cursor" — the first
// page — and answers nil with no error, the same as Decode.
func DecodeReservedAt(cursorStr string) (*ReservedAt, error) {
	if cursorStr == "" {
		return nil, nil
	}

	reservedAt, id, err := decodePosition(cursorStr)
	if err != nil {
		return nil, err
	}

	return &ReservedAt{ID: id, ReservedAt: reservedAt}, nil
}
