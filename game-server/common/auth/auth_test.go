package auth_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

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

	// Every access token auth-service mints is typed access (FS-ZPX58 L1), so
	// the success cases carry the type and the refusals below show it matters.
	full := commonauth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{Subject: memberID.String()},
		TokenType:        "access",
		Role:             string(commonauth.RolePlayer),
		AccountID:        &accountID,
	}
	noAccount := commonauth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{Subject: memberID.String()},
		TokenType:        "access",
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
			// FS-V6SFK §Requirements 22: the claim is read, never a refusal.
			name: "email_verified true is carried",
			token: sign(t, jwt.MapClaims{
				"sub": memberID.String(), "tokenType": "access", "role": "player", "email_verified": true,
			}, testSecret),
			want: commonauth.Identity{MemberID: memberID, Role: commonauth.RolePlayer, EmailVerified: true},
		},
		{
			// Absent is unverified, and still authenticated (fails closed, ADR-0014).
			name: "email_verified absent reads as unverified",
			token: sign(t, jwt.MapClaims{
				"sub": memberID.String(), "tokenType": "access", "role": "player",
			}, testSecret),
			want: commonauth.Identity{MemberID: memberID, Role: commonauth.RolePlayer, EmailVerified: false},
		},
		{
			// FS-ZPX58 L1: a refresh token is never an access credential, even
			// one that somehow carries a role.
			name: "a refresh token is refused even with a role",
			token: sign(t, jwt.MapClaims{
				"sub": memberID.String(), "tokenType": "refresh", "role": "player",
			}, testSecret),
			wantErr: true,
		},
		{
			name: "no token type is refused",
			token: sign(t, jwt.MapClaims{
				"sub": memberID.String(), "role": "player",
			}, testSecret),
			wantErr: true,
		},
		{
			name: "no role is refused",
			token: sign(t, commonauth.Claims{
				RegisteredClaims: jwt.RegisteredClaims{Subject: memberID.String()},
				TokenType:        "access",
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
				"sub": "not-a-uuid", "tokenType": "access", "role": "player",
			}, testSecret),
			wantErr: true,
		},
		{
			name: "account_id present but not a uuid is refused",
			token: sign(t, jwt.MapClaims{
				"sub": memberID.String(), "tokenType": "access", "role": "player", "account_id": "not-a-uuid",
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

// FS-ZPX58 L7: a validator built with no secret refuses everything, rather
// than accepting a token signed with the empty key.
func TestNewValidator_EmptySecret_RefusesEverything(t *testing.T) {
	validate := commonauth.NewValidator(nil)
	token := sign(t, jwt.MapClaims{"sub": uuid.New().String(), "tokenType": "access", "role": "player"}, "")

	_, err := validate(token)

	assert.Error(t, err)
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

// serviceCalled are the methods a service calls on its own behalf, with no member
// token because there is no member. Two wallet methods: one compensates for a failed
// write, the other runs on a background ticker. And items' ApplySettlement, which
// game-service calls to settle a run's players (FS-GV8WN R11), and
// ResolveItemSnapshots, which notification-service calls when a letter is sent,
// often from a letter request with no member behind it (FS-1GZGD R21).
var serviceCalled = []string{
	"/wallet.WalletService/ReleaseHold",
	"/wallet.WalletService/ListStaleReservedHolds",
	"/items.ItemsService/ApplySettlement",
	"/items.ItemsService/ListStaleReserved",
	"/items.ItemsService/CancelReservation",
	"/items.ItemsService/ConfirmReservation",
	"/items.ItemsService/ReleaseConfirmedReservation",
	"/items.ItemsService/ListConfirmedReservations",
	"/items.ItemsService/ResolveItemSnapshots",
}

// The service-called methods have to reach their handler without metadata at all.
//
// Pinned as a pair with the negative cases below, so this cannot quietly become
// "the interceptor stopped checking anything".
func TestAuth_ServiceCalledMethods_SkipTheTokenCheck(t *testing.T) {
	for _, method := range serviceCalled {
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
// (FS-8EGFA §Requirements 6, 10), and the item catalogue (base types, rarity
// weights) is read once per game session by game-service with no player behind
// the call, so all of them reach their handler with no metadata.
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
	public := make(map[string]bool, len(publicReads)+len(serviceCalled)+len(optionalAuthReads))
	for _, m := range publicReads {
		public[m] = true
	}
	for _, m := range serviceCalled {
		public[m] = true
	}
	for _, m := range optionalAuthReads {
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
	// worn gear is member-owned: game-service loads it as the player, with their token
	require.Contains(t, guarded, "/items.ItemsService/GetLoadoutWithItems")

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
	"/items.ItemsService/GetItemSummaries",
	"/items.ItemsService/ListItemTemplates",
	"/items.ItemsService/ListItemRarities",
}

func rejectEveryToken(string) (commonauth.Identity, error) {
	return commonauth.Identity{}, errors.New("no token should have been validated")
}

// optionalAuthReads are genuinely public, but read a caller when one is present
// (ADR-0053): the Bazaar's browse and detail answer whether each listing is the
// viewer's own (FS-GKHYD §Requirements 8).
var optionalAuthReads = []string{
	"/marketplace.MarketplaceService/BrowseListings",
	"/marketplace.MarketplaceService/GetListing",
}

// callAs drives the interceptor for method with md as the incoming metadata (nil
// sends none at all), and answers the context the handler ran with: nil when it
// never ran.
func callAs(t *testing.T, method string, md metadata.MD, validate func(string) (commonauth.Identity, error)) (context.Context, error) {
	t.Helper()

	ctx := context.Background()
	if md != nil {
		ctx = metadata.NewIncomingContext(ctx, md)
	}

	var reached context.Context
	_, err := commonauth.Auth(validate)(
		ctx,
		nil,
		&grpc.UnaryServerInfo{FullMethod: method},
		func(ctx context.Context, req any) (any, error) {
			reached = ctx
			return nil, nil
		},
	)
	return reached, err
}

func bearer(token string) metadata.MD {
	return metadata.New(map[string]string{"authorization": "Bearer " + token})
}

// A public method is skipped outright, so a token that would validate is never
// read and no identity reaches the handler. Moving a stopgap to optional-auth by
// accident would break this.
func TestAuth_PublicMethods_NeverEmbedIdentity_EvenWithAValidToken(t *testing.T) {
	validated := commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RolePlayer}

	for _, method := range append(append([]string{}, publicReads...), serviceCalled...) {
		t.Run(method, func(t *testing.T) {
			ctx, err := callAs(t, method, bearer("valid"), func(string) (commonauth.Identity, error) {
				return validated, nil
			})

			require.NoError(t, err)
			require.NotNil(t, ctx, "the handler must run")
			_, ok := commonauth.IdentityFromCtx(ctx)
			assert.False(t, ok, "a public method reads no caller")
		})
	}
}

// With a valid bearer an optional-auth method embeds the whole identity, exactly
// as a protected method does.
func TestAuth_OptionalAuthMethods_EmbedIdentityWithAValidToken(t *testing.T) {
	accountID := uuid.New()
	want := commonauth.Identity{MemberID: uuid.New(), AccountID: &accountID, Role: commonauth.RolePlayer, EmailVerified: true}

	for _, method := range optionalAuthReads {
		t.Run(method, func(t *testing.T) {
			ctx, err := callAs(t, method, bearer("valid"), func(token string) (commonauth.Identity, error) {
				require.Equal(t, "valid", token)
				return want, nil
			})

			require.NoError(t, err)
			require.NotNil(t, ctx, "the handler must run")
			got, ok := commonauth.IdentityFromCtx(ctx)
			require.True(t, ok)
			assert.Equal(t, want, got)
		})
	}
}

// Anything short of a valid bearer is an anonymous visitor, never
// Unauthenticated: a stale token must not break a public page (ADR-0053).
func TestAuth_OptionalAuthMethods_ServeAnonymouslyWithoutAValidToken(t *testing.T) {
	validate := commonauth.NewValidator([]byte(testSecret))
	expired := sign(t, commonauth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   uuid.New().String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
		},
		Role: string(commonauth.RolePlayer),
	}, testSecret)

	tests := []struct {
		name string
		md   metadata.MD
	}{
		{"no metadata", nil},
		{"no authorization", metadata.New(map[string]string{"x-request-id": "r1"})},
		{"empty authorization", metadata.New(map[string]string{"authorization": ""})},
		{"not a bearer", metadata.New(map[string]string{"authorization": "Basic dXNlcjpwYXNz"})},
		{"bearer without a space", metadata.New(map[string]string{"authorization": "Bearer"})},
		{"garbage token", bearer("not-a-jwt")},
		{"wrong secret", bearer(sign(t, commonauth.Claims{
			RegisteredClaims: jwt.RegisteredClaims{Subject: uuid.New().String()},
			Role:             string(commonauth.RolePlayer),
		}, "not-the-secret"))},
		{"expired token", bearer(expired)},
	}

	for _, method := range optionalAuthReads {
		for _, tt := range tests {
			t.Run(method+"/"+tt.name, func(t *testing.T) {
				ctx, err := callAs(t, method, tt.md, validate)

				require.NoError(t, err, "an optional-auth method never answers Unauthenticated")
				require.NotNil(t, ctx, "the handler must run")
				_, ok := commonauth.IdentityFromCtx(ctx)
				assert.False(t, ok, "no identity for an anonymous caller")
			})
		}
	}
}

// captureDebugLogs routes the default logger, at Debug, into a buffer for the
// rest of the test.
func captureDebugLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(original) })
	return &buf
}

