package grpc

import (
	"bytes"
	"context"
	"log/slog"
	"net"
	"testing"

	marketplacepb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	walletpb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	grpclib "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// wallet resolves the account from the caller's token, so the outbound call
// must carry the same authorization header the inbound request arrived with.
func TestForwardAuthorization(t *testing.T) {
	tests := []struct {
		name     string
		incoming metadata.MD
		wantCode codes.Code
	}{
		{
			name:     "forwards the caller's token",
			incoming: metadata.New(map[string]string{"authorization": "Bearer caller-token"}),
			wantCode: codes.OK,
		},
		{
			name:     "no metadata at all",
			incoming: nil,
			wantCode: codes.Unauthenticated,
		},
		{
			name:     "metadata without authorization",
			incoming: metadata.New(map[string]string{"x-other": "value"}),
			wantCode: codes.Unauthenticated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.incoming != nil {
				ctx = metadata.NewIncomingContext(ctx, tt.incoming)
			}

			outCtx, err := forwardAuthorization(ctx)

			require.Equal(t, tt.wantCode, status.Code(err))
			if tt.wantCode != codes.OK {
				return
			}

			out, ok := metadata.FromOutgoingContext(outCtx)
			require.True(t, ok)
			assert.Equal(t, []string{"Bearer caller-token"}, out.Get("authorization"))
		})
	}
}

// fakeWalletServer answers every PlaceHold with the configured status code, so
// a test can drive the real wallet client over a real connection.
type fakeWalletServer struct {
	walletpb.UnimplementedWalletServiceServer
	code codes.Code
}

func (s *fakeWalletServer) PlaceHold(ctx context.Context, req *walletpb.PlaceHoldRequest) (*walletpb.PlaceHoldResponse, error) {
	return nil, status.Error(s.code, "wallet says no")
}

// fakeRegistry points discovery at the fake wallet server's address.
type fakeRegistry struct {
	addr string
}

func (r *fakeRegistry) Register(ctx context.Context, instanceID, serviceName, hostPort string) error {
	return nil
}

func (r *fakeRegistry) Deregister(ctx context.Context, instanceID, serviceName string) error {
	return nil
}

// Discover reports no healthy instance when addr is empty, as when every
// wallet instance is down.
func (r *fakeRegistry) Discover(ctx context.Context, serviceName string) ([]string, error) {
	if r.addr == "" {
		return nil, nil
	}
	return []string{r.addr}, nil
}

func (r *fakeRegistry) HealthCheck(instanceID, serviceName string) error {
	return nil
}

// startFakeWallet serves a wallet that refuses every hold with code, and
// returns a registry that resolves "wallet" to it.
func startFakeWallet(t *testing.T, code codes.Code) *fakeRegistry {
	t.Helper()

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	srv := grpclib.NewServer()
	walletpb.RegisterWalletServiceServer(srv, &fakeWalletServer{code: code})
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)

	return &fakeRegistry{addr: lis.Addr().String()}
}

// captureLogs swaps the default logger for one writing to a buffer, so a test
// can see the level mapError logged at.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()

	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	return &buf
}

// A wallet refusal must keep its meaning through place-bid: insufficient gold
// is the caller's precondition, an unreachable wallet is retryable, and only a
// code marketplace does not recognise is a server error.
func TestPlaceBid_WalletRefusal_KeepsItsMeaning(t *testing.T) {
	tests := []struct {
		name       string
		walletCode codes.Code
		noWallet   bool
		wantCode   codes.Code
		wantLevel  string
	}{
		{"insufficient gold", codes.FailedPrecondition, false, codes.FailedPrecondition, "level=INFO"},
		{"wallet unavailable", codes.Unavailable, false, codes.Unavailable, "level=WARN"},
		{"wallet deadline exceeded", codes.DeadlineExceeded, false, codes.Unavailable, "level=WARN"},
		{"no wallet instance", codes.OK, true, codes.Unavailable, "level=WARN"},
		{"unrecognised code", codes.DataLoss, false, codes.Internal, "level=ERROR"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			l := activeListing(t)
			repo := &fakeRepo{l: l}
			registry := &fakeRegistry{}
			if !tt.noWallet {
				registry = startFakeWallet(t, tt.walletCode)
			}
			h := NewHandler(nil, nil, usecase.NewPlaceBidUC(repo, NewClient(registry)), nil, nil)

			_, err := h.PlaceBid(authedCtx(t, uuid.New()), &marketplacepb.PlaceBidRequest{
				ListingId: l.Snapshot().ID.String(),
				Amount:    150,
			})

			assert.Equal(t, tt.wantCode, status.Code(err))
			assert.Contains(t, logs.String(), tt.wantLevel)
			assert.Empty(t, repo.l.Snapshot().Bids, "a refused hold records no bid")
		})
	}
}
