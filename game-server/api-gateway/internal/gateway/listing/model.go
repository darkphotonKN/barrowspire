package listing

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
)

type ListingClient interface {
	ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error)
	PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error)
}

// PlaceBidBody is the wire shape of a bid. The listing comes from the path and
// the bidder from the token, so the amount is all the caller supplies.
type PlaceBidBody struct {
	Amount int64 `json:"amount" minimum:"1" doc:"Gold offered. The first bid must meet the listing's start price; every later one must exceed the current leading bid."`
}

type ListItemResponse struct {
	ID         string `json:"id"`
	SellerID   string `json:"sellerId"`
	StartPrice int64  `json:"startPrice"`
	Status     string `json:"status"`
	EndsAt     string `json:"endsAt"` // ← 普通 string
	CreatedAt  string `json:"createdAt"`
}
