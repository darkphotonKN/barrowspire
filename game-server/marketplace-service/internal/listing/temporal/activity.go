package temporal

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// INBOUND ADAPTER for temporal
type Activity struct {
	FreezeListingUC FreezeListingWriter
}

type FreezeListingWriter interface {
	Handle(ctx context.Context, cmd usecase.FreezelistingCommand) error
}

func (a *Activity) FreezeListingActivity() error {
	// call freeze listing uc to attempt to freeze listing

	return nil
}
