package activity

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"go.temporal.io/sdk/activity"
)

// Activities are the settlement steps marketplace owns (ADR-0011): each runs in
// this process, on the `marketplace` task queue, as a wrapper over a use case.
type Activities struct {
	freezeListing FreezeListing
	setWinningBid SetWinningBid
	loseAllBids   LoseAllBids
}

type FreezeListing interface {
	Handle(ctx context.Context, cmd usecase.FreezelistingCommand) (*dto.FreezeListingDto, error)
}

type SetWinningBid interface {
	Handle(ctx context.Context, cmd usecase.SetWinningBidCommand) error
}

type LoseAllBids interface {
	Handle(ctx context.Context, cmd usecase.LoseAllBidsCommand) error
}

func NewActivities(freezeListing FreezeListing, setWinningBid SetWinningBid, loseAllBids LoseAllBids) *Activities {
	return &Activities{
		freezeListing: freezeListing,
		setWinningBid: setWinningBid,
		loseAllBids:   loseAllBids,
	}
}

// activityRegistry is the one method Register needs. Both a worker and the
// SDK's test activity environment satisfy it, so tests register activities the
// same way the running worker does.
type activityRegistry interface {
	RegisterActivityWithOptions(a interface{}, options activity.RegisterOptions)
}

// Register puts marketplace's settlement activities on the worker under their
// contract names (ADR-0019), which is what the workflow schedules them by.
func (a *Activities) Register(r activityRegistry) {
	r.RegisterActivityWithOptions(a.FreezeListing, activity.RegisterOptions{Name: marketplaceactivity.FreezeListingActivityName})
	r.RegisterActivityWithOptions(a.SetWinningBid, activity.RegisterOptions{Name: marketplaceactivity.SetWinningBidActivityName})
	r.RegisterActivityWithOptions(a.LoseAllBids, activity.RegisterOptions{Name: marketplaceactivity.LoseAllBidsActivityName})
}
