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
	ID          uuid.UUID             `db:"id"`
	SellerID    uuid.UUID             `db:"seller_id"`
	BuyerID     *uuid.UUID            `db:"buyer_id"`
	ItemID      uuid.UUID             `db:"item_id"`
	StartPrice  int                   `db:"start_price"`
	BuyoutPrice *int                  `db:"buyout_price"`
	SoldPrice   *int                  `db:"sold_price"`
	Status      listing.ListingStatus `db:"status"`
	EndsAt      time.Time             `db:"ends_at"`
	CreatedAt   time.Time             `db:"created_at"`
	UpdatedAt   time.Time             `db:"updated_at"`

	// Filled only by a read that selects query.priceFactsColumns; zero otherwise.
	PriceFacts
}

// PriceFacts are the bid-derived numbers a listing read carries (FS-8EGFA
// §Requirements 5). They are counted in SQL by query.priceFactsJoin, so a page
// costs one query however many bids its listings have.
type PriceFacts struct {
	// BidCount counts bids that are, or were, in the running: WINNING, PENDING
	// and OUTBID. Withdrawn, failed and settled bids are not counted.
	BidCount int `db:"bid_count"`

	// CurrentPrice is the leading bid: the highest WINNING or PENDING amount,
	// nil when nobody leads. An OUTBID bid never leads, so when the leader
	// withdraws the listing has no current price at all.
	CurrentPrice *int `db:"current_price"`
}

// MinimumBid is the least amount the listing would accept from a bid now.
//
// It restates the threshold in listing.PlaceBidWithID, which the aggregate
// applies against findContendingBid (the highest WINNING or PENDING bid): with
// no contender a bid must reach the start price, otherwise it must exceed the
// contender. Withdrawal promotes nobody (WithdrawBid only cancels), so a
// withdrawn leader sends the minimum back to the start price even when an OUTBID
// bid remains. listing_dto_test pins this to the aggregate.
func (l ListingDetails) MinimumBid() int {
	if l.CurrentPrice == nil {
		return l.StartPrice
	}

	return *l.CurrentPrice + 1
}

// EndedAt reports whether the auction has run out but not been settled: still
// ACTIVE in storage, past its end (FS-8EGFA §Requirements 8). Nothing moves a
// listing out of ACTIVE at its end yet, so this is computed at read time.
// AcceptsBidAt refuses a bid on exactly these listings.
func (l ListingDetails) EndedAt(now time.Time) bool {
	return l.Status == listing.StatusActive && !l.EndsAt.After(now)
}

// ListingsPage is one page of listings, in whatever order the read that built
// it pages by. NextCursor is empty on the last page.
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
