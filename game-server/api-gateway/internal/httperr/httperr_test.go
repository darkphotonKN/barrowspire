package httperr_test

import (
	"bytes"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// FS-0001 §Requirements 5 — the mapping table, asserted on status, code, AND
// Content-Type. Asserting on status and body alone would let the media type
// silently degrade to application/json (§Requirements 7).
func TestWrite_GRPCStatus_MapsToStatusCodeAndMediaType(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"invalid argument", status.Error(codes.InvalidArgument, "bad field"), http.StatusBadRequest, errcode.ValidationFailed},
		{"not found", status.Error(codes.NotFound, "no such member"), http.StatusNotFound, errcode.NotFound},
		{"already exists", status.Error(codes.AlreadyExists, "taken"), http.StatusConflict, errcode.AlreadyExists},
		{"unauthenticated", status.Error(codes.Unauthenticated, "no token"), http.StatusUnauthorized, errcode.Unauthenticated},
		{"permission denied", status.Error(codes.PermissionDenied, "not yours"), http.StatusForbidden, errcode.Forbidden},
		{"unavailable", status.Error(codes.Unavailable, "dial tcp: connection refused"), http.StatusServiceUnavailable, errcode.ServiceUnavailable},
		{"unmapped code", status.Error(codes.ResourceExhausted, "quota"), http.StatusInternalServerError, errcode.Internal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, w := testsupport.NewCtx()

			httperr.Write(c, "TestOperation", tt.err)

			assert.Equal(t, tt.wantStatus, w.Code)
			assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))

			body := testsupport.Decode(t, w)
			assert.Equal(t, string(tt.wantCode), body["code"])
			assert.Equal(t, float64(tt.wantStatus), body["status"], "status member mirrors the HTTP status")
		})
	}
}

// FS-0001 §Requirements 5 (precedence) and §Edge States — an error that never
// crossed a gRPC boundary still has to resolve to a real status. Without
// sentinel matching every local failure collapses to 500, which is how a
// not-found becomes an incident page.
func TestWrite_LocalSentinel_MapsToStatusAndCode(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"not found", apperr.ErrNotFound, http.StatusNotFound, errcode.NotFound},
		{"already exists", apperr.ErrAlreadyExists, http.StatusConflict, errcode.AlreadyExists},
		{"unauthenticated", apperr.ErrUnauthenticated, http.StatusUnauthorized, errcode.Unauthenticated},
		{"forbidden", apperr.ErrForbidden, http.StatusForbidden, errcode.Forbidden},
		{"validation failed", apperr.ErrValidation, http.StatusBadRequest, errcode.ValidationFailed},
		{"unavailable", apperr.ErrUnavailable, http.StatusServiceUnavailable, errcode.ServiceUnavailable},
		{"wrapped sentinel", fmt.Errorf("loading member: %w", apperr.ErrNotFound), http.StatusNotFound, errcode.NotFound},
		{"unrecognised error", errors.New("something went sideways"), http.StatusInternalServerError, errcode.Internal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, w := testsupport.NewCtx()

			httperr.Write(c, "TestOperation", tt.err)

			assert.Equal(t, tt.wantStatus, w.Code)
			assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))
			assert.Equal(t, string(tt.wantCode), testsupport.Decode(t, w)["code"])
		})
	}
}

// FS-0001 §Requirements 9 — the leak this feature exists to close. The old code
// interpolated status.Message() straight into the response; a downstream message
// can name a table, a service, or a constraint.
func TestWrite_DownstreamMessage_NeverReachesTheClient(t *testing.T) {
	const downstream = "pq: duplicate key value violates unique constraint members_email_key"

	c, w := testsupport.NewCtx()

	httperr.Write(c, "CreateMember", status.Error(codes.AlreadyExists, downstream))

	assert.NotContains(t, w.Body.String(), downstream)
	assert.NotContains(t, w.Body.String(), "members_email_key")
	assert.Equal(t, http.StatusConflict, w.Code)
}

// FS-0001 §Requirements 8 — always present, so the client never null-checks.
// A nil slice marshals to null, which is the bug this guards.
func TestWrite_Errors_IsPresentAndEmpty_NotNull(t *testing.T) {
	c, w := testsupport.NewCtx()

	httperr.Write(c, "TestOperation", apperr.ErrNotFound)

	assert.Contains(t, w.Body.String(), `"errors":[]`)

	errs, ok := testsupport.Decode(t, w)["errors"]
	require.True(t, ok, "errors member must be present")
	assert.NotNil(t, errs, "errors must be [] rather than null")
}

// FS-0001 §API surface — every member is pinned, so absence is a contract break
// even when the value is empty.
func TestWrite_Body_CarriesEveryPinnedMember(t *testing.T) {
	c, w := testsupport.NewCtx()

	httperr.Write(c, "TestOperation", apperr.ErrValidation)

	body := testsupport.Decode(t, w)
	for _, member := range []string{"type", "title", "status", "detail", "code", "errors"} {
		assert.Contains(t, body, member, "problem+json member %q must be present", member)
	}
	assert.Equal(t, "about:blank", body["type"])
}

