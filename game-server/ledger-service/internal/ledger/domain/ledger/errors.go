package ledger

import (
	"errors"
)

// --- Errors ---
var (
	ErrInvalidUUID           = errors.New("invalid uuid")
	ErrUnbalancedTransaction = errors.New("unbalanced transaction")
	ErrInvalidLegCount       = errors.New("invalid leg count")
	ErrInvalidLegAmount      = errors.New("invalid leg amount")
	ErrInvalidDirection      = errors.New("invalid direction")
	ErrInvalidCurrency       = errors.New("invalid currency")
	ErrInvalidReason         = errors.New("invalid reason")
)

// NOTE:
// The closed set of errors retrying can never fix. Package-level because it's a
// statement about the sentinels above, not a step in the function — the function
// doesn't decide the list, and doesn't build it from arguments.
//
// Cost of package-level: ~112 bytes retained for the process lifetime, and one
// GC root scanned every cycle. Both are noise here. Neither scales — a large
// cached table retained this way raises the heap floor permanently, which shifts
// when every GC cycle fires. Retention is the cost to watch, not the bytes.
var nonRetryableErrs = []error{
	ErrInvalidUUID,
	ErrUnbalancedTransaction,
	ErrInvalidLegCount,
	ErrInvalidLegAmount,
	ErrInvalidDirection,
	ErrInvalidCurrency,
	ErrInvalidReason,
}

// helper determining whether a function is retryable, determined by the error
// not matching one of the blacklisted sentinel error types. This means default
// return here is false, indicating that the caller SHOULD retry.
// Default is retriable because any other error thats not part of this sentinel list
// that the domain doesn't know or care is an unexpected, transient error.
// Those, by default, are retryable.
func IsNonRetryable(err error) bool {
	for _, unsafeErr := range nonRetryableErrs {

		if errors.Is(err, unsafeErr) {
			// not retryable
			return true
		}
	}

	// function IS retryable
	return false
}
