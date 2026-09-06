package auth

import (
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims is the shape of every token this platform mints.
//
// It lives in common/ next to NewValidator — the thing that must eventually
// READ these claims — precisely so a minter and a parser cannot drift. A claim
// added here is visible to both sides; a claim added to a jwt.MapClaims literal
// inside one service is visible to nobody else until someone re-reads the minter.
//
// jwt.RegisteredClaims covers sub/exp/iat and cannot carry custom fields, which
// is why it is embedded rather than used directly.
type Claims struct {
	jwt.RegisteredClaims

	// TokenType separates an access credential from a refresh one. Always set.
	TokenType string `json:"tokenType,omitempty"`

	// Role is the member's authorization role: player or admin, the closed set
	// auth-service's CONTEXT.md fixes. Passed through from members.role
	// verbatim — this type does not validate, normalise, or default it.
	//
	// Access tokens only. A refresh token is a credential for re-minting, not
	// for authorization, so leaving this empty there is deliberate.
	Role string `json:"role,omitempty"`

	// AccountID is the member's wallet account, carried so a read can be
	// account-scoped without a lookup.
	//
	// A POINTER, and the reason matters: it is populated eventually, through an
	// event loop, so "not known yet" is a real and common state. With omitempty,
	// nil omits the key ENTIRELY rather than emitting "" — a missing key is
	// unambiguous at the parse boundary, while an empty string invites a
	// truthiness bug in every consumer that reads it. Consumers fail closed on
	// absence (ADR-0014); they must never be handed something that merely looks
	// absent.
	AccountID *uuid.UUID `json:"account_id,omitempty"`
}
