package listing

import "errors"

// --- Errors ---
var (
	ErrInvalidUUID            = errors.New("invalid uuid")
	ErrInvalidListingState    = errors.New("Invalid state")
	ErrInvalidEndTime         = errors.New("Invalid endtime")
	ErrInvalidStartPrice      = errors.New("Invalid start price")
	ErrInvalidSoldPrice       = errors.New("Invalid sold price")
	ErrInvalidSoldTime        = errors.New("invalid sold time")
	ErrCorruptListingState    = errors.New("corrupt listing state")
	ErrConcurrentModification = errors.New("concurrent modification")
	ErrInvalidHoldTransition  = errors.New("invalid hold transition")
)

// checks if error matches the predefined sentinel to determine if its retriable
// single source of truth for checking for retriable
func IsRetriable(err error) bool {
	return errors.Is(err, ErrConcurrentModification)
}
