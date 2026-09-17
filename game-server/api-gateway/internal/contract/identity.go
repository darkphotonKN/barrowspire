package contract

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/gin-gonic/gin"
)

// opProtected names this gate in the seam's server-side logs.
const opProtected = "Protected"

// Protected adapts the gateway's existing gin auth middleware into a per-
// operation Huma middleware.
//
// Why per-operation rather than a route group: Huma registers on the ENGINE, so
// a middleware attached to gin's /api/member group never runs for a serialized
// operation. humagin.NewWithGroup would scope the whole API to one group, which
// cannot express a document containing both public and protected operations.
// Declaring protection on the operation also makes it visible where the
// operation is defined, instead of implied by route-registration order.
//
// mw is invoked directly rather than through gin's chain. That is safe because
// AuthMiddleware writes-and-returns on failure (the seam aborts) and falls
// through on success — it never calls c.Next() itself, so there is no chain to
// re-enter and no risk of running the endpoint twice.
//
// There is no identity to copy across. The middleware embeds the caller on the
// request's context.Context, and a typed handler's ctx is that same request
// context — humagin reads it live — so the handler reaches the caller with
// commonauth.IdentityFromCtx. One source of "who is calling" (FS-NTPW2
// §Requirements 3), and it is the middleware.
func Protected(mw gin.HandlerFunc) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		if mw == nil {
			// Fail closed: see nilSafeProtect.
			return
		}

		gc := humagin.Unwrap(ctx)

		mw(gc)
		if gc.IsAborted() {
			// The seam already wrote a problem+json 401. Returning without
			// calling next is what stops the handler from running.
			return
		}

		// A middleware that passed without embedding a caller is a wiring bug.
		// Refuse loudly: never run the handler, and never answer with an empty
		// response that nobody wrote.
		if _, ok := commonauth.IdentityFromCtx(gc.Request.Context()); !ok {
			httperr.Write(gc, opProtected, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Not authenticated"))
			return
		}

		next(ctx)
	}
}

// nilSafeProtect: a nil middleware means the caller only wants the document,
// not a running server. Protected handles that by refusing every request rather
// than admitting one — a generator that accidentally served traffic must fail
// closed.
