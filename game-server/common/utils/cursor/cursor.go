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
	ErrInvalidUUID     = errors.New("invalid uuid")
	ErrInvalidDate     = errors.New("invalid date")
	ErrMalformedCursor = errors.New("malformed cursor")
)

func NewCursor(id uuid.UUID, createdAt time.Time) (*Cursor, error) {

	// helper validation to prevent headaches later
	if id == uuid.Nil {
		return nil, ErrInvalidUUID
	}

	return &Cursor{
		ID:        id,
		CreatedAt: createdAt,
	}, nil
}

// encodes the cursor into base64
func (c *Cursor) Encode() string {
	cursorBytes := []byte(c.StringForm())
	return base64.RawURLEncoding.EncodeToString(cursorBytes)
}

// helper to represent the cursor in string format
func (c *Cursor) StringForm() string {
	return c.ID.String() + "|" + c.CreatedAt.String()
}

// decodes a base64 cursor back to the cursor form
func Decode(cursorStr string) (*Cursor, error) {

	cursorBuffer, err := base64.RawURLEncoding.DecodeString(cursorStr)
	if err != nil {
		return nil, err
	}

	s := string(cursorBuffer)

	parts := strings.Split(s, "|")

	// hard check length first
	if len(parts) != 2 {
		return nil, ErrMalformedCursor
	}

	// validate and parse the first part back to uuid
	id, err := uuid.Parse(parts[0])
	if err != nil {
		return nil, ErrInvalidUUID
	}

	date, err := time.Parse(time.RFC3339Nano, parts[1])
	if err != nil {
		return nil, ErrInvalidDate
	}

	return &Cursor{
		ID:        id,
		CreatedAt: date,
	}, nil
}
