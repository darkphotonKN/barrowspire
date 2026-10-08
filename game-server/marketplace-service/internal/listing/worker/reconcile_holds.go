package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// reconcileHoldsInterval is how often orphaned reservations are swept up.
//
// Minutes rather than seconds because this is a backstop, not the main path:
// PlaceBid releases its own hold the moment its write fails, and only the cases
// where that compensation could not run — wallet unreachable right then, or the
// process dying between the two — reach this worker. A bidder's gold sitting idle
// for a few minutes in those cases is the cost of not polling wallet constantly.
const reconcileHoldsInterval = 5 * time.Minute

type ReconcileHoldsWorker struct {
	uc *usecase.ReconcileHoldsUC
}

func NewReconcileHoldsWorker(uc *usecase.ReconcileHoldsUC) *ReconcileHoldsWorker {
	return &ReconcileHoldsWorker{
		uc: uc,
	}
}

func (w *ReconcileHoldsWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(reconcileHoldsInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.uc.Handle(ctx); err != nil {
				slog.ErrorContext(ctx, "reconcile holds failed", "error", err)
			}
		}
	}
}
