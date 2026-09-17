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
