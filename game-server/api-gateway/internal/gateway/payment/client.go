package payment

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/payment"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls payment-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials payment-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with payment-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial payment service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) CreateCustomer(ctx context.Context, req *pb.CreateCustomerRequest) (*pb.CreateCustomerResponse, error) {
	client := pb.NewPaymentServiceClient(c.conn)
	return client.CreateCustomer(ctx, req)
}

func (c *Client) SetupSubscription(ctx context.Context, req *pb.SetupSubscriptionRequest) (*pb.SetupSubscriptionResponse, error) {
	client := pb.NewPaymentServiceClient(c.conn)
	return client.SetupSubscription(ctx, req)
}

func (c *Client) Subscribe(ctx context.Context, req *pb.SubscribeRequest) (*pb.SubscribeResponse, error) {
	client := pb.NewPaymentServiceClient(c.conn)
	return client.Subscribe(ctx, req)
}

func (c *Client) GetUserSubscriptions(ctx context.Context, req *pb.GetUserSubscriptionsRequest) (*pb.GetUserSubscriptionsResponse, error) {
	client := pb.NewPaymentServiceClient(c.conn)
	return client.GetUserSubscriptions(ctx, req)
}

func (c *Client) ProcessWebhook(ctx context.Context, req *pb.ProcessWebhookRequest) (*pb.ProcessWebhookResponse, error) {
	client := pb.NewPaymentServiceClient(c.conn)
	return client.ProcessWebhook(ctx, req)
}

func (c *Client) CheckPermission(ctx context.Context, req *pb.CheckPermissionRequest) (*pb.CheckPermissionResponse, error) {
	client := pb.NewPaymentServiceClient(c.conn)
	return client.CheckPermission(ctx, req)
}
