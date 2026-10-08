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
	return encodePosition(c.CreatedAt, c.ID)
}

// decodes a base64 cursor back to the cursor form
func Decode(cursorStr string) (*Cursor, error) {
	// validation to prevent errors
	if cursorStr == "" {
		return nil, nil
	}

	date, id, err := decodePosition(cursorStr)
	if err != nil {
		return nil, err
	}

	return &Cursor{
		ID:        id,
		CreatedAt: date,
	}, nil
}

// encodePosition is the one wire format every cursor shape shares (ADR-0012):
// base64url of `time|id`. Which column the time came from is the shape's
// business, never the wire's.
func encodePosition(at time.Time, id uuid.UUID) string {
	return base64.RawURLEncoding.EncodeToString([]byte(at.UTC().Format(time.RFC3339Nano) + "|" + id.String()))
}

// decodePosition reverses encodePosition. Every failure is one of the package
// sentinels, so an adapter maps every cursor shape with the same rule.
func decodePosition(cursorStr string) (time.Time, uuid.UUID, error) {

	cursorBuffer, err := base64.RawURLEncoding.DecodeString(cursorStr)
	if err != nil {
		return time.Time{}, uuid.Nil, ErrInvalidCursor
	}

	s := string(cursorBuffer)

	parts := strings.Split(s, "|")

	// hard check length first
	if len(parts) != 2 {
		return time.Time{}, uuid.Nil, ErrInvalidCursor
	}

	// validate and parse the first part back to time.Time
	date, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, uuid.Nil, ErrInvalidDate
	}

	// validate and parse the second part back to uuid
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return time.Time{}, uuid.Nil, ErrInvalidUUID
	}

	return date, id, nil
}
