// Package apperr is the platform-wide vocabulary of failure *kinds*.
//
// It is the counterpart to errcode: errcode names a failure on the wire, apperr
// names it in Go. A service returns (or wraps) one of these sentinels; the
// gateway's error seam matches on them with errors.Is and turns them into an
// HTTP status and an errcode.Code.
//
// It lives in common/ rather than in the gateway so that the ten downstream
// services can adopt it without a move. They do not use it yet — they return
// opaque gRPC errors and the gateway maps those instead. That is deliberate
// scope (FS-0001 §Out of Scope), not an omission.
//
// STABILITY: these are matched with errors.Is across module boundaries. Removing
// or repurposing one changes behavior in every caller that wraps it, so treat the
// set the way errcode.Code is treated — adding is safe, changing is not.
package apperr

import "errors"

var (
	// ErrNotFound — the addressed thing does not exist. Distinct from an empty
	// collection, which is a success.
	ErrNotFound = errors.New("not found")

	// ErrAlreadyExists — the thing being created is already there. Distinct
	// from a validation failure: the input was well-formed, the world disagreed.
	ErrAlreadyExists = errors.New("already exists")

	// ErrUnauthenticated — no identity, or an identity that cannot be verified.
	// Who are you, not what may you do.
	ErrUnauthenticated = errors.New("unauthenticated")

	// ErrForbidden — a verified identity that is not allowed to do this. What
	// may you do, not who are you.
	ErrForbidden = errors.New("forbidden")

	// ErrValidation — the input itself is wrong. Domain validation, decided by
	// the service that owns the rule; shape validation belongs at the boundary
	// and carries 422 instead (ADR-0001 §7).
	ErrValidation = errors.New("validation failed")
)

// WithDetail attaches a client-safe, occurrence-specific message to err.
//
// This is the ONLY way occurrence-specific prose reaches a response body, and it
// exists because the two obvious sources are both closed: downstream error text
// is never client-safe (FS-0001 §Requirements 9), and the gateway may not restate
// a downstream service's rule (ADR-0001 §6). What remains is a message the caller
// authored about a failure it decided itself — a missing Authorization header, a
// token it could not parse.
//
// CONTRACT FOR CALLERS: pass only strings you wrote as literals. Never pass
// err.Error(), a downstream message, or anything interpolated from one. The
// sentinel is still matched through the wrapper, so the resulting status and
// errcode.Code are unchanged; only detail differs.
//
// detail is prose, not contract — clients display it and switch on code.
func WithDetail(err error, detail string) error {
	if err == nil {
		return nil
	}
	return &detailedError{err: err, detail: detail}
}

// DetailOf returns the client-safe detail attached anywhere in err's chain, and
// whether one was found. The outermost detail wins: a caller adding context
// closer to the response is being more specific, not less.
func DetailOf(err error) (string, bool) {
	var d *detailedError
	if errors.As(err, &d) {
		return d.detail, true
	}
	return "", false
}

// detailedError carries a client-safe message alongside an error without
// disturbing errors.Is matching against the sentinel underneath.
type detailedError struct {
	err    error
	detail string
}

func (d *detailedError) Error() string { return d.detail + ": " + d.err.Error() }

func (d *detailedError) Unwrap() error { return d.err }
