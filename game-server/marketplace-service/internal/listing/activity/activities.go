package activity

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

type Activities struct {
	setWinBid       SetWinBid
	setWinBidFailed SetWinBidFailed
}

type SetWinBid interface {
	Handle(ctx context.Context, cmd usecase.SetWinBidCommand) error
}

type SetWinBidFailed interface {
	Handle(ctx context.Context, cmd usecase.SetWinBidFailedCommand) error
}

func NewActivities(setWinBid SetWinBid, setWinBidFailed SetWinBidFailed) *Activities {
	return &Activities{
		setWinBid:       setWinBid,
		setWinBidFailed: setWinBidFailed,
	}
}
