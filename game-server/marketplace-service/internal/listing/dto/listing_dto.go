package dto

import (
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// NOTE: to juniors learning, db struct TAGS are fine here
// because this read side doesnt load through the domain model.
// The shape should also be structured for the client, not match
// the table and later re-mapped.
type ListingDetails struct {
	ID         uuid.UUID             `db:"id"`
	SellerID   uuid.UUID             `db:"seller_id"`
	BuyerID    *uuid.UUID            `db:"buyer_id"`
	ItemID     uuid.UUID             `db:"item_id"`
	StartPrice int                   `db:"start_price"`
	SoldPrice  *int                  `db:"sold_price"`
	Status     listing.ListingStatus `db:"status"`
	EndsAt     time.Time             `db:"ends_at"`
	CreatedAt  time.Time             `db:"created_at"`
	UpdatedAt  time.Time             `db:"updated_at"`
}

// ListingsPage is one page of a seller's listings, newest first. NextCursor is
// empty on the last page.
type ListingsPage struct {
	Listings   []ListingDetails
	NextCursor string
}

// for freeze listing step of settlement saga
type FreezeListingDto struct {
	ListingID uuid.UUID
	ItemID    uuid.UUID
	SellerID  uuid.UUID
	Winner    *FreezeWinner
}

type FreezeWinner struct {
	WinnerBidID    uuid.UUID
	WinnerMemberID uuid.UUID
	Amount         int
}
