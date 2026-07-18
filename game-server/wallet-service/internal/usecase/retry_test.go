package usecase

import (
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/stretchr/testify/assert"
)

// errFromDependency stands in for a non-retriable error the wrapped operation
// might return (validation, not-found, a raw DB failure, etc.). withRetry must
// pass it straight back to the caller without retrying.
var errFromDependency = errors.New("some non-retriable failure")

// concErrs returns a slice of n concurrent-modification (retriable) errors,
// used to script an fn that keeps losing the optimistic-concurrency race.
func concErrs(n int) []error {
	out := make([]error, n)
	for i := range out {
		out[i] = account.ErrConcurrentModification
	}
	return out
}

// TestWithRetry drives the retry loop by scripting exactly what the wrapped fn
// returns on each successive call. It asserts on withRetry's boundary contract:
// the error handed back to the caller, and how many times fn was attempted.
//
// Note on asserting attempt count: for a retry helper the number of attempts is
// the *promised behavior*, not an internal detail — "retry on a race, stop after
// maxRetries" is the whole contract. That's why counting calls here is legitimate
// where it normally wouldn't be.
func TestWithRetry(t *testing.T) {
	tests := []struct {
		name string
		// results[i] is what fn returns on its i-th call. Its length is also the
		// exact number of attempts a correct implementation should make.
		results   []error
		wantErr   error // errors.Is target; nil means expect success
		wantCalls int
	}{
		{
			name:      "succeeds on first attempt",
			results:   []error{nil},
			wantErr:   nil,
			wantCalls: 1,
		},
		{
			name:      "retries a race then succeeds",
			results:   []error{account.ErrConcurrentModification, account.ErrConcurrentModification, nil},
			wantErr:   nil,
			wantCalls: 3,
		},
		{
			name:      "non-retriable error returns immediately without retrying",
			results:   []error{errFromDependency},
			wantErr:   errFromDependency,
			wantCalls: 1,
		},
		{
			name:      "wrapped concurrent-modification error is still retriable",
			results:   []error{fmt.Errorf("save account: %w", account.ErrConcurrentModification), nil},
			wantErr:   nil,
			wantCalls: 2,
		},
		{
			name:      "exhausts retries and returns ErrMaxRetries",
			results:   concErrs(maxRetries),
			wantErr:   ErrMaxRetries,
			wantCalls: maxRetries,
		},
		{
			name:      "succeeds on the final allowed attempt",
			results:   append(concErrs(maxRetries-1), nil),
			wantErr:   nil,
			wantCalls: maxRetries,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			fn := func() error {
				// If withRetry over-attempts, this indexes out of range and fails
				// the test loudly rather than silently looping.
				result := tt.results[calls]
				calls++
				return result
			}

			err := withRetry(fn)

			assert.Equal(t, tt.wantCalls, calls, "number of attempts")

			if tt.wantErr == nil {
				assert.NoError(t, err)
				return
			}
			// errors.Is so a wrapped return still satisfies the sentinel, and so
			// a non-retriable error must come back as the *same* error value.
			assert.ErrorIs(t, err, tt.wantErr)
		})
	}
}

// TestWithRetry_PreservesNonRetriableError guards the specific promise that a
// non-retriable failure is returned unchanged — not swallowed, not replaced with
// ErrMaxRetries. This is the branch where a wrong implementation would hide real
// errors behind a generic "max retries" message.
func TestWithRetry_PreservesNonRetriableError(t *testing.T) {
	sentinel := errors.New("insufficient funds")

	err := withRetry(func() error {
		return fmt.Errorf("place hold: %w", sentinel)
	})

	assert.ErrorIs(t, err, sentinel)
	assert.NotErrorIs(t, err, ErrMaxRetries)
}
