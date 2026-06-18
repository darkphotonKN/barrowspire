package notification

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

const (
	serviceName = "notification"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) NotificationClient {
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

func (c *Client) GetNotification(ctx context.Context, req *pb.NotificationRequest) (*pb.NotificationResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to notification service: %w", err)
	}

	client := pb.NewNotificationServiceClient(conn)

	response, err := client.GetNotification(ctx, req)
	return response, err
}

func (c *Client) MarkNotificationAsRead(ctx context.Context, req *pb.MarkNotificationAsReadRequest) (*pb.MarkNotificationAsReadResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to notification service: %w", err)
	}

	client := pb.NewNotificationServiceClient(conn)
	response, err := client.MarkNotificationAsRead(ctx, req)
	return response, err

}

func (c *Client) MarkAllNotificationsAsRead(ctx context.Context, req *pb.MarkAllNotificationsAsReadRequest) (*pb.MarkAllNotificationsAsReadResponse, error) {

	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to notification service: %w", err)
	}

	client := pb.NewNotificationServiceClient(conn)
	response, err := client.MarkAllNotificationsAsRead(ctx, req)
	return response, err
}