// FS-0001 §Edge States — an error with an empty message must not produce an
// empty detail. Falling back to status text keeps the body readable.
func TestWrite_EmptyErrorMessage_DetailFallsBackToStatusText(t *testing.T) {
	c, w := testsupport.NewCtx()

	httperr.Write(c, "TestOperation", status.Error(codes.NotFound, ""))

	assert.Equal(t, "Not Found", testsupport.Decode(t, w)["detail"])
}

// FS-0001 §Requirements 11 + §Edge States — I-0002 puts the seam in middleware,
// where it must stop the chain rather than let the handler run on top of an
// already-written error body. Proven here, one slice before anything depends
// on it.
func TestWrite_FromMiddleware_AbortsBeforeTheHandlerRuns(t *testing.T) {
	handlerRan := false

	router := gin.New()
	router.Use(func(c *gin.Context) {
		httperr.Write(c, "AuthMiddleware", apperr.ErrUnauthenticated)
	})
	router.GET("/protected", func(c *gin.Context) {
		handlerRan = true
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/protected", nil))

	assert.False(t, handlerRan, "middleware rejection must abort the chain")
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))
	assert.Equal(t, string(errcode.Unauthenticated), testsupport.Decode(t, w)["code"])
}

// FS-0001 §API surface — detail is specified as "occurrence-specific", but a
// gateway may not echo downstream prose (§Requirements 9) nor restate a
// downstream rule (ADR-0001 §6). Both constraints leave one safe source: a
// message the gateway itself authored about a failure it decided. Without this,
// four distinct auth failures collapse into one "Unauthorized" and a client can
// no longer tell an expired token from a missing one.
func TestWrite_AuthoredDetail_ReachesTheClient(t *testing.T) {
	c, w := testsupport.NewCtx()

	httperr.Write(c, "AuthMiddleware",
		apperr.WithDetail(apperr.ErrUnauthenticated, "Invalid or expired token"))

	body := testsupport.Decode(t, w)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Equal(t, string(errcode.Unauthenticated), body["code"])
	assert.Equal(t, "Invalid or expired token", body["detail"])
	assert.Equal(t, "Unauthorized", body["title"], "title stays the stable status summary")
}

// The wrapper must not break sentinel matching, or attaching a detail would
// silently reroute the error to the 500 catch-all.
func TestWrite_AuthoredDetail_StillMatchesItsSentinel(t *testing.T) {
	c, w := testsupport.NewCtx()

	httperr.Write(c, "TestOperation",
		fmt.Errorf("loading member: %w", apperr.WithDetail(apperr.ErrNotFound, "No such member")))

	body := testsupport.Decode(t, w)
	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Equal(t, string(errcode.NotFound), body["code"])
	assert.Equal(t, "No such member", body["detail"])
}

// A gRPC error carries downstream prose, which is never client-safe. An
// authored detail attached at the gateway must win over the status-text default
// without ever falling back to the wire message.
func TestWrite_AuthoredDetail_NeverFallsBackToWireMessage(t *testing.T) {
	c, w := testsupport.NewCtx()

	httperr.Write(c, "TestOperation", status.Error(codes.NotFound, "members table: row not found"))

	body := testsupport.Decode(t, w)
	assert.Equal(t, "Not Found", body["detail"], "no authored detail means status text, never the wire message")
	assert.NotContains(t, w.Body.String(), "members table")
}

// FS-0001 §Edge States — "panic in a handler". gin.Default()'s stock Recovery
// writes a 500 with NO body at all, so panics bypassed the contract entirely:
// a client got a status and nothing to switch on.
func TestRecovery_PanicInHandler_Returns500ProblemJSON(t *testing.T) {
	router := gin.New()
	router.Use(httperr.Recovery())
	router.GET("/boom", func(c *gin.Context) {
		panic("database handle is nil")
	})

	w := httptest.NewRecorder()
	require.NotPanics(t, func() {
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))
	})

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))
	assert.Equal(t, string(errcode.Internal), testsupport.Decode(t, w)["code"])
}

// A panic message names internals by construction — nil handles, table names,
// file paths. None of it may cross the boundary, and neither may the stack.
func TestRecovery_PanicMessage_NeverReachesTheClient(t *testing.T) {
	router := gin.New()
	router.Use(httperr.Recovery())
	router.GET("/boom", func(c *gin.Context) {
		panic("connection to postgres://gameuser@10.0.0.9/barrowspire failed")
	})

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))

	assert.NotContains(t, w.Body.String(), "postgres://")
	assert.NotContains(t, w.Body.String(), "10.0.0.9")
	assert.NotContains(t, w.Body.String(), "goroutine")
	assert.Equal(t, "Internal Server Error", testsupport.Decode(t, w)["detail"])
}

