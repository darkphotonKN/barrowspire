package activity

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/marketplaceactivity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"go.temporal.io/sdk/activity"
)

type Activities struct {
	setWinningBid   SetWinningBid
	setWinBidFailed SetWinBidFailed
}

type SetWinningBid interface {
	Handle(ctx context.Context, cmd usecase.SetWinningBidCommand) error
}

type SetWinBidFailed interface {
	Handle(ctx context.Context, cmd usecase.SetWinBidFailedCommand) error
}

func NewActivities(setWinningBid SetWinningBid, setWinBidFailed SetWinBidFailed) *Activities {
	return &Activities{
		setWinningBid:   setWinningBid,
		setWinBidFailed: setWinBidFailed,
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
	r.RegisterActivityWithOptions(a.SetWinningBid, activity.RegisterOptions{Name: marketplaceactivity.SetWinningBidActivityName})
}
