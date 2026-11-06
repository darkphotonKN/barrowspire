package auth_test

import (
	"os"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-secret-for-minting"

// decode parses a minted token back into its raw claim map.
//
// Deliberately a MAP rather than the typed Claims struct: these tests assert
// what actually goes on the wire, and decoding into the same type that minted
// it would make an omitted key and a zero-valued one indistinguishable — which
// is the single property §Requirements 4 turns on.
func decode(t *testing.T, tokenStr string) jwt.MapClaims {
	t.Helper()
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(tokenStr, &claims, func(*jwt.Token) (any, error) {
		return []byte(os.Getenv("JWT_SECRET")), nil
	})
	require.NoError(t, err, "a minted token must parse with the signing secret")
	return claims
}

// FS-9KW9F §Requirements 1-2. The role is read off the models.Member the minter
// already receives, so this costs no query and no new I/O.
func TestGenerateJWT_AccessToken_CarriesRole(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	for _, role := range []string{"player", "admin"} {
		t.Run(role, func(t *testing.T) {
			member := models.Member{ID: uuid.New(), Role: role}

			token, err := auth.GenerateJWT(member, commonconstants.Access, time.Hour)
			require.NoError(t, err)

			assert.Equal(t, role, decode(t, token)["role"])
		})
	}
}

// FS-9KW9F §Requirements 3. Present only when the member actually has one.
func TestGenerateJWT_AccessToken_CarriesAccountIDWhenKnown(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	accountID := uuid.New()
	member := models.Member{ID: uuid.New(), Role: "player", AccountID: &accountID}

	token, err := auth.GenerateJWT(member, commonconstants.Access, time.Hour)
	require.NoError(t, err)

	assert.Equal(t, accountID.String(), decode(t, token)["account_id"])
}

// FS-9KW9F §Requirements 4, §Edge States. The claim is ABSENT, not empty.
//
// This is the assertion the whole design turns on. A member without a wallet
// account is the normal case — nothing populates the column until the
// account.created consumer lands, and no member has ever had an account — so
// this is not an edge case but the default path. Consumers fail closed on an
// absent claim; handing them "" would let a truthiness check silently pass.
func TestGenerateJWT_AccessToken_OmitsAccountIDWhenUnknown(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	member := models.Member{ID: uuid.New(), Role: "player"} // AccountID nil

	token, err := auth.GenerateJWT(member, commonconstants.Access, time.Hour)
	require.NoError(t, err)

	claims := decode(t, token)
	_, present := claims["account_id"]
	assert.False(t, present,
		"account_id must be absent from the claim map, not present-and-empty")
}

// FS-9KW9F §Requirements 5. Refresh tokens carry no authorization claims, so a
// future redemption endpoint is forced to re-read the member rather than
// trusting a seven-day-old role.
func TestGenerateJWT_RefreshToken_CarriesNoAuthorizationClaims(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	accountID := uuid.New()
	member := models.Member{ID: uuid.New(), Role: "admin", AccountID: &accountID}

	token, err := auth.GenerateJWT(member, commonconstants.Refresh, 7*24*time.Hour)
	require.NoError(t, err)

	claims := decode(t, token)
	_, hasRole := claims["role"]
	_, hasAccount := claims["account_id"]
	assert.False(t, hasRole, "a refresh token must not carry role")
	assert.False(t, hasAccount, "a refresh token must not carry account_id")
}

// FS-9KW9F §Requirements 5, and the acceptance criterion that the refresh claim
// map is byte-identical to today's. Asserted as an exact key set: adding a claim
// to the refresh token later should fail HERE, loudly, rather than quietly
// widening a long-lived credential.
func TestGenerateJWT_RefreshToken_ClaimKeysAreExactlyTheOriginalFour(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	accountID := uuid.New()
	member := models.Member{ID: uuid.New(), Role: "admin", AccountID: &accountID}

	token, err := auth.GenerateJWT(member, commonconstants.Refresh, 7*24*time.Hour)
	require.NoError(t, err)

	keys := make([]string, 0, 4)
	for k := range decode(t, token) {
		keys = append(keys, k)
	}
	assert.ElementsMatch(t, []string{"sub", "exp", "iat", "tokenType"}, keys)
}

// FS-9KW9F §Requirements: sub, exp, iat and tokenType are unchanged in name,
// type, and value semantics. Moving from a jwt.MapClaims literal to a typed
// struct is exactly the kind of change that can silently rename a key or turn a
// numeric date into a string.
func TestGenerateJWT_RegisteredClaims_KeepTheirNamesAndSemantics(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)

	id := uuid.New()
	member := models.Member{ID: id, Role: "player"}

	token, err := auth.GenerateJWT(member, commonconstants.Access, time.Hour)
	require.NoError(t, err)

	claims := decode(t, token)
	assert.Equal(t, id.String(), claims["sub"], "subject stays the member id, under `sub`")
	assert.Equal(t, string(commonconstants.Access), claims["tokenType"])

	exp, expOK := claims["exp"].(float64)
	iat, iatOK := claims["iat"].(float64)
	require.True(t, expOK, "exp must stay a JSON number, not become a string")
	require.True(t, iatOK, "iat must stay a JSON number, not become a string")
	assert.InDelta(t, time.Hour.Seconds(), exp-iat, 2,
		"the requested expiration must survive the move to a typed struct")
}

