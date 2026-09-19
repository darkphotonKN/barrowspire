package wallet

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/metadata"
)

const (
	serviceName = "wallet"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

func NewClient(registry discovery.Registry) WalletClient {
	return &Client{
		registry: registry,
	}
}

// ensureConn lazily dials the service once and caches the connection for reuse
// across calls (gRPC multiplexes over it), matching the stats client.
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

// dial resolves the connection and carries the caller's bearer token through to
// wallet-service.
//
// Every wallet RPC derives the account from the authenticated member on its own
// context — the account is never named in the request — so a call that arrives
// without the token is rejected as Unauthenticated no matter what it asks for.
// The gateway's AuthMiddleware has already validated the token by this point;
// forwarding it lets wallet-service's own interceptor validate it again and
// populate the member id it reads from.
func (c *Client) dial(ctx context.Context) (context.Context, *grpc.ClientConn, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to connect to wallet service: %w", err)
	}

	if token, ok := BearerFromCtx(ctx); ok {
		ctx = metadata.AppendToOutgoingContext(ctx, "authorization", token)
	}

	return ctx, conn, nil
}

func (c *Client) CreateAccount(ctx context.Context, req *pb.CreateAccountRequest) (*pb.CreateAccountResponse, error) {
	ctx, conn, err := c.dial(ctx)
	if err != nil {
		return nil, err
	}

	return pb.NewWalletServiceClient(conn).CreateAccount(ctx, req)
}

func (c *Client) GetAccount(ctx context.Context, req *pb.GetAccountRequest) (*pb.GetAccountResponse, error) {
	ctx, conn, err := c.dial(ctx)
	if err != nil {
		return nil, err
	}

	return pb.NewWalletServiceClient(conn).GetAccount(ctx, req)
}

func (c *Client) Deposit(ctx context.Context, req *pb.DepositRequest) (*pb.DepositResponse, error) {
	ctx, conn, err := c.dial(ctx)
	if err != nil {
		return nil, err
	}

	return pb.NewWalletServiceClient(conn).Deposit(ctx, req)
}

func (c *Client) Withdraw(ctx context.Context, req *pb.WithdrawRequest) (*pb.WithdrawResponse, error) {
	ctx, conn, err := c.dial(ctx)
	if err != nil {
		return nil, err
	}

	return pb.NewWalletServiceClient(conn).Withdraw(ctx, req)
}
