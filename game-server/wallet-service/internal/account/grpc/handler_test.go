package grpc

import (
	"context"
	"errors"
	"fmt"
	"math"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	grpclib "google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// stubReader stands in for the read-side query the handler depends on. It
// records the member id it was handed so tests can prove the handler reads the
// *authenticated* account and not something supplied by the caller.
type stubReader struct {
	res *dto.AccountDetails
	err error

	calls       int
	gotMemberID uuid.UUID
}

func (s *stubReader) Execute(ctx context.Context, memberID uuid.UUID) (*dto.AccountDetails, error) {
	s.calls++
	s.gotMemberID = memberID
	return s.res, s.err
}

// authedCtx builds the context a request actually arrives with, by driving the
// real auth interceptor rather than faking its context key.
//
// The key type in commonauth is unexported and there is no exported
// ContextWithMemberID helper, so this is the only way to construct an
// authenticated context from outside that package. See the testability note in
// the accompanying summary.
func authedCtx(t *testing.T, memberID uuid.UUID) context.Context {
	t.Helper()

	var captured context.Context

	interceptor := commonauth.Auth(func(token string) (uuid.UUID, error) {
		return memberID, nil
	})

	incoming := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)

	_, err := interceptor(
		incoming,
		nil,
		&grpclib.UnaryServerInfo{FullMethod: "/wallet.WalletService/GetAccount"},
		func(ctx context.Context, req any) (any, error) {
			captured = ctx
			return nil, nil
		},
	)

	require.NoError(t, err, "auth interceptor should accept a valid token")
	require.NotNil(t, captured, "interceptor did not invoke the handler")

	return captured
}

// newTestHandler wires a Handler with only the read dependency populated. The
// write use cases are nil because GetAccount must never touch them; if that
// changes, these tests panic loudly rather than passing quietly.
func newTestHandler(reader AccountReader) *Handler {
	return NewHandler(nil, nil, reader)
}

// TestGetAccount_RejectsUnauthenticatedRequest covers the guard that matters
// most: with no identity on the context there is no account to read, so the
// handler must refuse *before* reaching the read side.
func TestGetAccount_RejectsUnauthenticatedRequest(t *testing.T) {
	reader := &stubReader{res: &dto.AccountDetails{}}
	h := newTestHandler(reader)

	res, err := h.GetAccount(context.Background(), &pb.GetAccountRequest{})

	assert.Nil(t, res)

	st, ok := status.FromError(err)
	require.True(t, ok, "error should be a gRPC status")
	assert.Equal(t, codes.Unauthenticated, st.Code())
	assert.Equal(t, "missing identity", st.Message())

	assert.Zero(t, reader.calls, "must not query the read side without an identity")
}

// TestGetAccount_ReadsTheAuthenticatedMembersAccount pins the security-relevant
// promise documented in the proto: identity comes from the authenticated
// context, never from the request.
func TestGetAccount_ReadsTheAuthenticatedMembersAccount(t *testing.T) {
	memberID := uuid.New()
	reader := &stubReader{res: &dto.AccountDetails{ID: uuid.New(), MemberID: memberID}}
	h := newTestHandler(reader)

	_, err := h.GetAccount(authedCtx(t, memberID), &pb.GetAccountRequest{})

	require.NoError(t, err)
	assert.Equal(t, 1, reader.calls)
	assert.Equal(t, memberID, reader.gotMemberID)
}

