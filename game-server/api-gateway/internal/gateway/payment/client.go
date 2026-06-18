package payment

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/payment"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

const (
	serviceName = "payments"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) PaymentClient {
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

func (c *Client) CreateCustomer(ctx context.Context, req *pb.CreateCustomerRequest) (*pb.CreateCustomerResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to payment service: %w", err)
	}

	client := pb.NewPaymentServiceClient(conn)
	return client.CreateCustomer(ctx, req)
}

func (c *Client) SetupSubscription(ctx context.Context, req *pb.SetupSubscriptionRequest) (*pb.SetupSubscriptionResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to payment service: %w", err)
	}

	client := pb.NewPaymentServiceClient(conn)
	return client.SetupSubscription(ctx, req)
}

func (c *Client) Subscribe(ctx context.Context, req *pb.SubscribeRequest) (*pb.SubscribeResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to payment service: %w", err)
	}

	client := pb.NewPaymentServiceClient(conn)
	return client.Subscribe(ctx, req)
}

func (c *Client) GetUserSubscriptions(ctx context.Context, req *pb.GetUserSubscriptionsRequest) (*pb.GetUserSubscriptionsResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to payment service: %w", err)
	}

	client := pb.NewPaymentServiceClient(conn)
	return client.GetUserSubscriptions(ctx, req)
}

func (c *Client) ProcessWebhook(ctx context.Context, req *pb.ProcessWebhookRequest) (*pb.ProcessWebhookResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to payment service: %w", err)
	}

	client := pb.NewPaymentServiceClient(conn)
	return client.ProcessWebhook(ctx, req)
}

func (c *Client) CheckPermission(ctx context.Context, req *pb.CheckPermissionRequest) (*pb.CheckPermissionResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to payment service: %w", err)
	}

	client := pb.NewPaymentServiceClient(conn)
	return client.CheckPermission(ctx, req)
}
