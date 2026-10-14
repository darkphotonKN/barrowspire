package auth

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls auth-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials auth-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with auth-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial auth service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) GetMember(ctx context.Context, req *pb.GetMemberRequest) (*pb.Member, error) {
	client := pb.NewAuthServiceClient(c.conn)
	return client.GetMember(ctx, req)
}
