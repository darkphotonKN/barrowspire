package itemreserver

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

const (
	serviceName = "items"
)

func NewClient(registry discovery.Registry) ItemReserverClient {
	return &Client{
		registry: registry,
	}
}

// ensureConn lazily dials the service once and caches the connection for
// reuse across calls (gRPC multiplexes over it). Opening a fresh conn per RPC
// serialized badly and churned connections; see common/discovery/grpc.go.
func (c *Client) ensureConn(ctx context.Context) (*grpc.ClientConn, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil && c.conn.GetState() != connectivity.Shutdown {
		return c.conn, nil
	}
	conn, err := discovery.ServiceConnection(ctx, serviceName, c.registry)
	if err != nil {
		return nil, err
	}
	c.conn = conn
	return conn, nil
}

func (c *Client) ReserveItem(ctx context.Context, req *pb.ReserveItemRequest) (*pb.ReserveItemResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to listing service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	item, err := client.ReserveItem(ctx, req)
	if err != nil {
		slog.Info("ReserveItem err", "err", err)
	}
	slog.Info("ReserveItem", "item", item)
	return item, err
}

func (c *Client) ListStaleReserved(ctx context.Context, req *pb.ListStaleReservedRequest) (*pb.ListStaleReservedResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to listing service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	itemIds, err := client.ListStaleReserved(ctx, req)
	if err != nil {
		slog.Info("ListStaleReserved err", "err", err)
	}
	slog.Info("ListStaleReserved", "itemIds", itemIds)
	return itemIds, err
}

func (c *Client) CancelReservation(ctx context.Context, req *pb.CancelReservationRequest) (*pb.CancelReservationResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to listing service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	item, err := client.CancelReservation(ctx, req)
	if err != nil {
		slog.Info("CancelReservation err", "err", err)
	}
	slog.Info("CancelReservation", "item", item)
	return item, err
}
