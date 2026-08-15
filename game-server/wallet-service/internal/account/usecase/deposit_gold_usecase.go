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

// NOTE: keyed by MemberID, not account ID. The gRPC layer only ever knows the
// authenticated member — an account id is never supplied by the caller — so
// this matches PlaceHoldUC and CommitHoldUC rather than forcing the handler to
// resolve an id it does not have.
type DepositGoldCommand struct {
	MemberID uuid.UUID
	Gold     int
}

func (uc *DepositGoldUC) Handle(ctx context.Context, cmd *DepositGoldCommand) error {
	return withRetry(func() error {
		acc, err := uc.repo.FindByMemberID(ctx, cmd.MemberID)
		if err != nil {
			return fmt.Errorf("deposit gold usecase handle FindByMemberID cmd member id %s : %w", cmd.MemberID, err)
		}

		before := acc.Snapshot()
		err = acc.Deposit(cmd.Gold, time.Now())
		if err != nil {
			return fmt.Errorf("deposit gold usecase handle deposit gold cmd member id %s : %w", cmd.MemberID, err)
		}

		err = uc.repo.Save(ctx, acc, before)
		if err != nil {
			return fmt.Errorf("deposit gold usecase handle saving cmd member id %s : %w", cmd.MemberID, err)
		}

		return nil
	})
}
