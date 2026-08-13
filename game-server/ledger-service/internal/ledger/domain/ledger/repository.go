package ledger

import (
	"context"

	"github.com/google/uuid"
)

// PORT determine what abstraction is needed for the aggregate of ledger
// domain to operate correctly
// the repository/ledger_repository.go implements the adapter, actual concrete
// implementation that satisfies this interface
type Repository interface {
	FindByID(ctx context.Context, id uuid.UUID) (*Ledger, error)
	FindByMemberID(ctx context.Context, memberID uuid.UUID) (*Ledger, error)
	Insert(ctx context.Context, ledger *Ledger) error

	// CONTRACT: save must return the sentinel ErrConcurrentModification to signify a
	// race error when attempting optimistic updates
	// ledger/errors.go's IsRetriable and usecase/retry.go's withRetry relies on this
	// to work
	Save(ctx context.Context, l *Ledger, before LedgerSnapshot) error
}
