package stats

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
)

const (
	serviceName = "stats"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) StatsClient {
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

func (c *Client) GetPlayerStats(ctx context.Context, req *pb.GetPlayerMatchStatsRequest) (*pb.PlayerMatchStats, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to stats service: %w", err)
	}

	client := pb.NewStatsServiceClient(conn)
	stats, err := client.GetPlayerMatchStats(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get player stats: %w", err)
	}

	return stats, nil
}

func (c *Client) GetLeaderboard(ctx context.Context, req *pb.GetLeaderboardRequest) (*pb.GetLeaderboardResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to stats service: %w", err)
	}

	client := pb.NewStatsServiceClient(conn)
	stats, err := client.GetLeaderboard(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get player stats: %w", err)
	}

	return stats, nil
}
