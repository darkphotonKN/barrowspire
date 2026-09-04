package contract

import (
	"github.com/danielgtaylor/huma/v2"
	authgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
	itemgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/item"
	notifgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/notification"
	paygw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/payment"
	statsgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/stats"
	"github.com/gin-gonic/gin"
)

// Deps carries the group handlers that serialized operations close over.
//
// Every field may hold a nil downstream client. Registration records an
// operation's types and metadata and never invokes a handler, so cmd/openapi
// builds the document without dialing Consul, RabbitMQ, or anything else.
type Deps struct {
	Auth         *authgw.Handler
	Items        *itemgw.Handler
	Notification *notifgw.Handler
	Stats        *statsgw.Handler
	Payment      *paygw.Handler

	// AuthMiddleware is the gateway's existing gin JWT middleware. Protected
	// operations run it per-operation; see Protected. Nil is legal and means
	// "generate the document without wiring auth", which is what cmd/openapi
	// does — the middleware affects behavior, never the described shape.
	AuthMiddleware gin.HandlerFunc
}

// RegisterOperations declares every serialized operation on the API.
//
// It is called from two places and must stay callable from both:
//
//   - SetupRouter, so the running server serves these operations;
//   - cmd/openapi, so the generated document describes exactly what the server
//     serves.
//
// That shared call is the whole point. A generator with its own list of routes
// is a second source of truth, and the two drift the first time someone adds an
// operation to one of them — producing a spec that is confidently wrong, which
// is worse than no spec because CI would still be green.
//
// Groups land here one slice at a time (FS-0002 slices 1-4).
func RegisterOperations(api huma.API, deps Deps) {
	protect := Protected(deps.AuthMiddleware)

	authgw.RegisterOperations(api, deps.Auth, MemberID, protect, SeamError, Secured)
	itemgw.RegisterOperations(api, deps.Items, MemberID, protect, SeamError, Secured)
	notifgw.RegisterOperations(api, deps.Notification, MemberID, protect, SeamError, Secured)
	statsgw.RegisterOperations(api, deps.Stats, SeamError)
	paygw.RegisterOperations(api, deps.Payment, MemberID, protect, SeamError, Secured)

	// The Stripe webhook is deliberately NOT here — FS-0002 §Out of Scope.
}
