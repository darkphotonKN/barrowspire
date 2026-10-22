package usecase

import (
	"context"

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
