package usecase

import (
	"context"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/google/uuid"
)

// Usecase
// Coordinator of the domain, incoming requests, and outbound calls like
// repository and external services.
// Recommended to keep our structure with thin slices of functionality in each usecase

type CreateLedgerUC struct {
	repo ledger.Repository
}

func NewCreateLedgerUC(repo ledger.Repository) *CreateLedgerUC {
	return &CreateLedgerUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type CreateLedgerCommand struct {
	TransactionID uuid.UUID
	ReferenceID   uuid.UUID
	Reason        string
	Legs          []ledger.LegInput
}

func (uc *CreateLedgerUC) Handle(ctx context.Context, cmd CreateLedgerCommand) (*ledger.Transaction, error) {
	// birth aggregate root
	l, err := ledger.NewTransaction(cmd.TransactionID, cmd.ReferenceID, ledger.TransactionReason(cmd.Reason), ledger.CurrencyGold, cmd.Legs)

	if err != nil {
		// propgate error with usecase context
		return nil, fmt.Errorf("create ledger usecase birthing new ledger : %w", err)
	}

	err = uc.repo.Insert(ctx, l)

	if err != nil {
		// propgate error with usecase context
		return nil, fmt.Errorf("writing repo usecase inserting new ledger : %w", err)
	}

	return l, nil
}
