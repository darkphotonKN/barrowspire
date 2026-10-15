package itemreserver

import (
	"context"
	"fmt"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls items-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials items-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with items-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial items service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) ReserveItem(ctx context.Context, req *pb.ReserveItemRequest) (*pb.ReserveItemResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	item, err := client.ReserveItem(ctx, req)
	if err != nil {
		slog.Info("ReserveItem err", "err", err)
	}
	slog.Info("ReserveItem", "item", item)
	return item, err
}

func (c *Client) ListStaleReserved(ctx context.Context, req *pb.ListStaleReservedRequest) (*pb.ListStaleReservedResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	itemIds, err := client.ListStaleReserved(ctx, req)
	if err != nil {
		slog.Info("ListStaleReserved err", "err", err)
	}
	slog.Info("ListStaleReserved", "itemIds", itemIds)
	return itemIds, err
}

func (c *Client) CancelReservation(ctx context.Context, req *pb.CancelReservationRequest) (*pb.CancelReservationResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	item, err := client.CancelReservation(ctx, req)
	if err != nil {
		slog.Info("CancelReservation err", "err", err)
	}
	slog.Info("CancelReservation", "item", item)
	return item, err
}