// FS-V6SFK §Requirements 21. The access token carries email_verified: true only
// for a verified member; for an unverified one the key is absent, not false, so
// a consumer reading a missing key fails closed. Refresh tokens stay claim-free.
func TestGenerateJWT_EmailVerifiedClaim(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)
	verifiedAt := time.Now()

	tests := []struct {
		name        string
		verifiedAt  *time.Time
		tokenType   commonconstants.TokenType
		wantPresent bool
	}{
		{"verified access token carries true", &verifiedAt, commonconstants.Access, true},
		{"unverified access token omits the key", nil, commonconstants.Access, false},
		{"verified refresh token omits the key", &verifiedAt, commonconstants.Refresh, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			member := models.Member{ID: uuid.New(), Role: "player", EmailVerifiedAt: tt.verifiedAt}

			token, err := auth.GenerateJWT(member, tt.tokenType, time.Hour)
			require.NoError(t, err)

			got, present := decode(t, token)["email_verified"]
			assert.Equal(t, tt.wantPresent, present)
			if tt.wantPresent {
				assert.Equal(t, true, got)
			}
		})
	}
}

// ADR-0066 §1: two lifetimes, defined once. Sign-in, verification and renewal
// all mint from these, so a third lifetime (the deleted 15-minute path) cannot
// come back unnoticed.
func TestTokenLifetimes_AreTheOnesADR0066Fixes(t *testing.T) {
	assert.Equal(t, 60*time.Minute, auth.AccessTokenTTL)
	assert.Equal(t, 7*24*time.Hour, auth.RefreshTokenTTL)
}

func signed(t *testing.T, method jwt.SigningMethod, claims jwt.Claims, secret string) string {
	t.Helper()
	token, err := jwt.NewWithClaims(method, claims).SignedString([]byte(secret))
	require.NoError(t, err)
	return token
}

// FS-ZPX58 §Requirements 2: a refresh token is redeemable only when it is
// HS256 with the platform secret, unexpired, typed refresh, and names a member
// by UUID. Everything else is refused, whatever the reason.
func TestParseRefreshToken(t *testing.T) {
	t.Setenv("JWT_SECRET", testSecret)
	memberID := uuid.New()
	now := time.Now()

	refreshClaims := func(sub string, exp time.Time) jwt.MapClaims {
		return jwt.MapClaims{"sub": sub, "exp": exp.Unix(), "iat": now.Unix(), "tokenType": "refresh"}
	}

	minted, err := auth.GenerateJWT(models.Member{ID: memberID, Role: "player"}, commonconstants.Refresh, auth.RefreshTokenTTL)
	require.NoError(t, err)
	mintedAccess, err := auth.GenerateJWT(models.Member{ID: memberID, Role: "player"}, commonconstants.Access, auth.AccessTokenTTL)
	require.NoError(t, err)

	noneToken, err := jwt.NewWithClaims(jwt.SigningMethodNone, refreshClaims(memberID.String(), now.Add(time.Hour))).
		SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)

	tests := []struct {
		name    string
		token   string
		wantErr bool
	}{
		{name: "a refresh token minted at sign-in", token: minted},
		{name: "a hand-signed refresh token", token: signed(t, jwt.SigningMethodHS256, refreshClaims(memberID.String(), now.Add(time.Hour)), testSecret)},
		{name: "expired", token: signed(t, jwt.SigningMethodHS256, refreshClaims(memberID.String(), now.Add(-time.Minute)), testSecret), wantErr: true},
		{name: "no expiry", token: signed(t, jwt.SigningMethodHS256, jwt.MapClaims{"sub": memberID.String(), "tokenType": "refresh"}, testSecret), wantErr: true},
		{name: "wrong secret", token: signed(t, jwt.SigningMethodHS256, refreshClaims(memberID.String(), now.Add(time.Hour)), "not-the-secret"), wantErr: true},
		{name: "HS512, not HS256", token: signed(t, jwt.SigningMethodHS512, refreshClaims(memberID.String(), now.Add(time.Hour)), testSecret), wantErr: true},
		{name: "alg none", token: noneToken, wantErr: true},
		{name: "an access token presented as a refresh token", token: mintedAccess, wantErr: true},
		{name: "no token type", token: signed(t, jwt.SigningMethodHS256, jwt.MapClaims{"sub": memberID.String(), "exp": now.Add(time.Hour).Unix()}, testSecret), wantErr: true},
		{name: "sub not a uuid", token: signed(t, jwt.SigningMethodHS256, refreshClaims("not-a-uuid", now.Add(time.Hour)), testSecret), wantErr: true},
		{name: "garbage", token: "not.a.jwt", wantErr: true},
		{name: "empty", token: "", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := auth.ParseRefreshToken(tt.token)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, uuid.Nil, got)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, memberID, got)
		})
	}
}
