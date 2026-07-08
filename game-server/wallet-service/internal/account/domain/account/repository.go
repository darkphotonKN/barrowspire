package account

import (
	"context"

	"github.com/google/uuid"
)

// PORT
// determine what abstraction is needed for the aggregate of account
// domain to operate correctly
// the repository.go would implement the adapter, acutal concrete
// implementation that satisfies this interface
type Repository interface {
	FindById(ctx context.Context, id uuid.UUID) (*Account, error)
	Insert(ctx context.Context, account *Account) error
}
