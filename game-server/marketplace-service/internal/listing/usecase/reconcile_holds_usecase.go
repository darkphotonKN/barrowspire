package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// reconcileHoldGrace is how long a reservation must have outlived its bid before the
// reconciler will judge it.
//
// Load-bearing, not tuning. PlaceBid reserves the gold and only then writes the bid,
// so between those two steps a perfectly healthy request looks exactly like an
// orphan. Releasing inside that window would leave a recorded bid with no gold behind
// it — the precise state the hold-before-bid ordering exists to prevent. Ten minutes
// is the same grace the item reservation reconciler uses, and a PlaceBid round trip
// is measured in milliseconds.
const reconcileHoldGrace = 10 * time.Minute

// BidReader answers the question wallet cannot: does this bid exist? A hold carries
// the bid id it was reserved for, but that id is marketplace's claim about what the
// gold was for, not proof that anything was recorded.
type BidReader interface {
	HasBid(ctx context.Context, bidID uuid.UUID) (bool, error)
}

// HoldReconciler is wallet's half: report what is still reserved, and give back what
// this service says was never claimed.
type HoldReconciler interface {
	ListStaleReservedHolds(ctx context.Context, createdBefore time.Time) ([]uuid.UUID, error)
	ReleaseHold(ctx context.Context, bidID uuid.UUID) error
}

// ReconcileHoldsUC returns gold that PlaceBid reserved and then failed to record a
// bid for — the cases its own compensation could not complete, because wallet was
// unreachable at that moment or the process died before it ran.
//
// The comparison has to happen here rather than in wallet. wallet can enumerate its
// reservations but cannot judge them; marketplace can judge but cannot enumerate,
// because an orphaned hold's bid id exists nowhere in its records. So wallet reports
// and marketplace decides, which is also the direction the two services already
// depend in.
type ReconcileHoldsUC struct {
	bids   BidReader
	wallet HoldReconciler
}

func NewReconcileHoldsUC(bids BidReader, wallet HoldReconciler) *ReconcileHoldsUC {
	return &ReconcileHoldsUC{
		bids:   bids,
		wallet: wallet,
	}
}

func (uc *ReconcileHoldsUC) Handle(ctx context.Context) error {
	stale, err := uc.wallet.ListStaleReservedHolds(ctx, time.Now().Add(-reconcileHoldGrace))
	if err != nil {
		return fmt.Errorf("list stale reserved holds: %w", err)
	}

	for _, bidID := range stale {
		exists, err := uc.bids.HasBid(ctx, bidID)
		if err != nil {
			// never release on a failed lookup: not knowing whether the bid exists is
			// not the same as knowing it does not
			slog.ErrorContext(ctx, "check bid failed", "bid_id", bidID, "error", err)
			continue
		}

		if exists {
			continue
		}

		if err := uc.wallet.ReleaseHold(ctx, bidID); err != nil {
			slog.ErrorContext(ctx, "release orphaned hold failed", "bid_id", bidID, "error", err)
			continue // next tick tries again
		}

		slog.WarnContext(ctx, "reconciled orphaned hold", "bid_id", bidID)
	}

	return nil
}
