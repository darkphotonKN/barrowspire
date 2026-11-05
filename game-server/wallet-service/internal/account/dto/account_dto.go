package dto

import (
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
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

// StaleReservedHoldsPage is one page of the reservations that outlived the write
// meant to follow them, oldest first (FS-9BJCP Req 6). Next is the position of
// the following page, nil on the last one.
type StaleReservedHoldsPage struct {
	BidIDs []uuid.UUID
	Next   *cursor.Cursor
}
