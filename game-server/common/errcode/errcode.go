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
	// Added during I-22WKC-3: RequestAvatarUploadHandler already mapped gRPC
	// Unavailable to 503 by hand, and FS-22WKC's original table would have
	// downgraded it. The spec was amended rather than the handler.
	ServiceUnavailable Code = "SERVICE_UNAVAILABLE"

	// FailedPrecondition is 400 with a valid request: the resource's own state
	// refuses it. An FSM transition that is not allowed from the current state,
	// a bid on an ended listing. Distinct from VALIDATION_FAILED, which means the
	// request itself was wrong: the client fixes one by changing the payload, the
	// other by re-reading state.
	//
	// Named after gRPC's canonical FAILED_PRECONDITION rather than HTTP's
	// "Precondition Failed" so nobody reads it as 412, which is about
	// conditional-request headers and is not what this is.
	//
	// Added for FS-0YXG6 (Marketplace HTTP surface).
	FailedPrecondition Code = "FAILED_PRECONDITION"

	// Conflict is 409 from optimistic-locking contention that outlasted the
	// server's own retries. The server already re-read and re-evaluated the
	// request internally, so retrying is safe: every rule is checked again
	// against fresh state. A retried write must reuse its Idempotency-Key.
	//
	// Added for FS-0YXG6 (Marketplace HTTP surface).
	Conflict Code = "CONFLICT"

	// --- Domain-specific ------------------------------------------------------
	// Add codes here as real failures need to be distinguished. The usual trigger:
	// a downstream service rejects something for a specific reason, and the wire
	// between you carries only a string message — so the field-level precision has
	// to live in the code itself rather than in errors[].
	//
	// Name them after the RULE that was broken, not the field that broke it, and
	// record which FS or ADR introduced each one.
	//
	// Each one is a domain refusal: the owning service decides it and answers
	// with Refuse (refusal.go); the gateway passes the code through as 400. A
	// code added here must also be listed in domainCodes below, or Refuse
	// answers Internal for it.

	// BagFull: the write would grow the member's bag at or over its 30
	// instances. Added for FS-VPD8Y (Town stash).
	BagFull Code = "BAG_FULL"

	// StashFull: the write would grow the member's stash at or over its 60
	// instances. Added for FS-VPD8Y (Town stash).
	StashFull Code = "STASH_FULL"

	// ItemNotAvailable: the item's status is not AVAILABLE (listed, in escrow,
	// pending settlement), so it cannot be moved. Added for FS-VPD8Y (Town
	// stash).
	ItemNotAvailable Code = "ITEM_NOT_AVAILABLE"

	// ItemWorn: the item is in the member's loadout, so it is not in the bag
	// or the stash to move. Added for FS-VPD8Y (Town stash).
	ItemWorn Code = "ITEM_WORN"

	// PasswordTooShort: a password being set has fewer than 10 characters,
	// counted as Unicode code points. Checked only when a password is set
	// (signup, password change), never at login (ADR-0041). Added for
	// FS-V6SFK (Signup hardening).
	PasswordTooShort Code = "PASSWORD_TOO_SHORT"

	// PasswordTooLong: a password being set is over 72 bytes in UTF-8, the
	// most bcrypt reads (ADR-0041). Added for FS-V6SFK (Signup hardening).
	PasswordTooLong Code = "PASSWORD_TOO_LONG"

	// PasswordTooCommon: a password being set is on auth-service's embedded
	// common-password list, compared case-insensitively (ADR-0041). Added for
	// FS-V6SFK (Signup hardening).
	PasswordTooCommon Code = "PASSWORD_TOO_COMMON"

	// EmailInvalid: an email, once trimmed and lowercased, is not a bare
	// address net/mail parses back to itself, or is over 254 bytes. Added for
	// FS-V6SFK (Signup hardening).
	EmailInvalid Code = "EMAIL_INVALID"

	// VerificationCodeInvalid: the verification code entered does not match
	// the member's live code. The wrong try is counted, and the 5th burns the
	// code. Added for FS-V6SFK (Signup hardening).
	VerificationCodeInvalid Code = "VERIFICATION_CODE_INVALID"

	// VerificationCodeExpired: the member has no live verification code: it
	// was never issued, is past its 15 minutes, or was burned by wrong tries.
	// The client offers a resend. Added for FS-V6SFK (Signup hardening).
	VerificationCodeExpired Code = "VERIFICATION_CODE_EXPIRED"

	// VerificationResendTooSoon: a new verification code was asked for within
	// 60 seconds of the last one, by resend or by an email change. Added for
	// FS-V6SFK (Signup hardening).
	VerificationResendTooSoon Code = "VERIFICATION_RESEND_TOO_SOON"

	// EmailAlreadyVerified: the member is already verified, so there is no
	// code to resend and the email can no longer be changed this way. Added
	// for FS-V6SFK (Signup hardening).
	EmailAlreadyVerified Code = "EMAIL_ALREADY_VERIFIED"

	// EmailUnverified: the caller's access token does not carry
	// email_verified, so marketplace-service refuses listing, bidding and
	// buyout. Withdraw, accept and reads stay open. Added for FS-V6SFK
	// (Signup hardening).
	EmailUnverified Code = "EMAIL_UNVERIFIED"

	// --- Mailbox (FS-1GZGD) ----------------------------------------------------
	// Decided by notification-service, which owns the letter rules; the
	// gateway passes them through and restates none.

	// LetterTitleInvalid: a letter's title, trimmed, is not 1-60 characters
	// (runes). FS-1GZGD R3.
	LetterTitleInvalid Code = "LETTER_TITLE_INVALID"

	// LetterBodyInvalid: a letter's body, trimmed, is not 1-2000 characters
	// (runes). FS-1GZGD R3.
	LetterBodyInvalid Code = "LETTER_BODY_INVALID"

	// LetterExpiryInvalid: a given expiry is not later than now. FS-1GZGD R5.
	LetterExpiryInvalid Code = "LETTER_EXPIRY_INVALID"

	// EnclosureInvalid: a letter's enclosures break a bound (more than 10,
	// more than one gold, a quantity outside 1-60, gold below 1, a slot count
	// over 60, an item level below 1) or an item cannot be represented.
	// FS-1GZGD S1, A3.
	EnclosureInvalid Code = "ENCLOSURE_INVALID"

	// UnknownItemTemplate: a template enclosure names no item template.
	// FS-1GZGD R4.
	UnknownItemTemplate Code = "UNKNOWN_ITEM_TEMPLATE"

	// UnknownItemInstance: a copy enclosure names no item instance.
	// FS-1GZGD A3.
	UnknownItemInstance Code = "UNKNOWN_ITEM_INSTANCE"

	// LetterRecipientsInvalid: a member list holds no id, or more than 1000
	// distinct ids. FS-1GZGD A6, R47.
	LetterRecipientsInvalid Code = "LETTER_RECIPIENTS_INVALID"

	// LetterExpired: the letter is past its expiry, so no write may touch it.
	// FS-1GZGD R5.
	LetterExpired Code = "LETTER_EXPIRED"

	// NothingToClaim: the letter has no enclosures. FS-1GZGD R13.
	NothingToClaim Code = "NOTHING_TO_CLAIM"

	// LetterAlreadyClaimed: the member already claimed this letter.
	// FS-1GZGD R25.
	LetterAlreadyClaimed Code = "LETTER_ALREADY_CLAIMED"

	// LetterClaimInProgress: another claim of this letter by this member holds
	// it right now. FS-1GZGD R25, S5.
	LetterClaimInProgress Code = "LETTER_CLAIM_IN_PROGRESS"

	// --- Marketplace ------------------------------------------------------------

	// LeadingBidLowered: the listing's WINNING bid is below the accept floor,
	// the leading bid the seller was shown when they accepted, so nothing is
	// sold. The client re-reads the listing. Decided by marketplace-service.
	// Added for FS-F692V (Accept never sells below the leading bid shown).
	LeadingBidLowered Code = "LEADING_BID_LOWERED"

	// BidWithdrawLimitReached: the member has withdrawn 3 or more bids on this
	// listing, so they can no longer bid on it. Withdrawing and buyout are not
	// limited (ADR-0052). Added for FS-ZE43K (Bid withdrawal cap).
	BidWithdrawLimitReached Code = "BID_WITHDRAW_LIMIT_REACHED"

	// ListingWithdrawLocked: the listing has live bids (PENDING, WINNING or
	// OUTBID) and is in its final 30 minutes, so its seller can no longer
	// withdraw it. Decided by marketplace-service (ADR-0051). FS-V7A5S Req 12.
	ListingWithdrawLocked Code = "LISTING_WITHDRAW_LOCKED"

	// ListingDurationOutOfRange: the requested listing ends in the future but
	// less than 1 h − 5 min or more than 7 d + 5 min away. Decided by
	// marketplace-service when the seller lists. FS-XEDFF Req 1.
	ListingDurationOutOfRange Code = "LISTING_DURATION_OUT_OF_RANGE"

	// ListingLimitReached: the seller already has 20 items listed or settling.
	// Decided by items-service on reserve. FS-XEDFF Req 5.
	ListingLimitReached Code = "LISTING_LIMIT_REACHED"

	// BidTooLow: the bid is below the listing's start price with no contending
	// bid, or not above the contending bid. The client re-reads the listing for
	// the fresh minimum. Decided by marketplace-service. Added for FS-V74WE (A
	// refused bid says why).
	BidTooLow Code = "BID_TOO_LOW"

	// BidAtOrAboveBuyout: the bid is at or above the listing's buyout price, so
	// it must be a buyout instead. Decided by marketplace-service. Added for
	// FS-V74WE (A refused bid says why).
	BidAtOrAboveBuyout Code = "BID_AT_OR_ABOVE_BUYOUT"

	// AlreadyLeading: the member's own bid is already the listing's leading
	// bid, so another would only raise the price against themselves. No gold
	// is held for it; buying out is still allowed (ADR-0054). Decided by
	// marketplace-service. Added for FS-72KT8 (No bidding against your own lead).
	AlreadyLeading Code = "ALREADY_LEADING"
)

