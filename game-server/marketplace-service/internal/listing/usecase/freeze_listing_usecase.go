package usecase

import (
	"context"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

type FreezeListingUC struct {
	repo listing.Repository
}

type FreezelistingCommand struct {
	ListingID uuid.UUID
}

func (uc *FreezeListingUC) Handle(ctx context.Context, cmd FreezelistingCommand) error {
	// load + reconstitute listing from repo method
	l, err := uc.repo.FindByID(ctx, cmd.ListingID)

	if err != nil {
		return fmt.Errorf("freeze listing usecase repo.FindByID : %w", err)
	}

	// call aggregate verb to attempt to freeze, via FSM to validate status
	// shift is in the correct order
	err = l.Freeze()

	if err != nil {
		return fmt.Errorf("freeze listing usecase Freeze : %w", err)
	}

	// find winner

	// save to persist, contended object but no race protection needed
	// like OCC as we're using an fused conditional atomic query
	// HOWEVER - since its DDD and we reconstituted above, theres a
	// "check" from the load and then a time gap then act.

	return nil
}
