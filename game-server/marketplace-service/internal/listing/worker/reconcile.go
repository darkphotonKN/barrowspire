package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

// reconcileReservationsInterval is how often stale reservations are checked. It
// only bounds how late an orphan is found (at most the 10-minute age plus one
// interval); it never makes one be found early, because the age is checked on
// every sweep.
const reconcileReservationsInterval = 5 * time.Minute

type ReconcileWorker struct {
	uc *usecase.ReconcileReservationsUC
}

func NewReconcileWorker(uc *usecase.ReconcileReservationsUC) *ReconcileWorker {
	return &ReconcileWorker{
		uc: uc,
	}
}

func (w *ReconcileWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(reconcileReservationsInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.uc.Handle(ctx); err != nil {
				slog.ErrorContext(ctx, "reconcile reservations failed", "error", err)
			}
		}
	}
}
