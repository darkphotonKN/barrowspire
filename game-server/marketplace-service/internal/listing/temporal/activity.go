package temporal

import (
	"context"
	"fmt"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// INBOUND ADAPTER for temporal
type Activity struct {
	FreezeListingUC FreezeListingWriter
}

type FreezeListingWriter interface {
	Handle(ctx context.Context, cmd usecase.FreezelistingCommand) (*dto.FreezeListingDto, error)
}

func (a *Activity) FreezeListingActivity(ctx context.Context, inp commonactivity.FreezeListingInput) (*commonactivity.FreezeListingOutput, error) {

	// call freeze listing uc to attempt to freeze listing
	bid, err := a.FreezeListingUC.Handle(ctx, usecase.FreezelistingCommand{
		ListingID: inp.ListingID,
	})

	if err != nil {
		return nil, fmt.Errorf("freeze listing activity parse uuid : %w", err)
	}

	return nil, nil
}
