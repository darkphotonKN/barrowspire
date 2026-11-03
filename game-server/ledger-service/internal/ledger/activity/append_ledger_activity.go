package activity

import (
	"context"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/ledgeractivity"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/usecase"
)

// LedgerAppender is the slice of the append use case this INBOUND adapter needs.
type LedgerAppender interface {
	Handle(ctx context.Context, cmd usecase.AppendTransactionCommand) (applied bool, err error)
}

type Activities struct{ appender LedgerAppender }

func NewActivities(a LedgerAppender) *Activities { return &Activities{appender: a} }

func (a *Activities) AppendLedgerTx(ctx context.Context, in ledgeractivity.AppendLedgerTxInput) (ledgeractivity.AppendLedgerTxOutput, error) {
	legs := make([]ledger.LegInput, 0, len(in.Legs))

	for _, leg := range in.Legs {
		legs = append(legs, ledger.LegInput{
			AccountID: leg.AccountID,
			Amount:    leg.Amount,
			Direction: ledger.Direction(leg.Direction),
		})
	}

	applied, err := a.appender.Handle(ctx, usecase.AppendTransactionCommand{
		TransactionID: in.TransactionID,
		ReferenceID:   in.ReferenceID,
		Reason:        in.Reason,
		Currency:      in.Currency,
		Legs:          legs,
	})

	if err != nil {
		return ledgeractivity.AppendLedgerTxOutput{}, classifyAppendErr(err)
	}

	// applied=false is a duplicate append: success, not an error (FS-F9R7Q)
	return ledgeractivity.AppendLedgerTxOutput{Applied: applied}, nil
}

const appendLedgerTxImpossible = "AppendLedgerTxImpossible"

// classifyAppendErr turns a transaction the domain refused into a
// non-retryable error; anything else is transient and left for Temporal to retry.
func classifyAppendErr(err error) error {
	if ledger.IsNonRetryable(err) {
		return temporal.NewNonRetryableApplicationError(
			err.Error(),              // message
			appendLedgerTxImpossible, // type
			err,                      // cause
		)
	}

	return err
}

func (a *Activities) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.AppendLedgerTx, activity.RegisterOptions{
		Name: ledgeractivity.AppendLedgerActivityName,
	})
}
