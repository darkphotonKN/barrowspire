package activity

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/common/api/activity/walletactivity"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"go.temporal.io/sdk/activity"
)

// Activities are the settlement steps wallet owns (ADR-0011): each runs in this
// process, on the `wallet` task queue, as a thin wrapper over a use case.
type Activities struct {
	commitHold CommitHold
}

type CommitHold interface {
	Handle(ctx context.Context, cmd *usecase.CommitHoldCommand) (*usecase.CommitHoldResult, error)
}

func NewActivities(commitHold CommitHold) *Activities {
	return &Activities{
		commitHold: commitHold,
	}
}

// activityRegistry is the one method Register needs. Both a worker and the
// SDK's test activity environment satisfy it, so tests register activities the
// same way the running worker does.
type activityRegistry interface {
	RegisterActivityWithOptions(a interface{}, options activity.RegisterOptions)
}

// Register puts wallet's settlement activities on the worker under their
// contract names (ADR-0019), which is what the workflow schedules them by.
func (a *Activities) Register(r activityRegistry) {
	r.RegisterActivityWithOptions(a.CommitHold, activity.RegisterOptions{Name: walletactivity.CommitHoldActivityName})
}
