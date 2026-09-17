package auth_test

import (
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSecret = "test-secret-for-jwt-middleware"

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	os.Setenv("JWT_SECRET", testSecret)
	os.Exit(m.Run())
}

// protectedRouter mounts the middleware ahead of a handler that records whether
// it ran. Middleware rejection must abort, and "aborted" is only observable by
// asking whether what came after it executed.
func protectedRouter(handlerRan *bool) *gin.Engine {
	r := gin.New()
	r.Use(auth.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		*handlerRan = true
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return r
}

func signedToken(t *testing.T, claims jwt.MapClaims, secret string) string {
	t.Helper()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	require.NoError(t, err)
	return token
}

func bearer(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

// FS-22WKC §Requirements 11 and §Edge States — all four rejection paths emit
// 401 UNAUTHENTICATED in problem+json. The middleware aborts before any handler
// runs, so these never touch the seam through a handler.
func TestAuthMiddleware_RejectionPaths_Return401ProblemJSON(t *testing.T) {
	expired := signedToken(t, jwt.MapClaims{
		"sub": uuid.NewString(),
		"exp": time.Now().Add(-time.Hour).Unix(),
	}, testSecret)

	wrongSecret := signedToken(t, jwt.MapClaims{"sub": uuid.NewString()}, "not-the-secret")
	noSub := signedToken(t, jwt.MapClaims{"foo": "bar"}, testSecret)
	badUUID := signedToken(t, jwt.MapClaims{"sub": "not-a-uuid"}, testSecret)
	noRole := signedToken(t, jwt.MapClaims{"sub": uuid.NewString()}, testSecret)
	badAccountID := signedToken(t, jwt.MapClaims{
		"sub": uuid.NewString(), "role": "player", "account_id": "not-a-uuid",
	}, testSecret)
	numericAccountID := signedToken(t, jwt.MapClaims{
		"sub": uuid.NewString(), "role": "player", "account_id": 12345,
	}, testSecret)

	tests := []struct {
		name    string
		headers map[string]string
	}{
		{name: "no authorization header", headers: nil},
		{name: "header without bearer prefix", headers: map[string]string{"Authorization": "Token abc"}},
		{name: "malformed token", headers: bearer("not.a.jwt")},
		{name: "expired token", headers: bearer(expired)},
		{name: "signed with the wrong secret", headers: bearer(wrongSecret)},
		{name: "claims without sub", headers: bearer(noSub)},
		{name: "sub is not a uuid", headers: bearer(badUUID)},
		// FS-F9R7Q §Requirement 29: every access token carries a role, so a token
		// without one is unauthorizable — never a fall-through to member scoping.
		{name: "claims without role", headers: bearer(noRole)},
		// Absent account_id is normal (ADR-0014); present-but-broken is not.
		{name: "account_id is not a uuid", headers: bearer(badAccountID)},
		{name: "account_id is not a string", headers: bearer(numericAccountID)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handlerRan := false

			w := testsupport.DoWithHeaders(protectedRouter(&handlerRan), http.MethodGet, "/protected", "", tt.headers)

			body := testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
			assert.False(t, handlerRan, "rejection must abort before the handler")
			assert.NotEmpty(t, body["detail"], "every rejection keeps an authored, client-safe detail")
		})
	}
}

// FS-22WKC §API surface — detail is occurrence-specific. Four rejections that all
// mean "401" must remain tellable apart, or the client loses the ability to
// refresh on expiry rather than bounce the user to a login screen.
func TestAuthMiddleware_RejectionDetails_AreDistinguishable(t *testing.T) {
	expired := signedToken(t, jwt.MapClaims{
		"sub": uuid.NewString(),
		"exp": time.Now().Add(-time.Hour).Unix(),
	}, testSecret)

	seen := map[string]string{}

	for name, headers := range map[string]map[string]string{
		"missing":  nil,
		"expired":  bearer(expired),
		"no sub":   bearer(signedToken(t, jwt.MapClaims{"foo": "bar"}, testSecret)),
		"bad uuid": bearer(signedToken(t, jwt.MapClaims{"sub": "not-a-uuid"}, testSecret)),
	} {
		handlerRan := false
		w := testsupport.DoWithHeaders(protectedRouter(&handlerRan), http.MethodGet, "/protected", "", headers)
		detail := fmt.Sprint(testsupport.Decode(t, w)["detail"])

		if other, clash := seen[detail]; clash {
			t.Fatalf("%q and %q both report detail %q — the client cannot tell them apart", name, other, detail)
		}
		seen[detail] = name
	}
}

// FS-22WKC §Requirements 9 — the middleware owns these failures, so its own
// prose is publishable, but nothing about the token itself may be echoed back.
func TestAuthMiddleware_DoesNotEchoTheToken(t *testing.T) {
	const secretish = "eyJhbGciOiJIUzI1NiJ9.SUPERSECRETPAYLOAD.sig"
	handlerRan := false

	w := testsupport.DoWithHeaders(protectedRouter(&handlerRan), http.MethodGet, "/protected", "", bearer(secretish))

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.NotContains(t, w.Body.String(), "SUPERSECRETPAYLOAD")
	assert.NotContains(t, w.Body.String(), secretish)
}

// A valid token must still pass, with the context values later handlers depend
// on. The rewrite touches every branch of this middleware, so the happy path is
// the regression most worth pinning.
//
// The fixture carries role and account_id because a real access token does:
// FS-9KW9F mints both, and FS-F9R7Q §Requirement 29 makes a token without a role
// unauthorizable rather than a caller to default. A sub-only token is not the
// happy path any more.
func TestAuthMiddleware_ValidToken_PassesAndSetsIdentity(t *testing.T) {
	id := uuid.New()
	accountID := uuid.New()
	token := signedToken(t, jwt.MapClaims{
		"sub":        id.String(),
		"role":       "player",
		"account_id": accountID.String(),
	}, testSecret)

	var gotIdentity commonauth.Identity
	var gotIdentityOK bool
	handlerRan := false

	r := gin.New()
	r.Use(auth.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		handlerRan = true
		gotIdentity, gotIdentityOK = commonauth.IdentityFromCtx(c.Request.Context())
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := testsupport.DoWithHeaders(r, http.MethodGet, "/protected", "", bearer(token))

	require.True(t, handlerRan, "a valid token must reach the handler")
	assert.Equal(t, http.StatusOK, w.Code)

	require.True(t, gotIdentityOK, "the middleware must embed an identity the downstream extractor can read")
	assert.Equal(t, commonauth.Identity{
		MemberID:  id,
		AccountID: &accountID,
		Role:      commonauth.RolePlayer,
	}, gotIdentity)
}

// ADR-0014: a member whose account has not landed yet still authenticates. The
// middleware must not reject; it embeds nil so the operation that needs an
// account is the one that fails closed.
func TestAuthMiddleware_TokenWithoutAccountID_PassesWithNilAccount(t *testing.T) {
	token := signedToken(t, jwt.MapClaims{"sub": uuid.NewString(), "role": "player"}, testSecret)

	var gotIdentity commonauth.Identity
	handlerRan := false

	r := gin.New()
	r.Use(auth.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		handlerRan = true
		gotIdentity, _ = commonauth.IdentityFromCtx(c.Request.Context())
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := testsupport.DoWithHeaders(r, http.MethodGet, "/protected", "", bearer(token))

	require.True(t, handlerRan)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Nil(t, gotIdentity.AccountID)
}

// Regression: `sub` is attacker-influenced and need not be a string. The
// previous code did a bare type assertion on it, so a token carrying sub as a
// number panicked inside the middleware — an unauthenticated caller crashing a
// request. It now routes to the same 401 as any other unusable claim.
func TestAuthMiddleware_NonStringSubClaim_Returns401AndDoesNotPanic(t *testing.T) {
	token := signedToken(t, jwt.MapClaims{"sub": 12345}, testSecret)
	handlerRan := false

	require.NotPanics(t, func() {
		w := testsupport.DoWithHeaders(protectedRouter(&handlerRan), http.MethodGet, "/protected", "", bearer(token))
		testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
	})
	assert.False(t, handlerRan)
}
