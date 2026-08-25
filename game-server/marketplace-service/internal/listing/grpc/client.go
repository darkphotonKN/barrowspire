package grpc

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/google/uuid"
)

const (
	serviceName = "wallet"
)

type Client struct {
	registry discovery.Registry
}

func NewClient(registry discovery.Registry) *Client {
	return &Client{
		registry: registry,
	}
}

func (c *Client) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int) error {
	conn, err := discovery.ServiceConnection(ctx, serviceName, c.registry)
	if err != nil {
		return fmt.Errorf("failed to connect to wallet service: %w", err)
	}
	defer conn.Close()

	_, err = pb.NewWalletServiceClient(conn).PlaceHold(ctx, &pb.PlaceHoldRequest{
		BidId: bidID.String(),
		Gold:  int64(gold),
	})
	if err != nil {
		return fmt.Errorf("wallet place hold for bid %v: %w", bidID, err)
	}

	return nil
}
