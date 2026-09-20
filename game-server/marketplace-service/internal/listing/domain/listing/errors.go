package listing

import (
	"errors"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
)

// --- Errors ---
var (
	ErrInvalidUUID             = errors.New("invalid uuid")
	ErrInvalidListingState     = errors.New("invalid state")
	ErrInvalidEndTime          = errors.New("invalid endtime")
	ErrInvalidStartPrice       = errors.New("invalid start price")
	ErrInvalidSoldPrice        = errors.New("invalid sold price")
	ErrInvalidSoldTime         = errors.New("invalid sold time")
	ErrCorruptListingState     = errors.New("corrupt listing state")
	ErrConcurrentModification  = errors.New("concurrent modification")
	ErrInvalidHoldTransition   = errors.New("invalid hold transition")
	ErrListingNotAcceptingBids = errors.New("listing not accepting bids")
	ErrBidNotFound             = errors.New("bid not found")
	ErrListingExpired          = errors.New("listing expired")
	ErrBidTooLow               = errors.New("bid too low")
	ErrNotBidOwner             = errors.New("not bid owner")
)

// checks if error matches the predefined sentinel to determine if its retriable
// single source of truth for checking for retriable
// IsRetriable reports whether an error is worth another attempt.
//
// Losing an optimistic-concurrency race is the obvious case. Transient
// infrastructure failures count too: on the bidding path the buyer's gold is
// already held by the time the write runs, so abandoning it there would strand
// that gold behind a bid nobody recorded.
func IsRetriable(err error) bool {
	return errors.Is(err, ErrConcurrentModification) ||
		errors.Is(err, commonconstants.ErrTransient)
}