// An optional-auth method serves a bad token anonymously, so nothing else would
// show that every signed-in viewer is being dropped (a misconfigured JWT secret,
// say). The reason is logged at Debug, with the method and never the token.
func TestAuth_OptionalAuthMethods_LogWhyAPresentedTokenWasDropped(t *testing.T) {
	validate := commonauth.NewValidator([]byte(testSecret))
	wrongSecret := sign(t, commonauth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{Subject: uuid.New().String()},
		Role:             string(commonauth.RolePlayer),
	}, "not-the-secret")

	tests := []struct {
		name       string
		md         metadata.MD
		wantReason string
	}{
		{"wrong secret", bearer(wrongSecret), "signature is invalid"},
		{"not a bearer", metadata.New(map[string]string{"authorization": "Basic dXNlcjpwYXNz"}), "malformed authorization"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureDebugLogs(t)

			_, err := callAs(t, optionalAuthReads[0], tt.md, validate)

			require.NoError(t, err)
			out := logs.String()
			assert.Contains(t, out, "level=DEBUG")
			assert.Contains(t, out, optionalAuthReads[0])
			assert.Contains(t, out, tt.wantReason)
			assert.NotContains(t, out, wrongSecret, "the token never reaches the log")
			assert.NotContains(t, out, "dXNlcjpwYXNz", "the credential never reaches the log")
		})
	}
}

// No token at all is the ordinary signed-out visitor, not a fault: nothing is
// logged for it, so the Debug line stays a signal.
func TestAuth_OptionalAuthMethods_LogNothingForASignedOutVisitor(t *testing.T) {
	logs := captureDebugLogs(t)

	_, err := callAs(t, optionalAuthReads[0], metadata.New(map[string]string{"x-request-id": "r1"}), rejectEveryToken)

	require.NoError(t, err)
	assert.Empty(t, logs.String())
}

// A protected method keeps refusing a token that fails validation, so the
// optional-auth fallthrough is per method and not a softened gate.
func TestAuth_ProtectedMethods_StillRefuseAnInvalidToken(t *testing.T) {
	for _, method := range []string{
		"/marketplace.MarketplaceService/ListMyListings",
		"/marketplace.MarketplaceService/PlaceBid",
	} {
		t.Run(method, func(t *testing.T) {
			ctx, err := callAs(t, method, bearer("expired"), func(string) (commonauth.Identity, error) {
				return commonauth.Identity{}, assert.AnError
			})

			assert.Equal(t, codes.Unauthenticated, status.Code(err))
			assert.Nil(t, ctx, "the handler must not run")
		})
	}
}
