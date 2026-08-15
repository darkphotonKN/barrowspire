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

// NOTE: keyed by MemberID for the same reason as DepositGoldCommand — the gRPC
// layer only ever knows the authenticated member.
type WithdrawGoldCommand struct {
	MemberID uuid.UUID
	Gold     int
}

func (uc *WithdrawGoldUC) Handle(ctx context.Context, cmd *WithdrawGoldCommand) error {
	return withRetry(func() error {
		// find account and all its holds, repo reconstitute's
		acc, err := uc.repo.FindByMemberID(ctx, cmd.MemberID)
		if err != nil {
			return fmt.Errorf("withdraw gold usecase handle FindByMemberID cmd member id %s : %w", cmd.MemberID, err)
		}

		// snapshot for version
		before := acc.Snapshot()

		// attempt to withdraw gold
		err = acc.Withdraw(cmd.Gold, time.Now())
		if err != nil {
			return fmt.Errorf("withdraw gold usecase handle withdrawing gold cmd member id %s : %w", cmd.MemberID, err)
		}

		err = uc.repo.Save(ctx, acc, before)
		if err != nil {
			return fmt.Errorf("withdraw gold usecase handle saving cmd member id %s : %w", cmd.MemberID, err)
		}

		// success
		return nil
	})
}