// TestGetAccount_MapsSnapshotToResponse walks the value mapping across the
// balance ranges the read side can realistically produce. The interesting part
// is not "the fields are copied" but that ids become strings, that the int ->
// int64 widening does not truncate, and that a negative available balance is
// passed through rather than clamped.
func TestGetAccount_MapsSnapshotToResponse(t *testing.T) {
	createdAt := time.Date(2026, 3, 14, 9, 30, 0, 0, time.UTC)

	tests := []struct {
		name    string
		details dto.AccountDetails
	}{
		{
			name: "typical balance with holds",
			details: dto.AccountDetails{
				ID:            uuid.New(),
				MemberID:      uuid.New(),
				Gold:          1_000,
				HeldGold:      250,
				AvailableGold: 750,
				CreatedAt:     createdAt,
			},
		},
		{
			name: "freshly created empty account",
			details: dto.AccountDetails{
				ID:            uuid.New(),
				MemberID:      uuid.New(),
				Gold:          0,
				HeldGold:      0,
				AvailableGold: 0,
				CreatedAt:     createdAt,
			},
		},
		{
			name: "everything held leaves nothing available",
			details: dto.AccountDetails{
				ID:            uuid.New(),
				MemberID:      uuid.New(),
				Gold:          500,
				HeldGold:      500,
				AvailableGold: 0,
				CreatedAt:     createdAt,
			},
		},
		{
			// REVIEW: available_gold is computed in SQL and can go negative if holds
			// ever outlive the balance backing them. The handler reports it verbatim.
			// Confirm the client is expected to handle a negative available balance.
			name: "holds exceeding balance report a negative available amount",
			details: dto.AccountDetails{
				ID:            uuid.New(),
				MemberID:      uuid.New(),
				Gold:          100,
				HeldGold:      400,
				AvailableGold: -300,
				CreatedAt:     createdAt,
			},
		},
		{
			name: "balance beyond 32 bits is not truncated",
			details: dto.AccountDetails{
				ID:            uuid.New(),
				MemberID:      uuid.New(),
				Gold:          math.MaxInt32 + 1,
				HeldGold:      math.MaxInt32 + 1,
				AvailableGold: 0,
				CreatedAt:     createdAt,
			},
		},
		{
			// REVIEW: the GetAccountQuery SELECT does not project created_at, so
			// CreatedAt arrives as the zero time and goes on the wire as year 1
			// rather than the account's real creation date.
			name: "zero creation time is emitted as-is",
			details: dto.AccountDetails{
				ID:            uuid.New(),
				MemberID:      uuid.New(),
				Gold:          10,
				HeldGold:      0,
				AvailableGold: 10,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			details := tt.details
			h := newTestHandler(&stubReader{res: &details})

			res, err := h.GetAccount(authedCtx(t, details.MemberID), &pb.GetAccountRequest{})

			require.NoError(t, err)
			require.NotNil(t, res)

			assert.Equal(t, details.ID.String(), res.Id)
			assert.Equal(t, details.MemberID.String(), res.MemberId)
			assert.Equal(t, int64(details.Gold), res.Gold)
			assert.Equal(t, int64(details.HeldGold), res.HeldGold)
			assert.Equal(t, int64(details.AvailableGold), res.AvailableGold)
			assert.True(t, res.CreatedAt.AsTime().Equal(details.CreatedAt),
				"created_at: want %s, got %s", details.CreatedAt, res.CreatedAt.AsTime())
		})
	}
}

