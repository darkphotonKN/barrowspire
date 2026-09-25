package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/google/uuid"
)

type FreezeListingUC struct {
	repo listing.Repository
}

type FreezelistingCommand struct {
	ListingID uuid.UUID
}

func NewFreezeListingUC(repo listing.Repository) *FreezeListingUC {
	return &FreezeListingUC{
		repo: repo,
	}
}

func (uc *FreezeListingUC) Handle(ctx context.Context, cmd FreezelistingCommand) (*dto.FreezeListingDto, error) {
	var before listing.ListingSnapshot
	var winningBid *listing.Bid

	err := uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
		before = l.Snapshot()

		// signifies not a retry, freeze and start flow
		if before.Status != listing.StatusPendingSettlement {
			// call aggregate verb to attempt to freeze, via FSM to validate status
			// shift is in the correct order
			err := l.Freeze(time.Now())

			if err != nil {
				return fmt.Errorf("freeze listing usecase Freeze : %w", err)
			}
		}

		// find winner
		bid, err := l.FindWinningBid()
		winningBid = bid

		if err != nil {
			return fmt.Errorf("freeze listing usecase FindWinningBid : %w", err)
		}

		return nil
	})

	// transaction failed, error would be wrapped already just propogate
	if err != nil {
		return nil, err
	}

	// legit case where no bids exist either naturally or cuz of a race of bid expiring or
	// withdrawn (cancelled) right around auction ending and yet before
	// 0a of settlement saga to freeze the bids
	if winningBid == nil {
		return &dto.FreezeListingDto{
			ListingID: before.ID,
			ItemID:    before.ItemID,
			SellerID:  before.SellerID,
			Winner:    nil,
		}, nil
	}

	bidSnapshot := winningBid.Snapshot()

	return &dto.FreezeListingDto{
		ListingID: before.ID,
		ItemID:    before.ItemID,
		SellerID:  before.SellerID,
		Winner: &dto.FreezeWinner{
			WinnerBidID:    bidSnapshot.ID,
			WinnerMemberID: bidSnapshot.MemberID,
			Amount:         bidSnapshot.Amount,
		},
	}, nil
}
