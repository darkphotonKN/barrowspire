package character

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

const (
	serviceName = "auth"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) CharacterClient {
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

func (c *Client) CreateCharacter(ctx context.Context, req *pb.CreateCharacterRequest) (*pb.CreateCharacterResponse, error) {
	conn, err := c.ensureConn(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
	}

	client := pb.NewCharacterServiceClient(conn)

	character, err := client.CreateCharacter(ctx, req)
	return character, err
}

// func (c *Client) GetMember(ctx context.Context, req *pb.GetMemberRequest) (*pb.Member, error) {
// 	conn, err := c.ensureConn(ctx)

// 	if err != nil {
// 		return nil, fmt.Errorf("failed to connect to auth service: %w", err)
// 	}

// 	client := pb.NewAuthServiceClient(conn)

// 	member, err := client.GetMember(ctx, req)
// 	return member, err
// }
