package grpcwallet

import (
	"context"
	"testing"
	"time"

	walletpb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type fakeDebitRPC struct {
	got      *walletpb.DebitRequest
	auth     []string
	deadline time.Duration
	res      *walletpb.DebitResponse
	err      error
}

func (f *fakeDebitRPC) Debit(ctx context.Context, in *walletpb.DebitRequest, _ ...grpc.CallOption) (*walletpb.DebitResponse, error) {
	f.got = in
	md, _ := metadata.FromOutgoingContext(ctx)
	f.auth = md.Get("authorization")
	if at, ok := ctx.Deadline(); ok {
		f.deadline = time.Until(at)
	}
	return f.res, f.err
}

func asBuyer(token string) context.Context {
	return metadata.AppendToOutgoingContext(context.Background(), "authorization", "Bearer "+token)
}

// FS-9JV5K §B R8-R9: the debit goes out as the buyer, with the amount and the
// purchase key, bounded at 5 s; already applied is success too.
func TestDebit_ForwardsTheBuyersTokenTheAmountAndTheKey(t *testing.T) {
	for _, applied := range []bool{true, false} {
		rpc := &fakeDebitRPC{res: &walletpb.DebitResponse{Applied: applied}}
		client := &Client{rpc: rpc, timeout: callTimeout}

		got, err := client.Debit(asBuyer("the-buyers-token"), 60, "purchase:r:m:1")
		require.NoError(t, err)
		assert.Equal(t, applied, got)
		assert.Equal(t, []string{"Bearer the-buyers-token"}, rpc.auth)
		assert.Equal(t, int64(60), rpc.got.GetAmount())
		assert.Equal(t, "purchase:r:m:1", rpc.got.GetIdempotencyKey())
		assert.InDelta(t, callTimeout.Seconds(), rpc.deadline.Seconds(), 0.5, "each call times out at 5 s")
	}
}

// FS-9JV5K §B R9-R10, §C R15: what each answer the wallet gives means.
func TestDebit_FailuresMapToWhatTheRunReads(t *testing.T) {
	cases := []struct {
		code codes.Code
		want error
	}{
		{codes.FailedPrecondition, types.ErrNotEnoughGold},
		{codes.NotFound, types.ErrNoWallet},
		{codes.Unavailable, types.ErrWalletTransient},
		{codes.DeadlineExceeded, types.ErrWalletTransient},
		{codes.Aborted, types.ErrWalletTransient},
		{codes.Unauthenticated, types.ErrWalletRefused},
		{codes.InvalidArgument, types.ErrWalletRefused},
	}
	for _, tc := range cases {
		t.Run(tc.code.String(), func(t *testing.T) {
			client := &Client{rpc: &fakeDebitRPC{err: status.Error(tc.code, "no")}, timeout: callTimeout}
			_, err := client.Debit(asBuyer("t"), 5, "k")
			assert.ErrorIs(t, err, tc.want)
		})
	}

	// an answer after the debit may have committed is none of them: its
	// outcome is unknown (FS-9JV5K §B R10, amended 2026-11-25)
	for _, code := range []codes.Code{codes.Internal, codes.Unknown} {
		t.Run(code.String()+" is final and none of them", func(t *testing.T) {
			client := &Client{rpc: &fakeDebitRPC{err: status.Error(code, "no")}, timeout: callTimeout}
			_, err := client.Debit(asBuyer("t"), 5, "k")
			require.Error(t, err)
			for _, sentinel := range []error{types.ErrNotEnoughGold, types.ErrNoWallet, types.ErrWalletTransient, types.ErrWalletRefused} {
				assert.NotErrorIs(t, err, sentinel)
			}
		})
	}
}
