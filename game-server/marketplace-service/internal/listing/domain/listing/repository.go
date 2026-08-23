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

	// CONTRACT: save must return the senintel ErrConcurrentModification to signify a
	// race error when attempting optimisitic updates
	// account/errors.go's IsRetriable and usecase/retry.go's withRetry relies on this
	// to work
	Save(ctx context.Context, acc *Listing, before ListingSnapshot) error

	// Modify loads the listing, applies fn to it and persists the result, all
	// within one transaction holding a row lock. Use it for writes that must not
	// race — fn sees a listing no other writer can change underneath it, so no
	// retry loop is needed.
	//
	// CONTRACT: fn runs with the row locked and must not perform I/O.
	Modify(ctx context.Context, id uuid.UUID, fn func(*Listing) error) error
}
