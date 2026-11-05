package cursor

import (
	"time"

	"github.com/google/uuid"
)

// UpdatedAt is the position in a read ordered by (updated_at, id), oldest
// change first, as items' confirmed-reservation listing is.
//
// Its own shape for the reason EndsAt is: the field name is what the query's
// keyset predicate reads. The wire format is the one Cursor uses (ADR-0012), so
// it carries a position and nothing else.
type UpdatedAt struct {
	ID        uuid.UUID
	UpdatedAt time.Time
}

// Encode renders the position as an opaque, URL-safe string.
func (c UpdatedAt) Encode() string {
	return encodePosition(c.UpdatedAt, c.ID)
}

// DecodeUpdatedAt reverses Encode. The empty string is "no cursor" — the first
// page — and answers nil with no error, the same as Decode.
func DecodeUpdatedAt(cursorStr string) (*UpdatedAt, error) {
	if cursorStr == "" {
		return nil, nil
	}

	updatedAt, id, err := decodePosition(cursorStr)
	if err != nil {
		return nil, err
	}

	return &UpdatedAt{ID: id, UpdatedAt: updatedAt}, nil
}
