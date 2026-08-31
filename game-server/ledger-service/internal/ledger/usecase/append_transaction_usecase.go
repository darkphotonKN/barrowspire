package usecase

import (
	"context"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/google/uuid"
)

type AppendTransactionUC struct {
	repo ledger.Repository
}

func NewAppendTransactionUC(repo ledger.Repository) *AppendTransactionUC {
	return &AppendTransactionUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type AppendTransactionCommand struct {
	TransactionID uuid.UUID
	ReferenceID   uuid.UUID
	Reason        string
	Currency      string
	Legs          []ledger.LegInput
}

func (uc *AppendTransactionUC) Handle(ctx context.Context, cmd AppendTransactionCommand) (applied bool, err error) {
	// birth aggregate root
	t, err := ledger.NewTransaction(cmd.TransactionID, cmd.ReferenceID, ledger.TransactionReason(cmd.Reason), ledger.CurrencyType(cmd.Currency), cmd.Legs)

	if err != nil {
		// propgate error with usecase context
		return false, fmt.Errorf("append transaction usecase birthing new transaction : %w", err)
	}

	applied, err = uc.repo.Append(ctx, t)

	if err != nil {
		// propgate error with usecase context
		return false, fmt.Errorf("append transaction usecase writing to repo : %w", err)
	}

	return applied, nil
}
