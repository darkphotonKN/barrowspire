package auth_test

import (
	"context"
	"errors"
	"testing"

	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pbmarketplace "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const testSecret = "test-secret-for-common-auth"

func sign(t *testing.T, claims jwt.Claims, secret string) string {
	t.Helper()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	require.NoError(t, err)
	return token
}

// A validator that drops a claim the minter sets is exactly the drift Claims
// exists to prevent, so the success cases compare the whole Identity.
func TestNewValidator(t *testing.T) {
	memberID := uuid.New()
	accountID := uuid.New()
	validate := commonauth.NewValidator([]byte(testSecret))

	full := commonauth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{Subject: memberID.String()},
		Role:             string(commonauth.RolePlayer),
		AccountID:        &accountID,
	}
	noAccount := commonauth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{Subject: memberID.String()},
		Role:             string(commonauth.RoleAdmin),
	}

	tests := []struct {
		name    string
		token   string
		want    commonauth.Identity
		wantErr bool
	}{
		{
			name:  "access token carries member, account and role",
			token: sign(t, full, testSecret),
			want:  commonauth.Identity{MemberID: memberID, AccountID: &accountID, Role: commonauth.RolePlayer},
		},
		{
			// ADR-0014: absence is a normal state, surfaced as nil, not rejected.
			name:  "account_id not yet populated is nil",
			token: sign(t, noAccount, testSecret),
			want:  commonauth.Identity{MemberID: memberID, Role: commonauth.RoleAdmin},
		},
		{
			name: "no role is refused",
			token: sign(t, commonauth.Claims{
				RegisteredClaims: jwt.RegisteredClaims{Subject: memberID.String()},
			}, testSecret),
			wantErr: true,
		},
		{
			name:    "wrong secret is refused",
			token:   sign(t, full, "not-the-secret"),
			wantErr: true,
		},
		{
			name: "sub not a uuid is refused",
			token: sign(t, jwt.MapClaims{
				"sub": "not-a-uuid", "role": "player",
			}, testSecret),
			wantErr: true,
		},
		{
			name: "account_id present but not a uuid is refused",
			token: sign(t, jwt.MapClaims{
				"sub": memberID.String(), "role": "player", "account_id": "not-a-uuid",
			}, testSecret),
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validate(tt.token)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func runInterceptor(t *testing.T, validate func(string) (commonauth.Identity, error)) (context.Context, error) {
	t.Helper()

	var captured context.Context
	incoming := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)

	_, err := commonauth.Auth(validate)(
		incoming,
		nil,
		&grpc.UnaryServerInfo{FullMethod: "/test.Service/Method"},
		func(ctx context.Context, req any) (any, error) {
			captured = ctx
			return nil, nil
		},
	)
	return captured, err
}

// The interceptor must hand the handler every claim, not only the member id —
// that is the whole reason downstream services can authorize by role.
func TestAuth_EmbedsTheWholeIdentity(t *testing.T) {
	accountID := uuid.New()
	want := commonauth.Identity{MemberID: uuid.New(), AccountID: &accountID, Role: commonauth.RoleAdmin}

	ctx, err := runInterceptor(t, func(string) (commonauth.Identity, error) { return want, nil })
	require.NoError(t, err)

	got, ok := commonauth.IdentityFromCtx(ctx)
	require.True(t, ok)
	assert.Equal(t, want, got)

	memberID, ok := commonauth.MemberIDFromCtx(ctx)
	require.True(t, ok)
	assert.Equal(t, want.MemberID, memberID)
}

func TestAuth_InvalidToken_NeverReachesHandler(t *testing.T) {
	ctx, err := runInterceptor(t, func(string) (commonauth.Identity, error) {
		return commonauth.Identity{}, assert.AnError
	})

	assert.Equal(t, codes.Unauthenticated, status.Code(err))
	assert.Nil(t, ctx, "handler must not run")
}

func TestIdentityFromCtx_UnauthenticatedContext(t *testing.T) {
	_, ok := commonauth.IdentityFromCtx(context.Background())
	assert.False(t, ok)

	_, ok = commonauth.MemberIDFromCtx(context.Background())
	assert.False(t, ok)
}

// The two wallet methods a service calls on its own behalf carry no member token,
// because there is no member: one compensates for a failed write, the other runs on
// a background ticker. They have to reach their handler without metadata at all.
//
// Pinned as a pair with the negative case below, so this cannot quietly become
// "the interceptor stopped checking anything".
func TestAuth_ServiceCalledMethods_SkipTheTokenCheck(t *testing.T) {
	for _, method := range []string{
		"/wallet.WalletService/ReleaseHold",
		"/wallet.WalletService/ListStaleReservedHolds",
	} {
		t.Run(method, func(t *testing.T) {
			reached := false

			_, err := commonauth.Auth(rejectEveryToken)(
				context.Background(), // no metadata, as a background worker has none
				nil,
				&grpc.UnaryServerInfo{FullMethod: method},
				func(ctx context.Context, req any) (any, error) {
					reached = true
					return nil, nil
				},
			)

			require.NoError(t, err)
			assert.True(t, reached, "the handler must run without a token")
		})
	}
}

// The gate still rejects: whitelisting is per method, so wallet's other methods are
// untouched, and a missing token on one of them is still Unauthenticated.
func TestAuth_WhitelistIsPerMethod(t *testing.T) {
	for _, method := range []string{
		"/wallet.WalletService/PlaceHold",
		"/wallet.WalletService/Withdraw",
		"/marketplace.MarketplaceService/PlaceBid",
	} {
		t.Run(method, func(t *testing.T) {
			reached := false

			_, err := commonauth.Auth(rejectEveryToken)(
				context.Background(),
				nil,
				&grpc.UnaryServerInfo{FullMethod: method},
				func(ctx context.Context, req any) (any, error) {
					reached = true
					return nil, nil
				},
			)

			require.Error(t, err)
			assert.Equal(t, codes.Unauthenticated, status.Code(err))
			assert.False(t, reached, "the handler must not run")
		})
	}
}

// The marketplace page's reads are open to a visitor who is not signed in
// (FS-8EGFA §Requirements 6, 10), so they reach their handler with no metadata.
func TestAuth_PublicReads_SkipTheTokenCheck(t *testing.T) {
	for _, method := range publicReads {
		t.Run(method, func(t *testing.T) {
			reached := false

			_, err := commonauth.Auth(rejectEveryToken)(
				context.Background(), // a signed-out visitor sends no metadata
				nil,
				&grpc.UnaryServerInfo{FullMethod: method},
				func(ctx context.Context, req any) (any, error) {
					reached = true
					return nil, nil
				},
			)

			require.NoError(t, err)
			assert.True(t, reached, "the handler must run without a token")
		})
	}
}

// The other half of the pair: every other marketplace and items method still
// needs a token. The list is read from the generated service descriptors rather
// than typed out, so a method added later is covered without anyone remembering.
func TestAuth_PublicReads_LeaveEveryOtherMarketplaceAndItemsMethodGuarded(t *testing.T) {
	public := make(map[string]bool, len(publicReads))
	for _, m := range publicReads {
		public[m] = true
	}

	var guarded []string
	for _, desc := range []grpc.ServiceDesc{
		pbmarketplace.MarketplaceService_ServiceDesc,
		pbitems.ItemsService_ServiceDesc,
	} {
		for _, m := range desc.Methods {
			full := "/" + desc.ServiceName + "/" + m.MethodName
			if !public[full] {
				guarded = append(guarded, full)
			}
		}
	}
	// the ones FS-8EGFA names, so a descriptor rename cannot empty the loop
	require.Contains(t, guarded, "/marketplace.MarketplaceService/PlaceBid")
	require.Contains(t, guarded, "/marketplace.MarketplaceService/ListItem")
	require.Contains(t, guarded, "/marketplace.MarketplaceService/ListMyListings")
	require.Contains(t, guarded, "/items.ItemsService/ReserveItem")

	for _, method := range guarded {
		t.Run(method, func(t *testing.T) {
			reached := false

			_, err := commonauth.Auth(rejectEveryToken)(
				context.Background(),
				nil,
				&grpc.UnaryServerInfo{FullMethod: method},
				func(ctx context.Context, req any) (any, error) {
					reached = true
					return nil, nil
				},
			)

			require.Error(t, err)
			assert.Equal(t, codes.Unauthenticated, status.Code(err))
			assert.False(t, reached, "the handler must not run")
		})
	}
}

var publicReads = []string{
	"/marketplace.MarketplaceService/BrowseListings",
	"/marketplace.MarketplaceService/GetListing",
	"/items.ItemsService/GetItemSummaries",
}

func rejectEveryToken(string) (commonauth.Identity, error) {
	return commonauth.Identity{}, errors.New("no token should have been validated")
}
