package usecase

import (
	"context"

	"github.com/google/uuid"
)

// usecase defined port, indidicating what adapter needs to conform to
// the usecases needed to initiate the settlement saga

type TriggerKind string

const (
	TriggerExpiry    TriggerKind = "EXPIRY"
	TriggerAcceptBid TriggerKind = "ACCEPT_BID"
	TriggerBuyout    TriggerKind = "BUYOUT"
)

type SettlementStarter interface {
	StartSettlement(ctx context.Context, listingID uuid.UUID, trigger TriggerKind) error
}
