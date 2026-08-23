package grpc

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
)

const (
	serviceName = "wallet"
)

type Client struct {
	registry discovery.Registry
}

func NewClient(registry discovery.Registry) WalletClient {
	return &Client{
		registry: registry,
	}
}

func (c *Client) PlaceHold(ctx context.Context, req *pb.PlaceHoldRequest) (*pb.PlaceHoldResponse, error) {
	conn, err := discovery.ServiceConnection(ctx, serviceName, c.registry)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to wallet service: %w", err)
	}
	defer conn.Close()

	client := pb.NewWalletServiceClient(conn)
	return client.PlaceHold(ctx, req)
}
