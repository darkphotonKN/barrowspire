package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

type WalletService interface {
	PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int) error
}

type PlaceBidUC struct {
	repo   listing.Repository
	wallet WalletService
}

func NewPlaceBidUC(repo listing.Repository, wallet WalletService) *PlaceBidUC {
	return &PlaceBidUC{
		repo:   repo,
		wallet: wallet,
	}
}

type PlaceBidCommand struct {
	ListingID      uuid.UUID
	MemberID       uuid.UUID
	Amount         int
	IdempotencyKey uuid.UUID
	Now            time.Time
}

func (uc *PlaceBidUC) Handle(ctx context.Context, cmd PlaceBidCommand) error {
	bidID := uuid.New()
	if err := uc.wallet.PlaceHold(ctx, cmd.MemberID, bidID, cmd.Amount); err != nil {
		return fmt.Errorf("place bid usecase handle placing hold for bid %v : %w", bidID, err)
	}

	err := withRetry(ctx, func() error {
		return uc.repo.Modify(ctx, cmd.ListingID, func(l *listing.Listing) error {
			if err := l.PlaceBidWithID(bidID, cmd.MemberID, cmd.Amount, cmd.IdempotencyKey, cmd.Now); err != nil {
				return err
			}

			if !l.HasBid(bidID) {
				return nil
			}

			return l.ConfirmBid(bidID, cmd.Now)
		})
	})
	if err != nil {
		return fmt.Errorf("place bid usecase handle recording bid %v, hold is stranded : %w", bidID, err)
	}

	return nil
}
