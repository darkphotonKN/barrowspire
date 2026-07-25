package dto

import (
	"time"

	"github.com/google/uuid"
)

// NOTE: to juniors learning, db struct TAGS are fine here
// because this read side doesnt load through the domain model.
// The shape should also be structured for the client, not match
// the table and later re-mapped.
type AccountDetails struct {
	ID            uuid.UUID `db:"account_id"`
	MemberID      uuid.UUID `db:"member_id"`
	Gold          int       `db:"gold"`
	HeldGold      int       `db:"held_gold"`
	AvailableGold int       `db:"available_gold"`
	CreatedAt     time.Time `db:"created_at"`
}
