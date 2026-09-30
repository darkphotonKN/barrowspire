package activity

import "errors"

// Failure classification (FS-NXP1W §Req 9). Each activity declares its own
// non-retryable set and its own error type, what they share is only the matching,
// which is what lives here.

// isAnyOf reports whether err matches any sentinel in set. errors.Is, so a sentinel
// wrapped on the way up, by a use case, or by the retry loop reporting exhaustion,
// is still recognised.
func isAnyOf(err error, set []error) bool {
	for _, target := range set {
		if errors.Is(err, target) {
			return true
		}
	}

	return false
}
