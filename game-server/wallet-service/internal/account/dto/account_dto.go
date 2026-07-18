package dto

import (
	"time"

	"github.com/google/uuid"
)

// NOTE: to juniors learning, db struct TAGS are fine here
// because this read side doesnt load through the domain model.
// The shape should also be structured for the client, not match
// the table and later re-mapped.
type AccountDetailsDTO struct {
	ID        uuid.UUID `db:"id"`
	MemberID  uuid.UUID `db:"member_id"`
	Gold      int       `db:"gold"`
	CreatedAt time.Time `db:"created_at"`
}
