package mailbox

import (
	"context"
	"testing"

	walletpb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type fakeCreditRPC struct {
	calls    int
	got      *walletpb.CreditRequest
	auth     []string
	deadline bool
	res      *walletpb.CreditResponse
	err      error
}

func (f *fakeCreditRPC) Credit(ctx context.Context, in *walletpb.CreditRequest, _ ...grpc.CallOption) (*walletpb.CreditResponse, error) {
	f.calls++
	f.got = in
	md, _ := metadata.FromOutgoingContext(ctx)
	f.auth = md.Get("authorization")
	_, f.deadline = ctx.Deadline()
	return f.res, f.err
}

func TestWalletClient_CreditForwardsThePlayersTokenTheAmountAndTheKey(t *testing.T) {
	for _, applied := range []bool{true, false} {
		rpc := &fakeCreditRPC{res: &walletpb.CreditResponse{Applied: applied}}
		client := &WalletClient{rpc: rpc, timeout: defaultWalletTimeout}

		got, err := client.Credit(withPlayerToken("Bearer the-players-token"), 500, "mail:l:m")
		require.NoError(t, err, "already applied is success too")
		assert.Equal(t, applied, got)

		assert.Equal(t, []string{"Bearer the-players-token"}, rpc.auth, "wallet credits the token's member only")
		assert.True(t, rpc.deadline)
		assert.Equal(t, int64(500), rpc.got.GetAmount())
		assert.Equal(t, "mail:l:m", rpc.got.GetIdempotencyKey())
	}
}

func TestWalletClient_CreditFailures(t *testing.T) {
	for _, c := range []codes.Code{codes.Unavailable, codes.DeadlineExceeded, codes.Aborted} {
		t.Run(c.String()+" is retryable", func(t *testing.T) {
			client := &WalletClient{rpc: &fakeCreditRPC{err: status.Error(c, "busy")}, timeout: defaultWalletTimeout}
			_, err := client.Credit(withPlayerToken("Bearer t"), 5, "k")
			assert.ErrorIs(t, err, ErrWalletUnavailable)
		})
	}

	t.Run("no wallet account is a failure, not an outage", func(t *testing.T) {
		client := &WalletClient{rpc: &fakeCreditRPC{err: status.Error(codes.NotFound, "no account")}, timeout: defaultWalletTimeout}
		_, err := client.Credit(withPlayerToken("Bearer t"), 5, "k")
		require.Error(t, err)
		assert.NotErrorIs(t, err, ErrWalletUnavailable)
	})

	t.Run("without a token to forward nothing is called", func(t *testing.T) {
		rpc := &fakeCreditRPC{}
		_, err := (&WalletClient{rpc: rpc, timeout: defaultWalletTimeout}).Credit(context.Background(), 5, "k")
		require.Error(t, err)
		assert.Zero(t, rpc.calls)
	})
}
