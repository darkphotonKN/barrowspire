package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
)

type ReconcileWorker struct {
	uc       *usecase.ReconcileReservationsUC
	interval time.Duration
}

func NewReconcileWorker(usecase *usecase.ReconcileReservationsUC) *ReconcileWorker {
	return &ReconcileWorker{
		uc: usecase,
	}
}

func (w *ReconcileWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Minute * 5)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.uc.Handle(ctx); err != nil {
				slog.Error("reconcile failed", "error", err)
			}
		}
	}
}
