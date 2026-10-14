package stats

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls stats-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials stats-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with stats-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial stats service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) GetPlayerStats(ctx context.Context, req *pb.GetPlayerMatchStatsRequest) (*pb.PlayerMatchStats, error) {
	client := pb.NewStatsServiceClient(c.conn)
	stats, err := client.GetPlayerMatchStats(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get player stats: %w", err)
	}

	return stats, nil
}

func (c *Client) GetLeaderboard(ctx context.Context, req *pb.GetLeaderboardRequest) (*pb.GetLeaderboardResponse, error) {
	client := pb.NewStatsServiceClient(c.conn)
	stats, err := client.GetLeaderboard(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to get player stats: %w", err)
	}

	return stats, nil
}
