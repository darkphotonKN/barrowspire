package character

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/protobuf/types/known/emptypb"
)

const (
	// serviceName is character-service's Consul registration. It was "auth"
	// until FS-BDA7X, which dialed the wrong service entirely.
	serviceName = "character"
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

func (c *Client) service(ctx context.Context) (pb.CharacterServiceClient, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("connect to character service: %w", err)
	}
	return pb.NewCharacterServiceClient(conn), nil
}

func (c *Client) CreateCharacter(ctx context.Context, req *pb.CreateCharacterRequest) (*pb.Character, error) {
	svc, err := c.service(ctx)
	if err != nil {
		return nil, err
	}
	return svc.CreateCharacter(ctx, req)
}

func (c *Client) ListCharacters(ctx context.Context, req *pb.ListCharactersRequest) (*pb.ListCharactersResponse, error) {
	svc, err := c.service(ctx)
	if err != nil {
		return nil, err
	}
	return svc.ListCharacters(ctx, req)
}

func (c *Client) GetCharacter(ctx context.Context, req *pb.GetCharacterRequest) (*pb.Character, error) {
	svc, err := c.service(ctx)
	if err != nil {
		return nil, err
	}
	return svc.GetCharacter(ctx, req)
}

func (c *Client) DeleteCharacter(ctx context.Context, req *pb.DeleteCharacterRequest) (*emptypb.Empty, error) {
	svc, err := c.service(ctx)
	if err != nil {
		return nil, err
	}
	return svc.DeleteCharacter(ctx, req)
}
