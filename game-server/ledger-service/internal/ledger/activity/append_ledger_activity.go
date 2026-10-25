package activity

import (
	"context"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/worker"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/ledgeractivity"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/usecase"
)

type LedgerAppender interface {
	Append(ctx context.Context, cmd usecase.AppendTransactionCommand) error // match your real signature
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

	err := a.appender.Append(ctx, usecase.AppendTransactionCommand{
		TransactionID: in.TransactionID,
		ReferenceID:   in.ReferenceID,
		Reason:        in.Reason,
		Currency:      in.Currency,
		Legs:          legs,
	})

	if err != nil {
		return ledgeractivity.AppendLedgerTxOutput{}, classifyAppendErr(err)
	}

	return ledgeractivity.AppendLedgerTxOutput{}, nil
}

func classifyAppendErr(err error) error {
	return err
}

func (a *Activities) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.AppendLedgerTx, activity.RegisterOptions{
		Name: ledgeractivity.AppendLedgerActivityName,
	})
}
