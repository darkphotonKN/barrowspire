package account

import "errors"

// --- Errors ---
var (
	ErrInvalidGold            = errors.New("invalid gold")
	ErrInvalidUUID            = errors.New("invalid uuid")
	ErrHoldsExceedBalance     = errors.New("holds exceed balace")
	ErrCorruptAccountState    = errors.New("corrupt account state")
	ErrConcurrentModification = errors.New("concurrent modification")
	ErrHoldNotFound           = errors.New("hold not found")
	ErrInvalidHoldTransition  = errors.New("invalid hold transition")
	ErrHoldAmountMismatch     = errors.New("hold amount does not match the expected amount")
	ErrHoldExpired            = errors.New("hold expired")
	ErrInsufficientGold       = errors.New("gold below the hold being committed")
	ErrInvalidHoldExpiry      = errors.New("hold expiry must be in the future")
	ErrBidAlreadyHeld         = errors.New("bid already has a hold that is not this one")
)

// checks if error matches the predefined sentinel to determine if its retriable
// single source of truth for checking for retriable
func IsRetriable(err error) bool {
	return errors.Is(err, ErrConcurrentModification)
}
