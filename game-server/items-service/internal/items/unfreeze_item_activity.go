package items

import (
	"context"
	"fmt"

	commonactivity "github.com/darkphotonKN/barrowspire-server/common/api/activity/itemsactivity"
	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/worker"
)

type UnfreezeItemActivity struct {
	service ItemsUnfreezer
}

type ItemsUnfreezer interface {
	UnfreezeItem(ctx context.Context, itemID, sellerID, listingID uuid.UUID) error
}

func NewUnfreezeItemActivity(unfreezer ItemsUnfreezer) *UnfreezeItemActivity {
	return &UnfreezeItemActivity{
		service: unfreezer,
	}
}

// UnfreezeItemActivity is items' share of the pre-pivot rollback (FS-NXP1W Req
// 12). Deliberately unclassified: a rollback action is retried without a cap and
// has nothing to fall back to, so every failure is returned plain and tried again.
func (a *UnfreezeItemActivity) UnfreezeItemActivity(ctx context.Context, inp commonactivity.UnfreezeItemInput) error {
	if err := a.service.UnfreezeItem(ctx, inp.ItemID, inp.SellerID, inp.ListingID); err != nil {
		return fmt.Errorf("unfreeze item activity item %v listing %v: %w", inp.ItemID, inp.ListingID, err)
	}

	return nil
}

func (a *UnfreezeItemActivity) Register(w worker.Worker) {
	w.RegisterActivityWithOptions(a.UnfreezeItemActivity, activity.RegisterOptions{
		Name: commonactivity.UnfreezeItemActivityName,
	})
}
