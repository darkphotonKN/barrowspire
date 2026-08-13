package ledger

import "errors"

// checks if error matches the predefined sentinel to determine if its retriable
// single source of truth for checking for retriable
func IsRetriable(err error) bool {
	return errors.Is(err, ErrConcurrentModification)
}
