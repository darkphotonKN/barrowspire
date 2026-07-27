package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

type PlaceHoldUC struct {
	repo account.Repository
}

func NewPlaceHoldUC(repo account.Repository) *PlaceHoldUC {
	return &PlaceHoldUC{
		repo: repo,
	}
}

type PlaceHoldCommand struct {
	MemberID uuid.UUID
	BidID    uuid.UUID
	Gold     int
}

func (uc *PlaceHoldUC) Handle(ctx context.Context, cmd *PlaceHoldCommand) error {
	// retry due to optimistic concurrency (OCC)
	return withRetry(func() error {
		// find account and all its holds, repo reconstitute's
		acc, err := uc.repo.FindByMemberID(ctx, cmd.MemberID)

		if err != nil {
			return fmt.Errorf("placehold usecase handle FindById cmd member id %s : %w", cmd.MemberID, err)
		}

		// snapshot for version
		before := acc.Snapshot()

		// attempt to place hold
		err = acc.PlaceHold(uuid.New(), cmd.Gold, cmd.BidID, time.Now())

		if err != nil {
			return fmt.Errorf("placehold usecase handle placing hold cmd account id %s member id %s: %w", before.ID, cmd.MemberID, err)
		}

		err = uc.repo.Save(ctx, acc, before)

		if err != nil {
			return fmt.Errorf("placehold usecase handle saving cmd account id %s and member_id %s: %w", before.ID, cmd.MemberID, err)
		}

		// success
		return nil
	})
}
