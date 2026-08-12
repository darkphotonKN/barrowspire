// Package errcode is the platform-wide domain error vocabulary.
//
// HTTP status is the COARSE routing signal; a Code is the precise one. Two failures
// that are both "the request was invalid" share a 400 and differ by Code. Client code
// switches on Code, never on the human-readable detail string — that string is prose
// and is explicitly allowed to change.
//
// STABILITY: a Code is contract. Removing or repurposing one is a breaking change,
// reviewed like removing a response field. ADDING one is non-breaking, so handlers may
// become more specific over time without a coordinated release.
package errcode

type Code string

const (
	// --- Generic starter vocabulary ------------------------------------------
	// These seven are the platform floor: every service can produce them, and they
	// map 1:1 to the status classes a single error-mapping boundary already
	// understands. Keep them even if unused at first — a code added later is
	// non-breaking, but a client that had to invent its own handling for an unnamed
	// failure is not.
	Unauthenticated  Code = "UNAUTHENTICATED"
	ValidationFailed Code = "VALIDATION_FAILED"
	NotFound         Code = "NOT_FOUND"
	AlreadyExists    Code = "ALREADY_EXISTS"
	Forbidden        Code = "FORBIDDEN"
	Internal         Code = "INTERNAL_ERROR"

	// ServiceUnavailable is 503, NOT 500, and that distinction is the whole reason
	// it is named separately.
	//
	// 500 says "your request broke us" — a client must not retry, because the same
	// request will break us again. 503 says "we are temporarily down" — the request
	// was fine, retry is correct, and the response can carry Retry-After.
	// Collapsing a downstream outage into 500 tells every client to give up on a
	// request that would have succeeded a second later, and buries real outages in
	// the same bucket as genuine bugs.
	//
	// Added during I-0003: RequestAvatarUploadHandler already mapped gRPC
	// Unavailable to 503 by hand, and FS-0001's original table would have
	// downgraded it. The spec was amended rather than the handler.
	ServiceUnavailable Code = "SERVICE_UNAVAILABLE"

	// --- Domain-specific ------------------------------------------------------
	// Add codes here as real failures need to be distinguished. The usual trigger:
	// a downstream service rejects something for a specific reason, and the wire
	// between you carries only a string message — so the field-level precision has
	// to live in the code itself rather than in errors[].
	//
	// Name them after the RULE that was broken, not the field that broke it, and
	// record which FS or ADR introduced each one.
	//
)
