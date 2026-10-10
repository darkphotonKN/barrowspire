package usecase

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
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
		out[i] = listing.ErrConcurrentModification
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
			results:   []error{listing.ErrConcurrentModification, listing.ErrConcurrentModification, nil},
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
			results:   []error{fmt.Errorf("save listing: %w", listing.ErrConcurrentModification), nil},
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

			err := withRetry(context.Background(), fn)

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

	err := withRetry(context.Background(), func() error {
		return fmt.Errorf("place hold: %w", sentinel)
	})

	assert.ErrorIs(t, err, sentinel)
	assert.NotErrorIs(t, err, ErrMaxRetries)
}

// TestWithRetry_ExhaustionWrapsTheRacingError pins that giving up still says
// what was racing. Returning a bare ErrMaxRetries throws that away, leaving the
// caller unable to tell an OCC loss from any other exhausted retry — and the
// gRPC handler maps ErrConcurrentModification and ErrMaxRetries to the same
// code precisely because it cannot currently distinguish them.
func TestWithRetry_ExhaustionWrapsTheRacingError(t *testing.T) {
	err := withRetry(context.Background(), func() error {
		return fmt.Errorf("save listing: %w", listing.ErrConcurrentModification)
	})

	assert.ErrorIs(t, err, ErrMaxRetries, "still reports exhaustion")
	assert.ErrorIs(t, err, listing.ErrConcurrentModification, "and still carries what was racing")
}

// TestWithRetry_StopsOnCancelledContext pins that a caller who has gone away
// stops the loop. Without this the helper keeps burning attempts and sleeping
// out its jitter on a request nobody is waiting for.
func TestWithRetry_StopsOnCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	calls := 0
	err := withRetry(ctx, func() error {
		calls++
		cancel() // the caller gives up while the first attempt is in flight
		return listing.ErrConcurrentModification
	})

	assert.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, 1, calls, "must not attempt again after cancellation")
}

// TestWithBackoff pins the helper's contract the same way: what comes back, and how
// many attempts it took. The retriable predicate is the caller's, so the helper must
// stop on anything that predicate rejects.
func TestWithBackoff(t *testing.T) {
	errAgain := errors.New("try again")
	retriable := func(err error) bool { return errors.Is(err, errAgain) }

	tests := []struct {
		name      string
		attempts  int
		results   []error
		wantErr   error
		wantCalls int
	}{
		{name: "succeeds first time", attempts: 3, results: []error{nil}, wantCalls: 1},
		{name: "retries then succeeds", attempts: 3, results: []error{errAgain, nil}, wantCalls: 2},
		{name: "returns the last failure at the cap", attempts: 3, results: []error{errAgain, errAgain, errAgain}, wantErr: errAgain, wantCalls: 3},
		{name: "stops on an error the predicate rejects", attempts: 3, results: []error{errFromDependency}, wantErr: errFromDependency, wantCalls: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			err := withBackoff(context.Background(), tt.attempts, time.Millisecond, retriable, func(ctx context.Context) error {
				calls++
				return tt.results[calls-1]
			})

			if tt.wantErr == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tt.wantErr)
			}
			assert.Equal(t, tt.wantCalls, calls)
		})
	}
}

// A caller that has gone away ends the wait, and hears the operation's own failure
// rather than a bare context error that hides what actually went wrong.
func TestWithBackoff_CancelledContextReturnsTheLastFailure(t *testing.T) {
	errAgain := errors.New("try again")
	ctx, cancel := context.WithCancel(context.Background())

	calls := 0
	err := withBackoff(ctx, 5, time.Hour, func(error) bool { return true }, func(ctx context.Context) error {
		calls++
		cancel()
		return errAgain
	})

	assert.ErrorIs(t, err, errAgain)
	assert.Equal(t, 1, calls)
}
