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
	FindByID(ctx context.Context, id uuid.UUID) (*Account, error)
	Insert(ctx context.Context, account *Account) error

	// CONTRACT: save must return the senintel ErrConcurrentModification to signify a
	// race error when attempting optimisitic updates
	// account/errors.go's IsRetriable and usecase/retry.go's withRetry relies on this
	// to work
	Save(ctx context.Context, acc *Account, before AccountSnapshot) error
}
