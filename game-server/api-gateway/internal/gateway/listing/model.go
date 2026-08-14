package listing

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
)

type ListingClient interface {
	ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error)
}

type ListItemResponse struct {
	ID         string `json:"id"`
	SellerID   string `json:"sellerId"`
	StartPrice int64  `json:"startPrice"`
	Status     string `json:"status"`
	EndsAt     string `json:"endsAt"` // ← 普通 string
	CreatedAt  string `json:"createdAt"`
}
