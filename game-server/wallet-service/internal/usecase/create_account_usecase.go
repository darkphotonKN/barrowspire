package usecase

import (
	"context"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

// Usecase
// Coordinator of the domain, incoming requests, and outbound calls like
// repository and external services.
// Recommended to keep our structure with thin slices of functionality in each usecase

type CreateAccountUC struct {
	repo account.Repository
}

func NewCreateAccountUC(repo account.Repository) *CreateAccountUC {
	return &CreateAccountUC{
		repo: repo,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type CreateAccountCommand struct {
	MemberID uuid.UUID
}

func (uc *CreateAccountUC) Handle(ctx context.Context, cmd CreateAccountCommand) (*account.Account, error) {
	// birth aggregate root
	acc, err := account.NewAccount(cmd.MemberID)

	if err != nil {
		// propgate error with usecase context
		return nil, fmt.Errorf("create account usecase birthing new account : %w", err)
	}

	err = uc.repo.Insert(ctx, acc)

	if err != nil {
		// propgate error with usecase context
		return nil, fmt.Errorf("writing repo usecase inserting new account : %w", err)
	}

	return acc, nil
}
