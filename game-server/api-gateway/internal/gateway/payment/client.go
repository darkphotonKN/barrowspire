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

func (c *Client) ProcessWebhook(ctx context.Context, req *pb.ProcessWebhookRequest) (*pb.ProcessWebhookResponse, error) {
	client := pb.NewPaymentServiceClient(c.conn)
	return client.ProcessWebhook(ctx, req)
}
