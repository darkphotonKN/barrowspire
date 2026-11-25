// Package grpcwallet takes gold from a member's wallet in wallet-service, the
// owner of every balance (ADR-0005), for a purchase made in a run (FS-9JV5K
// §B, ADR-0093).
package grpcwallet

import (
	"context"
	"fmt"
	"time"

	walletpb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// callTimeout bounds one debit call (FS-9JV5K §B R9).
const callTimeout = 5 * time.Second

// debitRPC is the one wallet-service call the run makes.
type debitRPC interface {
	Debit(ctx context.Context, in *walletpb.DebitRequest, opts ...grpc.CallOption) (*walletpb.DebitResponse, error)
}

// Client debits wallets over gRPC. It dials once and reuses the connection.
type Client struct {
	conn    *grpc.ClientConn
	rpc     debitRPC
	timeout time.Duration
}

// NewClient dials wallet-service at addr ("host:port"). The dial is lazy:
// nothing connects until the first debit, so game-service boots with
// wallet-service absent.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial wallet service at %s: %w", addr, err)
	}
	return &Client{conn: conn, rpc: walletpb.NewWalletServiceClient(conn), timeout: callTimeout}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

/**
* Debit takes amount from the wallet of the member whose bearer token ctx
* carries outgoing, once per key. applied false means the key was already
* debited: success, the gold was taken by an earlier call.
*
* FailedPrecondition is types.ErrNotEnoughGold, NotFound types.ErrNoWallet,
* Unavailable, DeadlineExceeded and Aborted types.ErrWalletTransient (the same
* key may be tried again), and Unauthenticated and InvalidArgument
* types.ErrWalletRefused (nothing was taken). Anything else, Internal
* included, is a plain error and final: the debit may have committed.
**/
func (c *Client) Debit(ctx context.Context, amount int64, key string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	res, err := c.rpc.Debit(ctx, &walletpb.DebitRequest{Amount: amount, IdempotencyKey: key})
	if err != nil {
		return false, fmt.Errorf("debit %d gold: %w", amount, debitError(err))
	}
	return res.GetApplied(), nil
}

// debitError is what a failed debit means to the run.
func debitError(err error) error {
	switch status.Code(err) {
	case codes.FailedPrecondition:
		return fmt.Errorf("%w: %w", types.ErrNotEnoughGold, err)
	case codes.NotFound:
		return fmt.Errorf("%w: %w", types.ErrNoWallet, err)
	case codes.Unavailable, codes.DeadlineExceeded, codes.Aborted:
		return fmt.Errorf("%w: %w", types.ErrWalletTransient, err)
	case codes.Unauthenticated, codes.InvalidArgument:
		return fmt.Errorf("%w: %w", types.ErrWalletRefused, err)
	default:
		return err
	}
}
