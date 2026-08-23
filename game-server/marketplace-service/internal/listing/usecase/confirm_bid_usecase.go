package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// ConfirmBidUC completes a bid placement once wallet reports the buyer's gold is
// held: the bid moves PENDING -> WINNING and the previous leader is demoted.
//
// This is the step that must not be allowed to simply fail. By the time it runs
// the gold is already frozen, so a bid abandoned in PENDING means a buyer whose
// money is held against a bid that never leads. Modify's row lock means the only
// way to lose here is a genuine database failure, which the caller retries — it
// cannot lose a race.
type ConfirmBidUC struct {
	repo listing.Repository
}

func NewConfirmBidUC(repo listing.Repository) *ConfirmBidUC {
	return &ConfirmBidUC{
		repo: repo,
	}
}

type ConfirmBidCommand struct {
	ListingID uuid.UUID
	BidID     uuid.UUID
	Now       time.Time
}

func (uc *ConfirmBidUC) Handle(ctx context.Context, cmd ConfirmBidCommand) error {
	err := uc.repo.Modify(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.ConfirmBid(cmd.BidID, cmd.Now)
	})
	if err != nil {
		return fmt.Errorf("confirm bid usecase handle bid id %v : %w", cmd.BidID, err)
	}

	return nil
}

// FailBidUC is the other outcome: wallet could not hold the gold, so the bid is
// marked FAILED and the current leader keeps the lead.
type FailBidUC struct {
	repo listing.Repository
}

func NewFailBidUC(repo listing.Repository) *FailBidUC {
	return &FailBidUC{
		repo: repo,
	}
}

type FailBidCommand struct {
	ListingID uuid.UUID
	BidID     uuid.UUID
	Now       time.Time
}

func (uc *FailBidUC) Handle(ctx context.Context, cmd FailBidCommand) error {
	err := uc.repo.Modify(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.FailBid(cmd.BidID, cmd.Now)
	})
	if err != nil {
		return fmt.Errorf("fail bid usecase handle bid id %v : %w", cmd.BidID, err)
	}

	return nil
}
