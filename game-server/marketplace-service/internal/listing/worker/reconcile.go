package worker

import (
	"context"
	"log/slog"
	"time"
)

// reconcileReservationsInterval is how often the reconcile tick runs. For stale
// reservations it only bounds how late an orphan is found (at most the 10-minute
// age plus one interval); it never makes one be found early, because the age is
// checked on every sweep. For the withdraw backstop it bounds how long an
// unstarted withdrawal waits once Temporal is reachable again.
const reconcileReservationsInterval = 5 * time.Minute

// reconcilePassTimeout bounds one pass of one tick, so a pass stuck on a slow
// dependency cannot hold the next pass, or the next tick, behind it. What a pass
// did not reach is picked up by the next tick.
const reconcilePassTimeout = 2 * time.Minute

// ReconcilePass is one sweep the reconcile tick runs: the stale-reservation sweep,
// the withdraw backstop (FS-V7A5S Req 8).
type ReconcilePass struct {
	Name string
	Run  func(ctx context.Context) error
}

type ReconcileWorker struct {
	passes      []ReconcilePass
	passTimeout time.Duration
}

func NewReconcileWorker(passes ...ReconcilePass) *ReconcileWorker {
	return &ReconcileWorker{
		passes:      passes,
		passTimeout: reconcilePassTimeout,
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

// tick runs every pass in order, each under its own deadline. A failing pass is
// logged and the next still runs.
func (w *ReconcileWorker) tick(ctx context.Context) {
	for _, p := range w.passes {
		w.runPass(ctx, p)
	}
}

func (w *ReconcileWorker) runPass(ctx context.Context, p ReconcilePass) {
	ctx, cancel := context.WithTimeout(ctx, w.passTimeout)
	defer cancel()

	if err := p.Run(ctx); err != nil {
		slog.ErrorContext(ctx, "reconcile pass failed", "pass", p.Name, "error", err)
	}
}
