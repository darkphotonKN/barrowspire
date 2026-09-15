package auth

import (
	"context"

	"github.com/google/uuid"
)

// Identity is who an authenticated request is acting as, as read from a
// verified access token. It is the ONE shape every entry point embeds, the
// gateway's HTTP middleware and every service's gRPC interceptor, so a handler
// reads the caller the same way whichever transport it sits behind.
//
// Distinct from Claims: Claims is the wire shape of a token, Identity is what a
// token proves once it has been checked.
type Identity struct {
	MemberID uuid.UUID

	// AccountID is nil when the token carries no account_id. That is a normal
	// state, not a malformed token: the claim is populated eventually (ADR-0014).
	// A consumer that needs an account fails closed on nil.
	AccountID *uuid.UUID

	Role Role
}

// identityKey is an unexported struct type, so no other package can construct
// it, a key collision with some other "member_id" string is impossible.
type identityKey struct{}

// EmbedIdentity returns a child context carrying id. Called by an entry point
// only after the token has been verified.
func EmbedIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, identityKey{}, id)
}

// IdentityFromCtx extracts the caller. false means no entry point authenticated
// this request.
func IdentityFromCtx(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(identityKey{}).(Identity)
	return id, ok
}
