package ledger

import (
	"context"
)

// PORT determine what abstraction is needed for the aggregate of ledger
// domain to operate correctly
// the repository/ledger_repository.go implements the adapter, actual concrete
// implementation that satisfies this interface
type Repository interface {
	Append(ctx context.Context, tx *Transaction) (applied bool, err error)
}
