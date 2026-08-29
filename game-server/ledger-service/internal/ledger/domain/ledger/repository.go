package ledger

import (
	"context"

	commonledgeractivity "github.com/darkphotonKN/barrowspire-server/common/api/activity"
)

// PORT determine what abstraction is needed for the aggregate of ledger
// domain to operate correctly
// the repository/ledger_repository.go implements the adapter, actual concrete
// implementation that satisfies this interface
type Repository interface {
	Append(ctx context.Context, inp commonledgeractivity.AppendLedgerTxInput) (commonledgeractivity.AppendLedgerTxOutput, error)
}
