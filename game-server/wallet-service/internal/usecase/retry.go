package usecase

import (
	"errors"
	"math/rand/v2"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
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

func withRetry(fn func() error) error {
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
		if !account.IsRetriable(err) {
			// every other error, let the caller decide, unrelated to retry's job
			return err
		}

		// raced, count attempt, jitter, delay and retry
		if attempts == maxRetries {
			return ErrMaxRetries
		}

		// delay next call
		jitterTime := time.Duration(rand.Float64() * float64(time.Millisecond) * 5)
		time.Sleep(jitterTime)
	}

	return ErrMaxRetries
}
