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
)

// checks if error matches the predefined sentinel to determine if its retriable
// single source of truth for checking for retriable
func IsRetriable(err error) bool {
	return errors.Is(err, ErrConcurrentModification)
}
