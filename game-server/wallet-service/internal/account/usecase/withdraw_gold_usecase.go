package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

type WithdrawGoldUC struct {
	repo account.Repository
}

func NewWithdrawGoldUC(repo account.Repository) *WithdrawGoldUC {
	return &WithdrawGoldUC{
		repo: repo,
	}
}

type WithdrawGoldCommand struct {
	ID   uuid.UUID
	Gold int
}

func (uc *WithdrawGoldUC) Handle(ctx context.Context, cmd *WithdrawGoldCommand) error {
	return withRetry(func() error {
		// find account and all its holds, repo reconstitute's
		acc, err := uc.repo.FindByID(ctx, cmd.ID)
		if err != nil {
			return fmt.Errorf("withdraw gold usecase handle FindById cmd account id %s : %w", cmd.ID, err)
		}

		// snapshot for version
		before := acc.Snapshot()

		// attempt to place hold
		err = acc.Withdraw(cmd.Gold, time.Now())
		if err != nil {
			return fmt.Errorf("withdraw gold usecase handle placing hold cmd account id %s : %w", cmd.ID, err)
		}

		err = uc.repo.Save(ctx, acc, before)
		if err != nil {
			return fmt.Errorf("withdraw gold usecase handle saving cmd account id %s : %w", cmd.ID, err)
		}

		// success
		return nil
	})
}
