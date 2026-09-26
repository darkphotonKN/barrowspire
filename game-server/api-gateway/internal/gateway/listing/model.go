package listing

import (
	"context"
	"fmt"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
)

type ListingClient interface {
	ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error)
	PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error)
	WithdrawBid(ctx context.Context, req *pb.WithdrawBidRequest) (*pb.WithdrawBidResponse, error)
	ListMyListings(ctx context.Context, req *pb.ListMyListingsRequest) (*pb.ListMyListingsResponse, error)
}

// CreateListingBody is the wire shape of a listing request. The seller comes
// from the token, so the item and the auction terms are all the caller supplies.
// Only shape is checked here; whether the end time is in the future is
// marketplace's rule and comes back through the seam.
type CreateListingBody struct {
	ItemID     string    `json:"itemId" format:"uuid" doc:"The item to list. It must be in the seller's stash and not already listed."`
	StartPrice int64     `json:"startPrice" minimum:"1" doc:"Gold the first bid must meet."`
	EndsAt     time.Time `json:"endsAt" doc:"When the auction closes. Must be in the future."`
}

// PlaceBidBody is the wire shape of a bid. The listing comes from the path and
// the bidder from the token, so the amount is all the caller supplies.
type PlaceBidBody struct {
	Amount int64 `json:"amount" minimum:"1" doc:"Gold offered. The first bid must meet the listing's start price; every later one must exceed the current leading bid."`
}

// Listing is a listing as its seller sees it. The optimistic-locking version is
// internal to marketplace and has no field here.
type Listing struct {
	ID         string    `json:"id" format:"uuid"`
	ItemID     string    `json:"itemId" format:"uuid"`
	SellerID   string    `json:"sellerId" format:"uuid"`
	BuyerID    *string   `json:"buyerId,omitempty" format:"uuid" doc:"Present once sold."`
	StartPrice int64     `json:"startPrice"`
	SoldPrice  *int64    `json:"soldPrice,omitempty" doc:"Present once sold."`
	Status     string    `json:"status" doc:"Listing status, e.g. ACTIVE, PENDING_SETTLEMENT, SOLD, SETTLEMENT_FAILED."`
	EndsAt     time.Time `json:"endsAt"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// ListingPage is one page of the caller's listings, newest first.
type ListingPage struct {
	Listings   []Listing `json:"listings" nullable:"false"`
	NextCursor *string   `json:"nextCursor,omitempty" doc:"Pass back as cursor for the next page. Absent on the last page."`
}

// listingPageFromProto maps marketplace's page to the wire. A listing missing a
// required timestamp is a fault in marketplace, answered as 500 rather than
// shown to the client as 1970.
func listingPageFromProto(res *pb.ListMyListingsResponse) (ListingPage, error) {
	listings := make([]Listing, 0, len(res.GetListings()))
	for _, l := range res.GetListings() {
		if l.GetEndsAt() == nil || l.GetCreatedAt() == nil || l.GetUpdatedAt() == nil {
			return ListingPage{}, fmt.Errorf("marketplace returned listing %s without a required timestamp", l.GetId())
		}

		listings = append(listings, Listing{
			ID:         l.GetId(),
			ItemID:     l.GetItemId(),
			SellerID:   l.GetSellerId(),
			BuyerID:    l.BuyerId,
			StartPrice: l.GetStartPrice(),
			SoldPrice:  l.SoldPrice,
			Status:     l.GetStatus(),
			EndsAt:     l.GetEndsAt().AsTime(),
			CreatedAt:  l.GetCreatedAt().AsTime(),
			UpdatedAt:  l.GetUpdatedAt().AsTime(),
		})
	}

	page := ListingPage{Listings: listings}
	if next := res.GetPagination().GetNextCursor(); next != "" {
		page.NextCursor = &next
	}

	return page, nil
}
