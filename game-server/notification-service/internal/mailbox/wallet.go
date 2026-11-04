package mailbox

import (
	"context"
	"fmt"
	"time"

	walletpb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// defaultWalletTimeout bounds one credit.
const defaultWalletTimeout = 5 * time.Second

// creditRPC is the one wallet-service call the mailbox makes.
type creditRPC interface {
	Credit(ctx context.Context, in *walletpb.CreditRequest, opts ...grpc.CallOption) (*walletpb.CreditResponse, error)
}

// WalletClient credits a claim's gold through wallet-service Credit (FS-1GZGD
// R16, R23), to the account of the member in the player's forwarded token.
type WalletClient struct {
	rpc     creditRPC
	timeout time.Duration
}

// NewWalletClient calls wallet-service over conn.
func NewWalletClient(conn grpc.ClientConnInterface) *WalletClient {
	return &WalletClient{rpc: walletpb.NewWalletServiceClient(conn), timeout: defaultWalletTimeout}
}

// Credit adds amount to the wallet of the member whose token ctx carries,
// once per key. applied false means the key was already credited: success.
//
// Unavailable, DeadlineExceeded, Aborted (wallet's write conflict), Internal
// and NotFound (a member whose wallet account does not exist yet, R24) are
// ErrWalletUnavailable: repeat later, 503 (R32). Anything else is a plain
// error. Either way the claim stays re-drivable.
func (c *WalletClient) Credit(ctx context.Context, amount int64, key string) (bool, error) {
	ctx, err := forwardToken(ctx)
	if err != nil {
		return false, fmt.Errorf("credit: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	res, err := c.rpc.Credit(ctx, &walletpb.CreditRequest{Amount: amount, IdempotencyKey: key})
	if err != nil {
		switch status.Code(err) {
		case codes.Unavailable, codes.DeadlineExceeded, codes.Aborted, codes.Internal, codes.NotFound:
			return false, fmt.Errorf("%w: %w", ErrWalletUnavailable, err)
		default:
			return false, fmt.Errorf("credit %d gold: %w", amount, err)
		}
	}
	return res.GetApplied(), nil
}
