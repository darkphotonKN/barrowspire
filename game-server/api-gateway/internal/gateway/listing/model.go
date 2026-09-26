package listing

import (
	"context"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
)

type ListingClient interface {
	ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error)
	PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error)
	WithdrawBid(ctx context.Context, req *pb.WithdrawBidRequest) (*pb.WithdrawBidResponse, error)
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
