package cursor

import (
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// type helper for cursor pagination
// a cursor's values that are passed into the constructor births a
// cursor int the correct format for usage, encode method helps encode
// it into base64 safe for url transport with the added contractual
// safety that hints at the client not to tamper with it.
// decode is separate package level helper that helps with

type Cursor struct {
	ID        uuid.UUID
	CreatedAt time.Time
}

var (
	ErrInvalidUUID   = errors.New("invalid uuid")
	ErrInvalidDate   = errors.New("invalid date")
	ErrInvalidCursor = errors.New("invalid cursor")
)

// encodes the cursor into base64
// no pointer receiver as theres no mutation and cursor struct size is small
func (c Cursor) Encode() string {
	cursorBytes := []byte(c.stringForm())
	return base64.RawURLEncoding.EncodeToString(cursorBytes)
}

// helper to represent the cursor in string format
func (c Cursor) stringForm() string {
	return c.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + c.ID.String()
}

// decodes a base64 cursor back to the cursor form
func Decode(cursorStr string) (*Cursor, error) {
	// validation to prevent errors
	if cursorStr == "" {
		return nil, nil
	}

	cursorBuffer, err := base64.RawURLEncoding.DecodeString(cursorStr)
	if err != nil {
		return nil, ErrInvalidCursor
	}

	s := string(cursorBuffer)

	parts := strings.Split(s, "|")

	// hard check length first
	if len(parts) != 2 {
		return nil, ErrInvalidCursor
	}

	// validate and parse the first part back to time.Time
	date, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return nil, ErrInvalidDate
	}

	// validate and parse the second part back to uuid
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return nil, ErrInvalidUUID
	}

	return &Cursor{
		ID:        id,
		CreatedAt: date,
	}, nil
}
