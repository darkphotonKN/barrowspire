package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

type DepositGoldUC struct {
	repo account.Repository
}

func NewDepositGoldUC(repo account.Repository) *DepositGoldUC {
	return &DepositGoldUC{
		repo: repo,
	}
}

type DepositGoldCommand struct {
	ID   uuid.UUID
	Gold int
}

func (uc *DepositGoldUC) Handle(ctx context.Context, cmd *DepositGoldCommand) error {
	return withRetry(func() error {
		acc, err := uc.repo.FindByID(ctx, cmd.ID)
		if err != nil {
			return fmt.Errorf("deposit gold usecase handle FindById cmd account id %s : %w", cmd.ID, err)
		}

		before := acc.Snapshot()
		err = acc.Deposit(cmd.Gold, time.Now())
		if err != nil {
			return fmt.Errorf("deposit gold usecase handle deposit gold cmd account id %s : %w", cmd.ID, err)
		}

		err = uc.repo.Save(ctx, acc, before)
		if err != nil {
			return fmt.Errorf("deposit gold usecase handle saving cmd account id %s : %w", cmd.ID, err)
		}

		return nil
	})
}
