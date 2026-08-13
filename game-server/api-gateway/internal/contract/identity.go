package contract

import (
	"context"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/gin-gonic/gin"
)

// contextKey is unexported so nothing outside this package can write the
// identity a typed handler will read.
type contextKey int

const memberIDKey contextKey = iota

// IdentityBridge copies the caller id that AuthMiddleware put on the gin
// context onto the request's context.Context, where a typed handler can reach
// it.
//
// Typed handlers receive a context.Context, not a *gin.Context, so without this
// they would have to re-derive identity — a second parser of the same token,
// which is how a gateway ends up with two disagreeing answers to "who is
// calling". FS-0002 §Requirements 3 permits exactly one source, and this keeps
// it as AuthMiddleware.
//
// Bridging through the request context rather than reaching into the adapter is
// deliberate: it depends on net/http semantics rather than on humagin
// internals, so replacing the adapter does not silently drop identity.
//
// Register it AFTER AuthMiddleware on protected groups. On public groups it is
// unnecessary and harmless.
func IdentityBridge() gin.HandlerFunc {
	return func(c *gin.Context) {
		if raw, ok := c.Get("userIdStr"); ok {
			if id, ok := raw.(string); ok && id != "" {
				c.Request = c.Request.WithContext(
					context.WithValue(c.Request.Context(), memberIDKey, id),
				)
			}
		}
		c.Next()
	}
}

// Protected adapts the gateway's existing gin auth middleware into a per-
// operation Huma middleware, and bridges the identity it sets onto the typed
// handler's context.
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

		raw, ok := gc.Get("userIdStr")
		if !ok {
			return
		}
		id, ok := raw.(string)
		if !ok || id == "" {
			return
		}

		next(huma.WithValue(ctx, memberIDKey, id))
	}
}

// MemberID returns the authenticated caller's id.
//
// The second result is false when the request never passed through
// AuthMiddleware + IdentityBridge. A handler on a protected route treating that
// as anything other than "unauthenticated" would be trusting a request nobody
// authenticated.
func MemberID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(memberIDKey).(string)
	return id, ok && id != ""
}

// nilSafeProtect: a nil middleware means the caller only wants the document,
// not a running server. Protected handles that by refusing every request rather
// than admitting one — a generator that accidentally served traffic must fail
// closed.
