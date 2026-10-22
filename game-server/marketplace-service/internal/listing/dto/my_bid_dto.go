package dto

import (
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// MyBid is one of a member's own bids with a summary of the listing it is on,
// as the listing stands now (FS-EYQ8K §Requirements 6).
type MyBid struct {
	ID        uuid.UUID         `db:"id"`
	ListingID uuid.UUID         `db:"listing_id"`
	Amount    int               `db:"amount"`
	Status    listing.BidStatus `db:"status"`
	PlacedAt  time.Time         `db:"created_at"`

	// selected as "listing.<column>"
	Listing MyBidListing `db:"listing"`
}

// MyBidListing is the listing summary a MyBid carries: where the auction
// stands, not who is selling it.
type MyBidListing struct {
	Status      listing.ListingStatus `db:"status"`
	EndsAt      time.Time             `db:"ends_at"`
	ItemID      uuid.UUID             `db:"item_id"`
	BuyoutPrice *int                  `db:"buyout_price"`

	// the same facts, from the same SQL, as every listing read
	PriceFacts
}

// EndedAt applies ListingDetails.EndedAt's rule to the summary.
func (l MyBidListing) EndedAt(now time.Time) bool {
	return endedAt(l.Status, l.EndsAt, now)
}

// MyBidsPage is one page of a member's bids, newest placed first. NextCursor is
// empty on the last page.
type MyBidsPage struct {
	Bids       []MyBid
	NextCursor string
}
