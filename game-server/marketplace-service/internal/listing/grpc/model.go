package grpc

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
)

type WalletClient interface {
	PlaceHold(ctx context.Context, req *pb.PlaceHoldRequest) (*pb.PlaceHoldResponse, error)
}
