package character

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/emptypb"
)

// Client calls character-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials character-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with character-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial character service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) CreateCharacter(ctx context.Context, req *pb.CreateCharacterRequest) (*pb.Character, error) {
	return pb.NewCharacterServiceClient(c.conn).CreateCharacter(ctx, req)
}

func (c *Client) ListCharacters(ctx context.Context, req *pb.ListCharactersRequest) (*pb.ListCharactersResponse, error) {
	return pb.NewCharacterServiceClient(c.conn).ListCharacters(ctx, req)
}

func (c *Client) GetCharacter(ctx context.Context, req *pb.GetCharacterRequest) (*pb.Character, error) {
	return pb.NewCharacterServiceClient(c.conn).GetCharacter(ctx, req)
}

func (c *Client) DeleteCharacter(ctx context.Context, req *pb.DeleteCharacterRequest) (*emptypb.Empty, error) {
	return pb.NewCharacterServiceClient(c.conn).DeleteCharacter(ctx, req)
}
