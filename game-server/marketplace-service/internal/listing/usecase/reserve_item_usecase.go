package usecase

import (
	"context"
	"fmt"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// adapter interface
type ItemReserver interface {
	ReserveItem(ctx context.Context, itemID uuid.UUID, startPrice int, endsAt time.Time) (*pb.ReserveItemResponse, error)
}

// Usecase
// Coordinator of the domain, incoming requests, and outbound calls like
// repository and external services.
// Recommended to keep our structure with thin slices of functionality in each usecase

type ReserveItemUC struct {
	itemReserver ItemReserver
}

func NewReserveItemUC(itemReserver ItemReserver) *ReserveItemUC {
	return &ReserveItemUC{
		itemReserver: itemReserver,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type ReserveItemCommand struct {
	SellerID   uuid.UUID
	ItemID     uuid.UUID
	StartPrice int
	Now        time.Time
	EndsAt     time.Time
}

func (uc *ReserveItemUC) Handle(ctx context.Context, cmd *ReserveItemCommand) error {
	// The listing is born later, from the ItemReserved event. Terms it would
	// refuse there must be refused here, before the item is locked for a listing
	// that can never exist. The draft is discarded: it only runs the aggregate's
	// own birth rules, so no rule is restated in this usecase.
	if _, err := listing.NewListing(cmd.SellerID, cmd.ItemID, cmd.StartPrice, cmd.Now, cmd.EndsAt); err != nil {
		return fmt.Errorf("reserve item usecase validating listing terms: %w", err)
	}

	// check item and set item status listed
	_, err := uc.itemReserver.ReserveItem(ctx, cmd.ItemID, cmd.StartPrice, cmd.EndsAt)

	if err != nil {
		return fmt.Errorf("reserve item %s: %w", cmd.ItemID, err)
	}

	return nil
}
