package ledger

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls ledger-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials ledger-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with ledger-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial ledger service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) GetTransaction(ctx context.Context, req *pb.GetTransactionRequest) (*pb.GetTransactionResponse, error) {
	client := pb.NewLedgerServiceClient(c.conn)
	return client.GetTransaction(ctx, req)
}

func (c *Client) ListEntries(ctx context.Context, req *pb.ListEntriesRequest) (*pb.ListEntriesResponse, error) {
	client := pb.NewLedgerServiceClient(c.conn)
	return client.ListEntries(ctx, req)
}