// domainCodes is the registry of domain-specific codes: the only reasons a
// refusal may carry through the gateway. Anything else stays the generic
// FAILED_PRECONDITION, so an unregistered reason never becomes contract by
// accident.
var domainCodes = map[Code]struct{}{
	BagFull:          {},
	StashFull:        {},
	ItemNotAvailable: {},
	ItemWorn:         {},

	// FS-V6SFK
	PasswordTooShort:  {},
	PasswordTooLong:   {},
	PasswordTooCommon: {},
	EmailInvalid:      {},

	VerificationCodeInvalid:   {},
	VerificationCodeExpired:   {},
	VerificationResendTooSoon: {},
	EmailAlreadyVerified:      {},

	EmailUnverified: {},

	// FS-1GZGD
	LetterTitleInvalid:      {},
	LetterBodyInvalid:       {},
	LetterExpiryInvalid:     {},
	EnclosureInvalid:        {},
	UnknownItemTemplate:     {},
	UnknownItemInstance:     {},
	LetterRecipientsInvalid: {},
	LetterExpired:           {},
	NothingToClaim:          {},
	LetterAlreadyClaimed:    {},
	LetterClaimInProgress:   {},

	// FS-F692V
	LeadingBidLowered: {},

	// FS-ZE43K
	BidWithdrawLimitReached: {},

	// FS-V7A5S
	ListingWithdrawLocked: {},

	// FS-XEDFF
	ListingDurationOutOfRange: {},
	ListingLimitReached:       {},

	// FS-V74WE
	BidTooLow:          {},
	BidAtOrAboveBuyout: {},

	// FS-72KT8
	AlreadyLeading: {},
}
