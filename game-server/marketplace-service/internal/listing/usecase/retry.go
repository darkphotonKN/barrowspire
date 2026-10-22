package usecase

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
)

// retry helper for OCC
// NOTE: for any juniors or devs new to DDD hexagonal learning this flow, this is
// necessary for the fact that we're handling races by the column "version" thats
// held by the aggregate root. This version enables us to know if any changes were
// made while we are modifying a reconstituted struct. As DDD requires the steps
// load, modify, save, this is something that needs to be solved.
// in the cases that there are resources that can be hit on by multiple users in
// a hot path a row lock would fit better or using optimistic concurrency control
// can result in retry storms.

var ErrMaxRetries = errors.New("max retries")

const (
	maxRetries = 5
)

func withRetry(ctx context.Context, fn func() error) error {
	// goal is to retry while error is a race
	for attempts := 1; attempts <= maxRetries; attempts++ {
		// attempt to run the optimistic process (attempt to write without locking)
		err := fn()

		if err == nil {
			// no error, just return early
			return nil
		}

		// if concurrent modification is caught, race was caught at write time.
		// we retry, otherwise exit loop
		if !listing.IsRetriable(err) {
			// every other error, let the caller decide, unrelated to retry's job
			return err
		}

		// raced, count attempt, jitter, delay and retry.
		// wrap the loser rather than dropping it — the caller otherwise cannot
		// tell which resource was contended, or that it was a race at all
		if attempts == maxRetries {
			return fmt.Errorf("%w after %d attempts: %w", ErrMaxRetries, maxRetries, err)
		}

		// delay next call, but abandon the loop if the caller has already gone
		// away — sleeping out the jitter for a cancelled request helps nobody
		jitterTime := time.Duration(rand.Float64() * float64(time.Millisecond) * 5)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(jitterTime):
		}
	}

	return ErrMaxRetries
}

// withBackoff is the retry for calls that cross a network rather than lose a race:
// it doubles a jittered delay between attempts instead of withRetry's few
// milliseconds, and the caller decides what is worth retrying, since only it knows
// which failures an idempotent call can safely repeat.
//
// It returns the last failure, never ctx.Err(): a caller that gave up waiting
// still needs to know what actually went wrong.
func withBackoff(ctx context.Context, attempts int, base time.Duration, retriable func(error) bool, fn func(ctx context.Context) error) error {
	var err error
	delay := base

	for attempt := 1; attempt <= attempts; attempt++ {
		if err = fn(ctx); err == nil || !retriable(err) {
			return err
		}

		if attempt == attempts {
			break
		}

		// up to half the delay again, so callers that failed together do not all
		// come back together
		jitter := time.Duration(rand.Int64N(int64(delay)/2 + 1))

		select {
		case <-ctx.Done():
			return err
		case <-time.After(delay + jitter):
		}

		delay *= 2
	}

	return err
}
