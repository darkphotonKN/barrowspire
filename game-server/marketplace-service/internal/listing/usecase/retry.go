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
