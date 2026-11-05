package usecase

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// usecase defined port, indicating what adapter needs to conform to
// the usecases needed to give a bid's hold back

// HoldReleaseStarter hands one bid's hold to a durable release: it returns once the
// release is started, not once the gold is back, and the release is retried until it
// lands. Starting the same bid twice is success, so a caller may start it without
// knowing whether an earlier attempt already did.
type HoldReleaseStarter interface {
	StartReleaseHold(ctx context.Context, listingID, bidID uuid.UUID) error
}

// ErrHoldReleasePending is a release that was started but had not finished when the
// caller stopped waiting. Not a failure: the release carries on and lands on its own.
var ErrHoldReleasePending = errors.New("hold release still running")

// HoldReleaseAwaiter starts one bid's hold release as HoldReleaseStarter does, then
// waits up to maxWait for the gold to be back (ADR-0049). Nil means it is back. A
// release still running at maxWait answers ErrHoldReleasePending and is never
// cancelled; any other error is a release that failed to start or failed outright.
type HoldReleaseAwaiter interface {
	ReleaseHoldAndWait(ctx context.Context, listingID, bidID uuid.UUID, maxWait time.Duration) error
}