// TestGetAccount_MapsReadErrorsToStatusCodes is the contract the caller codes
// against: which failures are retriable, which are the client's fault, and
// which are ours. Each case goes through the handler rather than mapError
// directly, so the mapping stays covered if the handler is restructured.
func TestGetAccount_MapsReadErrorsToStatusCodes(t *testing.T) {
	tests := []struct {
		name     string
		readErr  error
		wantCode codes.Code
		wantMsg  string
	}{
		{
			name:     "retry exhaustion is a retriable conflict",
			readErr:  usecase.ErrMaxRetries,
			wantCode: codes.Aborted,
			wantMsg:  "conflict, retry request",
		},
		{
			name:     "optimistic concurrency loss is a retriable conflict",
			readErr:  account.ErrConcurrentModification,
			wantCode: codes.Aborted,
			wantMsg:  "conflict, retry request",
		},
		{
			// Repositories wrap with fmt.Errorf("context: %w", err); the mapping
			// must survive that, otherwise every real error degrades to Internal.
			name:     "wrapped sentinel is still recognised",
			readErr:  fmt.Errorf("get account query: %w", commonconstants.ErrNotFound),
			wantCode: codes.NotFound,
			wantMsg:  "account not found",
		},
		{
			name:     "deeply wrapped sentinel is still recognised",
			readErr:  fmt.Errorf("handler: %w", fmt.Errorf("query: %w", commonconstants.ErrTransient)),
			wantCode: codes.Unavailable,
			wantMsg:  "temporarily unavailable, retry shortly",
		},
		{
			name:     "duplicate resource",
			readErr:  commonconstants.ErrDuplicateResource,
			wantCode: codes.AlreadyExists,
			wantMsg:  "already exists",
		},
		{
			name:     "missing account",
			readErr:  commonconstants.ErrNotFound,
			wantCode: codes.NotFound,
			wantMsg:  "account not found",
		},
		{
			name:     "transient infrastructure failure",
			readErr:  commonconstants.ErrTransient,
			wantCode: codes.Unavailable,
			wantMsg:  "temporarily unavailable, retry shortly",
		},
		{
			name:     "holds exceeding balance is a state violation",
			readErr:  account.ErrHoldsExceedBalance,
			wantCode: codes.FailedPrecondition,
			wantMsg:  "insufficient available gold",
		},
		{
			name:     "invalid amount",
			readErr:  account.ErrInvalidAmount,
			wantCode: codes.InvalidArgument,
			wantMsg:  "invalid argument",
		},
		{
			name:     "invalid gold",
			readErr:  account.ErrInvalidGold,
			wantCode: codes.InvalidArgument,
			wantMsg:  "invalid argument",
		},
		{
			name:     "unrecognised error is internal",
			readErr:  errors.New("dial tcp 10.0.0.4:5432: connection refused"),
			wantCode: codes.Internal,
			wantMsg:  "internal error",
		},
		{
			// REVIEW: commonconstants.ErrInvalidInput and ErrConstraintViolation are
			// not in the switch, so bad input surfaces to the client as Internal
			// (a 500) instead of InvalidArgument / FailedPrecondition. Current
			// behaviour is captured here — is it intended?
			name:     "unmapped invalid-input sentinel falls through to internal",
			readErr:  commonconstants.ErrInvalidInput,
			wantCode: codes.Internal,
			wantMsg:  "internal error",
		},
		{
			// REVIEW: same question for the authorization sentinels — a forbidden
			// read currently reads as a server fault, not PermissionDenied.
			name:     "unmapped forbidden sentinel falls through to internal",
			readErr:  commonconstants.ErrForbidden,
			wantCode: codes.Internal,
			wantMsg:  "internal error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newTestHandler(&stubReader{err: tt.readErr})

			res, err := h.GetAccount(authedCtx(t, uuid.New()), &pb.GetAccountRequest{})

			assert.Nil(t, res, "no partial response alongside an error")

			st, ok := status.FromError(err)
			require.True(t, ok, "error should be a gRPC status")
			assert.Equal(t, tt.wantCode, st.Code())
			assert.Equal(t, tt.wantMsg, st.Message())
		})
	}
}

// TestGetAccount_DoesNotLeakInternalDetails guards the promise made in
// mapError's default branch: the underlying failure is logged, never returned.
// A regression here quietly exposes infrastructure detail to every client.
func TestGetAccount_DoesNotLeakInternalDetails(t *testing.T) {
	leaky := errors.New(`pq: relation "accounts" does not exist (host=wallet-db-1.internal)`)
	h := newTestHandler(&stubReader{err: leaky})

	_, err := h.GetAccount(authedCtx(t, uuid.New()), &pb.GetAccountRequest{})

	st, _ := status.FromError(err)
	assert.Equal(t, "internal error", st.Message())
	assert.NotContains(t, st.Message(), "accounts")
	assert.NotContains(t, st.Message(), "wallet-db-1.internal")
}
