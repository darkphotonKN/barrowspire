package auth_test

import (
	"context"
	"testing"

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