// Recovery must not interfere with requests that do not panic.
func TestRecovery_NoPanic_LeavesTheResponseAlone(t *testing.T) {
	router := gin.New()
	router.Use(httperr.Recovery())
	router.GET("/fine", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fine", nil))

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"ok":true}`, w.Body.String())
}

// A handler can panic AFTER it has already responded — one forgotten `return`
// after an error write is enough, and 83 error sites are still to be converted
// by hand. c.JSON does not return a response, it sends one: the bytes are on the
// wire and cannot be retracted, so recovery must not try to write a second body
// on top. Doing so produced two concatenated JSON documents behind whatever
// status was already sent, which reads to the client as a success.
func TestRecovery_PanicAfterResponseSent_DoesNotAppendASecondBody(t *testing.T) {
	router := gin.New()
	router.Use(httperr.Recovery())
	router.GET("/late", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"items": []string{"a"}})
		panic("failed after responding")
	})

	w := httptest.NewRecorder()
	require.NotPanics(t, func() {
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/late", nil))
	})

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"items":["a"]}`, w.Body.String(),
		"the already-sent response must be left exactly as it was")
	assert.NotContains(t, w.Body.String(), "about:blank")
	assert.NotContains(t, w.Body.String(), "INTERNAL_ERROR")
}

// FS-0001 §Requirements 9 — the parser's own complaint must reach the log even
// though it must not reach the client. Both halves are asserted: the cause is
// recoverable from the returned error, and the authored detail is what ships.
func TestBindError_KeepsTheCauseAndTellsTheTruth(t *testing.T) {
	type body struct {
		Name string `json:"name" binding:"required"`
	}

	t.Run("malformed json says so", func(t *testing.T) {
		var target body
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":`))
		req.Header.Set("Content-Type", "application/json")
		c, w := testsupport.NewCtx()
		c.Request = req

		bindErr := c.ShouldBindJSON(&target)
		require.Error(t, bindErr)

		httperr.Write(c, "TestOperation", httperr.BindError(bindErr))

		assert.Equal(t, "Request body is not valid JSON", testsupport.Decode(t, w)["detail"])
	})

	t.Run("missing required field does NOT say malformed json", func(t *testing.T) {
		var target body
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		c, w := testsupport.NewCtx()
		c.Request = req

		bindErr := c.ShouldBindJSON(&target)
		require.Error(t, bindErr)

		wrapped := httperr.BindError(bindErr)

		// The cause survives for the log...
		assert.ErrorIs(t, wrapped, apperr.ErrValidation)
		assert.ErrorContains(t, wrapped, "required", "the parser's own complaint must stay in the chain")

		// ...and the client is told something true.
		httperr.Write(c, "TestOperation", wrapped)
		detail := testsupport.Decode(t, w)["detail"]
		assert.Equal(t, "Required fields are missing or invalid", detail)
		assert.NotContains(t, w.Body.String(), "Field validation", "the parser's text stays server-side")
	})
}

// FS-0001 user story 12 — 5xx pages someone, 4xx does not. Implemented since
// I-0001 and never asserted until now.
func TestWrite_LogLevel_SplitsOnStatusClass(t *testing.T) {
	var buf bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	defer slog.SetDefault(original)

	c, _ := testsupport.NewCtx()
	httperr.Write(c, "ClientMistake", apperr.ErrValidation)
	assert.Contains(t, buf.String(), "level=INFO", "a 4xx is the caller's mistake and must not page anyone")

	buf.Reset()
	c2, _ := testsupport.NewCtx()
	httperr.Write(c2, "OurFault", errors.New("boom"))
	assert.Contains(t, buf.String(), "level=ERROR", "a 5xx is ours")
}

// A nil error reaching the seam is always a programming bug. It still produces a
// safe 500, but the log must say plainly that it was nil rather than describing
// a failure that never happened.
func TestWrite_NilError_IsReportedAsAProgrammingFault(t *testing.T) {
	var buf bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	defer slog.SetDefault(original)

	c, w := testsupport.NewCtx()
	httperr.Write(c, "TestOperation", nil)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, buf.String(), "nil error")
}

// A request to a path gin has no route for never reaches a handler, so it never
// reaches the seam either — gin answers it itself with a bare text/plain 404.
// That is the one remaining response the gateway emits that carries no `code`,
// which makes the contract's "every 4xx/5xx is problem+json" claim false for the
// single most common client mistake: a typo'd URL.
func TestNotFoundHandler_UnroutedPath_IsProblemJSON(t *testing.T) {
	router := gin.New()
	router.NoRoute(httperr.NotFoundHandler())

	w := testsupport.Do(router, http.MethodGet, "/api/definitely-not-a-route", "")

	testsupport.AssertProblem(t, w, http.StatusNotFound, string(errcode.NotFound))
}

// A wrong verb on a known path is deliberately NOT handled here. gin's
// HandleMethodNotAllowed defaults to false, so those requests already fall
// through to NoRoute and answer 404 — which this handler now renders as
// problem+json like everything else. Switching them to 405 would change the
// status of live routes: a contract change to be designed in a spec, not a
// repair to be slipped into a fix.
