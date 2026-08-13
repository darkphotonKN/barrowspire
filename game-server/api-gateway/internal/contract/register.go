package contract

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/gin-gonic/gin"
	authgw "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
)

// Deps carries the group handlers that serialized operations close over.
//
// Every field may hold a nil downstream client. Registration records an
// operation's types and metadata and never invokes a handler, so cmd/openapi
// builds the document without dialing Consul, RabbitMQ, or anything else.
type Deps struct {
	Auth     *authgw.Handler
	AuthAMQP *authgw.AmqpAuthClient

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

	authgw.RegisterOperations(api, deps.Auth, deps.AuthAMQP, MemberID, protect, SeamError)

	// Remaining groups:
	//   I-0010 items · I-0011 notification + stats · I-0012 payment
}
