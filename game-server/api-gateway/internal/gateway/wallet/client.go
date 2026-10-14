package wallet

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

// Client calls wallet-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials wallet-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with wallet-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial wallet service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

// withBearer carries the caller's bearer token through to wallet-service.
//
// Every wallet RPC derives the account from the authenticated member on its own
// context — the account is never named in the request — so a call that arrives
// without the token is rejected as Unauthenticated no matter what it asks for.
// The gateway's AuthMiddleware has already validated the token by this point;
// forwarding it lets wallet-service's own interceptor validate it again and
// populate the member id it reads from.
func withBearer(ctx context.Context) context.Context {
	if token, ok := BearerFromCtx(ctx); ok {
		ctx = metadata.AppendToOutgoingContext(ctx, "authorization", token)
	}

	return ctx
}

func (c *Client) CreateAccount(ctx context.Context, req *pb.CreateAccountRequest) (*pb.CreateAccountResponse, error) {
	return pb.NewWalletServiceClient(c.conn).CreateAccount(withBearer(ctx), req)
}

func (c *Client) GetAccount(ctx context.Context, req *pb.GetAccountRequest) (*pb.GetAccountResponse, error) {
	return pb.NewWalletServiceClient(c.conn).GetAccount(withBearer(ctx), req)
}

func (c *Client) Deposit(ctx context.Context, req *pb.DepositRequest) (*pb.DepositResponse, error) {
	return pb.NewWalletServiceClient(c.conn).Deposit(withBearer(ctx), req)
}

func (c *Client) Withdraw(ctx context.Context, req *pb.WithdrawRequest) (*pb.WithdrawResponse, error) {
	return pb.NewWalletServiceClient(c.conn).Withdraw(withBearer(ctx), req)
}
