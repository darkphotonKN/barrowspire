package member_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const refreshTestSecret = "test-secret-for-refresh"

func claimsOf(t *testing.T, token string) jwt.MapClaims {
	t.Helper()
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) {
		return []byte(os.Getenv("JWT_SECRET")), nil
	})
	require.NoError(t, err)
	return claims
}

func refreshTokenFor(t *testing.T, id uuid.UUID) string {
	t.Helper()
	token, err := auth.GenerateJWT(models.Member{ID: id}, commonconstants.Refresh, auth.RefreshTokenTTL)
	require.NoError(t, err)
	return token
}

// FS-ZPX58 §Requirements 1, 4, 5: renewal answers a 60-minute access token
// minted from the member row as it reads NOW, and the member with it. The
// member here was promoted, got a wallet account and verified since signing
// in; none of that is on the refresh token, so it can only come from the row.
func TestRefreshAccessToken_MintsFromTheMemberRowAsItReadsNow(t *testing.T) {
	t.Setenv("JWT_SECRET", refreshTestSecret)
	id := uuid.New()
	accountID := uuid.New()
	verifiedAt := time.Now()
	row := &models.Member{ID: id, Email: "delver@barrowspire.test", Role: "admin", AccountID: &accountID, EmailVerifiedAt: &verifiedAt}

	var lookedUp uuid.UUID
	svc := serviceWith(fakeRepo{getById: func(_ context.Context, got uuid.UUID) (*models.Member, error) {
		lookedUp = got
		return row, nil
	}})

	before := time.Now()
	res, err := svc.RefreshAccessToken(context.Background(), &pb.RefreshAccessTokenRequest{RefreshToken: refreshTokenFor(t, id)})
	require.NoError(t, err)

	assert.Equal(t, id, lookedUp, "the member is re-read by the token's subject")
	assert.Equal(t, int32(3600), res.AccessExpiresIn)
	require.NotNil(t, res.MemberInfo)
	assert.Equal(t, id.String(), res.MemberInfo.Id)
	assert.True(t, res.MemberInfo.EmailVerified)

	claims := claimsOf(t, res.AccessToken)
	assert.Equal(t, "access", claims["tokenType"])
	assert.Equal(t, id.String(), claims["sub"])
	assert.Equal(t, "admin", claims["role"])
	assert.Equal(t, accountID.String(), claims["account_id"])
	assert.Equal(t, true, claims["email_verified"])

	exp, err := claims.GetExpirationTime()
	require.NoError(t, err)
	assert.WithinDuration(t, before.Add(60*time.Minute), exp.Time, 5*time.Second)
}

// FS-ZPX58 §Requirements 2, 3: every refusal is the one ErrUnauthorized, and a
// token that fails to parse never reaches the database.
func TestRefreshAccessToken_Refusals_AreOneUnauthenticated(t *testing.T) {
	t.Setenv("JWT_SECRET", refreshTestSecret)
	id := uuid.New()

	access, err := auth.GenerateJWT(models.Member{ID: id, Role: "player"}, commonconstants.Access, auth.AccessTokenTTL)
	require.NoError(t, err)
	expired, err := auth.GenerateJWT(models.Member{ID: id}, commonconstants.Refresh, -time.Minute)
	require.NoError(t, err)

	for name, token := range map[string]string{
		"expired":         expired,
		"an access token": access,
		"garbage":         "not.a.jwt",
		"empty":           "",
	} {
		t.Run(name, func(t *testing.T) {
			svc := serviceWith(fakeRepo{getById: func(context.Context, uuid.UUID) (*models.Member, error) {
				t.Fatal("a refused token must not reach the database")
				return nil, nil
			}})

			res, err := svc.RefreshAccessToken(context.Background(), &pb.RefreshAccessTokenRequest{RefreshToken: token})

			assert.Nil(t, res)
			assert.ErrorIs(t, err, commonconstants.ErrUnauthorized)
		})
	}
}

// FS-ZPX58 §Requirements 2, 3: a token for a member who no longer exists is
// refused like a forged one, not answered 404.
func TestRefreshAccessToken_UnknownMember_IsUnauthenticatedNotNotFound(t *testing.T) {
	t.Setenv("JWT_SECRET", refreshTestSecret)
	svc := serviceWith(fakeRepo{getById: func(context.Context, uuid.UUID) (*models.Member, error) {
		return nil, fmt.Errorf("get member by id: %w", commonconstants.ErrNotFound)
	}})

	_, err := svc.RefreshAccessToken(context.Background(), &pb.RefreshAccessTokenRequest{RefreshToken: refreshTokenFor(t, uuid.New())})

	assert.ErrorIs(t, err, commonconstants.ErrUnauthorized)
	assert.NotErrorIs(t, err, commonconstants.ErrNotFound)
}

// FS-ZPX58 §Requirements 7: a database blip is an error, never a refusal, so
// it cannot sign every renewing player out.
func TestRefreshAccessToken_LookupFailure_IsNotARefusal(t *testing.T) {
	t.Setenv("JWT_SECRET", refreshTestSecret)
	blip := errors.New("connection reset")
	svc := serviceWith(fakeRepo{getById: func(context.Context, uuid.UUID) (*models.Member, error) {
		return nil, blip
	}})

	_, err := svc.RefreshAccessToken(context.Background(), &pb.RefreshAccessTokenRequest{RefreshToken: refreshTokenFor(t, uuid.New())})

	require.Error(t, err)
	assert.ErrorIs(t, err, blip)
	assert.NotErrorIs(t, err, commonconstants.ErrUnauthorized)
}

// ADR-0066 §1: sign-in and renewal mint the access token with one lifetime.
func TestSignInAndRenewal_AgreeOnTheLifetimes(t *testing.T) {
	t.Setenv("JWT_SECRET", refreshTestSecret)
	m := memberWithPassword(t, "correct horse battery")
	svc := serviceWith(fakeRepo{
		getMemberByEmail: func(context.Context, string) (*models.Member, error) { return m, nil },
		getById:          func(context.Context, uuid.UUID) (*models.Member, error) { return m, nil },
	})

	login, err := svc.LoginMember(context.Background(), &pb.LoginRequest{Email: m.Email, Password: "correct horse battery"})
	require.NoError(t, err)
	renewed, err := svc.RefreshAccessToken(context.Background(), &pb.RefreshAccessTokenRequest{RefreshToken: login.RefreshToken})
	require.NoError(t, err)

	assert.Equal(t, int32(auth.AccessTokenTTL.Seconds()), login.AccessExpiresIn)
	assert.Equal(t, int32(auth.RefreshTokenTTL.Seconds()), login.RefreshExpiresIn)
	assert.Equal(t, login.AccessExpiresIn, renewed.AccessExpiresIn)
}
