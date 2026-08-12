package auth_test

import (
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
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

// FS-0001 §Requirements 11 and §Edge States — all four rejection paths emit
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

// FS-0001 §API surface — detail is occurrence-specific. Four rejections that all
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

// FS-0001 §Requirements 9 — the middleware owns these failures, so its own
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
func TestAuthMiddleware_ValidToken_PassesAndSetsIdentity(t *testing.T) {
	id := uuid.New()
	token := signedToken(t, jwt.MapClaims{"sub": id.String()}, testSecret)

	var gotUserID any
	var gotUserIDStr any
	handlerRan := false

	r := gin.New()
	r.Use(auth.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		handlerRan = true
		gotUserID, _ = c.Get("userId")
		gotUserIDStr, _ = c.Get("userIdStr")
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := testsupport.DoWithHeaders(r, http.MethodGet, "/protected", "", bearer(token))

	require.True(t, handlerRan, "a valid token must reach the handler")
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, id, gotUserID)
	assert.Equal(t, id.String(), gotUserIDStr)
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
