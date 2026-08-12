// Package testsupport holds the HTTP test scaffolding shared by the gateway's
// package tests.
//
// It exists because FS-0001 migrates six handler packages to the error seam, and
// each one needs the same three helpers to assert a problem+json response. Six
// copies would drift, and the assertions they support are contract assertions —
// the drift would be invisible until two packages disagreed about what the
// contract is.
// IMPORTING testing FROM A NON-_test FILE is deliberate and is the same thing
// net/http/httptest does: helpers shared across several packages' tests cannot
// live in a _test file, because _test files are not importable. The cost is that
// a PRODUCTION import of this package would register testing's flags into the
// binary — so nothing outside a _test file may import it. Nothing does.
package testsupport

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// NewCtx returns a gin context backed by a recorder, the way a handler sees one.
// Use it to exercise something that takes a *gin.Context directly; prefer Do
// when the behavior under test involves routing or middleware.
func NewCtx() (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	return c, w
}

// Do sends a request through a fully mounted engine, so routing, middleware, and
// abort semantics are exercised rather than bypassed.
func Do(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

// DoWithHeaders is Do with request headers, for the auth paths.
func DoWithHeaders(r *gin.Engine, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	r.ServeHTTP(w, req)
	return w
}

// Decode fails the test rather than returning an error: a response body that is
// not JSON is never a case worth reasoning about downstream.
func Decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body), "response body must be JSON")
	return body
}

// AssertProblem asserts the three things every error response must carry
// together: the status, the domain code clients switch on, and the media type.
// Asserting any two of the three is how one of them silently regresses.
func AssertProblem(t *testing.T, w *httptest.ResponseRecorder, wantStatus int, wantCode string) map[string]any {
	t.Helper()
	require.Equal(t, wantStatus, w.Code)
	require.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))

	body := Decode(t, w)
	require.Equal(t, wantCode, body["code"])
	require.Contains(t, body, "errors")
	return body
}
