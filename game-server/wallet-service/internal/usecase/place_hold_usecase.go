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
	ID       uuid.UUID
	MemberID uuid.UUID
	BidID    uuid.UUID
	Gold     int
}

// TODO: add retry
func (uc *PlaceHoldUC) Handle(ctx context.Context, cmd *PlaceHoldCommand) error {

	// find account and all its holds, repo reconstitute's
	acc, err := uc.repo.FindByID(ctx, cmd.ID)

	if err != nil {
		return fmt.Errorf("placehold usecase handle FindById cmd account id %s : %w", cmd.ID, err)
	}

	// snapshot for version
	before := acc.Snapshot()

	// attempt to place hold
	err = acc.PlaceHold(uuid.New(), cmd.Gold, cmd.BidID, time.Now())

	if err != nil {
		return fmt.Errorf("placehold usecase handle placing hold cmd account id %s : %w", cmd.ID, err)
	}

	err = uc.repo.Save(ctx, acc, before)

	if err != nil {
		return fmt.Errorf("placehold usecase handle saving cmd account id %s : %w", cmd.ID, err)
	}

	return nil
}
