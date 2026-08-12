package contract

import "github.com/danielgtaylor/huma/v2"

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
// Registration records an operation's types and metadata; it never invokes a
// handler. So the generator can call this without a downstream connection, and
// handlers may close over clients that are nil at generation time.
//
// Operations are added here one route group at a time (FS-0002 slices 1-4).
func RegisterOperations(api huma.API) {
	// Groups land here as their slices complete:
	//   I-0009 member · I-0010 items · I-0011 notification + stats · I-0012 payment
}
