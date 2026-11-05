package worker

import (
	"context"
	"log/slog"
	"time"
)

// reconcileReservationsInterval is how often stale reservations are checked. It
// only bounds how late an orphan is found (at most the 10-minute age plus one
// interval); it never makes one be found early, because the age is checked on
// every sweep. The confirmed-without-listing backstop shares the tick, with its
// own 10-minute grace checked the same way (FS-04ZB6 Req 12).
const reconcileReservationsInterval = 5 * time.Minute

// ReconcilePass is one sweep the reconcile tick runs.
type ReconcilePass interface {
	Handle(ctx context.Context) error
}

type ReconcileWorker struct {
	stale    ReconcilePass
	backstop ReconcilePass
}

// NewReconcileWorker runs the stale-reservation pass and then the
// confirmed-without-listing backstop on every tick.
func NewReconcileWorker(stale, backstop ReconcilePass) *ReconcileWorker {
	return &ReconcileWorker{
		stale:    stale,
		backstop: backstop,
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
			w.tick(ctx)
		}
	}
}

// tick runs both passes; a failed pass is logged and never costs the other its
// turn.
func (w *ReconcileWorker) tick(ctx context.Context) {
	if err := w.stale.Handle(ctx); err != nil {
		slog.ErrorContext(ctx, "reconcile reservations failed", "error", err)
	}
	if err := w.backstop.Handle(ctx); err != nil {
		slog.ErrorContext(ctx, "reconcile confirmed reservations failed", "error", err)
	}
}
