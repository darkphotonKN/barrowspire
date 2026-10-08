package listing

import (
	"context"

	"github.com/google/uuid"
)

// PORT determine what abstraction is needed for the aggregate of account
// domain to operate correctly
// the repository.go would implement the adapter, acutal concrete
// implementation that satisfies this interface
type Repository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*Listing, error)
	Insert(ctx context.Context, account *Listing) error

	// Update loads the listing, applies updateFn to it and persists the result,
	// all within one transaction holding a row lock. Use it for writes that must
	// not race — updateFn sees a listing no other writer can change underneath it,
	// so no retry loop is needed.
	//
	// A row lock rather than optimistic concurrency because of contention: the
	// seconds before an auction closes are when bidders pile onto one listing, and
	// version conflicts there mean a retry storm, each retry re-reading the whole
	// aggregate and deepening the contention it is retrying over.
	//
	// NOTE: remember vernons transactional consistency boundary
	// and the decision here that means we cant reudce the aggregate size cuz bids
	// need to contend with the winner under listing and so naturally belongs here
	//
	// CONTRACT: updateFn runs with the row locked and must not perform I/O.
	Update(ctx context.Context, id uuid.UUID, updateFn func(l *Listing) error) error

	// CONTRACT: save must return the senintel ErrConcurrentModification to signify a
	// race error when attempting optimisitic updates
	// account/errors.go's IsRetriable and usecase/retry.go's withRetry relies on this
	// to work
	Save(ctx context.Context, acc *Listing, before ListingSnapshot) error
}
