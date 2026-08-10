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
	// These six are the platform floor: every service can produce them, and they map
	// 1:1 to the status classes a single error-mapping boundary already understands.
	// Keep them even if unused at first — a code added later is non-breaking, but a
	// client that had to invent its own handling for an unnamed failure is not.
	Unauthenticated  Code = "UNAUTHENTICATED"
	ValidationFailed Code = "VALIDATION_FAILED"
	NotFound         Code = "NOT_FOUND"
	AlreadyExists    Code = "ALREADY_EXISTS"
	Forbidden        Code = "FORBIDDEN"
	Internal         Code = "INTERNAL_ERROR"

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
