package usecase

import (
	"context"
	"fmt"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
)

// adapter interface
type ItemReserver interface {
	ReserveItem(ctx context.Context, itemID uuid.UUID) (*pb.ReserveItemResponse, error)
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

	// check item and set item status listed
	_, err := uc.itemReserver.ReserveItem(ctx, cmd.ItemID)

	if err != nil {
		return fmt.Errorf("create listing usecase item reserve error: %w", err)
	}

	return nil
}
