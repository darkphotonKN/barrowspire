package contract_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// protectedOp mounts one typed operation behind Protected(mw) and records what
// the handler saw. Driving it through contract.New proves the real humagin path,
// not a hand-built context.
func protectedOp(mw gin.HandlerFunc, ran *bool, got *commonauth.Identity) *gin.Engine {
	r := gin.New()
	api := contract.New(r)
	huma.Register(api, huma.Operation{
		OperationID: "who",
		Method:      http.MethodGet,
		Path:        "/who",
		Middlewares: huma.Middlewares{contract.Protected(mw)},
	}, func(ctx context.Context, _ *struct{}) (*struct{}, error) {
		*ran = true
		*got, _ = commonauth.IdentityFromCtx(ctx)
		return &struct{}{}, nil
	})
	return r
}

// embedding stands in for AuthMiddleware's success path: it embeds a caller on
// the request context and falls through.
func embedding(id commonauth.Identity) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request = c.Request.WithContext(commonauth.EmbedIdentity(c.Request.Context(), id))
	}
}

// The whole point of dropping the bridge: what the middleware embeds on the
// request context is what the typed handler reads, with nothing copied between.
func TestProtected_HandlerReadsTheIdentityTheMiddlewareEmbedded(t *testing.T) {
	accountID := uuid.New()
	want := commonauth.Identity{MemberID: uuid.New(), AccountID: &accountID, Role: commonauth.RoleAdmin}

	var ran bool
	var got commonauth.Identity
	w := testsupport.Do(protectedOp(embedding(want), &ran, &got), http.MethodGet, "/who", "")

	require.True(t, ran, "an authenticated request must reach the handler")
	assert.Less(t, w.Code, 300)
	assert.Equal(t, want, got)
}

func TestProtected_MiddlewareRejection_HandlerNeverRuns(t *testing.T) {
	reject := func(c *gin.Context) {
		httperr.Write(c, "test", apperr.WithDetail(apperr.ErrUnauthenticated, "nope"))
	}

	var ran bool
	var got commonauth.Identity
	w := testsupport.Do(protectedOp(reject, &ran, &got), http.MethodGet, "/who", "")

	testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
	assert.False(t, ran)
}

// A middleware that passes without embedding a caller is a wiring bug. It must
// be a 401, not a handler run with no caller and not an empty response.
func TestProtected_NoIdentityEmbedded_Returns401(t *testing.T) {
	passWithoutIdentity := func(c *gin.Context) {}

	var ran bool
	var got commonauth.Identity
	w := testsupport.Do(protectedOp(passWithoutIdentity, &ran, &got), http.MethodGet, "/who", "")

	testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
	assert.False(t, ran)
}
