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

func (uc *FreezeListingUC) Handle(ctx context.Context, cmd FreezelistingCommand) (*dto.FreezeListingDto, error) {

	// load + reconstitute listing from repo method
	l, err := uc.repo.FindByID(ctx, cmd.ListingID)

	if err != nil {
		return nil, fmt.Errorf("freeze listing usecase repo.FindByID : %w", err)
	}

	before := l.Snapshot()

	// signifies not a retry, freeze and start flow
	if before.Status != listing.StatusPendingSettlement {
		// call aggregate verb to attempt to freeze, via FSM to validate status
		// shift is in the correct order
		err = l.Freeze(time.Now())

		if err != nil {
			return nil, fmt.Errorf("freeze listing usecase Freeze : %w", err)
		}
	}

	// find winner
	bid, err := l.FindWinningBid()

	if err != nil {
		return nil, fmt.Errorf("freeze listing usecase Freeze : %w", err)
	}

	// save to persist, contended object but no race protection needed
	// like OCC as we're using an fused conditional atomic query
	// HOWEVER - since its DDD and we reconstituted above, theres a
	// "check" from the load and then a time gap then act.
	err = uc.repo.Save(ctx, l, before)

	if err != nil {
		return nil, fmt.Errorf("freeze listing usecase Save : %w", err)
	}

	// legit case where no bids exist either naturally or cuz of a race of bid expiring or
	// withdrawn (cancelled) right around auction ending and yet before
	// 0a of settlement saga to freeze the bids
	if bid == nil {
		return &dto.FreezeListingDto{
			ListingID: before.ID,
			ItemID:    before.ItemID,
			SellerID:  before.SellerID,
			Winner:    nil,
		}, nil
	}

	bidSnapshot := bid.Snapshot()

	return &dto.FreezeListingDto{
		ListingID: before.ID,
		ItemID:    before.ItemID,
		SellerID:  before.SellerID,
		Winner: &dto.FreezeWinner{
			WinnerBidID:    bidSnapshot.ID,
			WinnerMemberID: bidSnapshot.MemberID,
			Amount:         bidSnapshot.Amount,
		},
	}, nil // load + reconstitute listing from repo method
}
