package worker

import (
	"context"
	"log/slog"
	"time"
)

// expiryPollInterval is how often ended auctions are looked for (FS-NXP1W §Req 2).
//
// It bounds how long an ended auction waits before its settlement starts, so it is
// the delay a winner sees between the countdown reaching zero and the sale moving.
// Tuning, not contract: short enough that a sale follows its end promptly, long
// enough that an idle Bazaar costs one indexed read every half minute.
const expiryPollInterval = 30 * time.Second

// ExpiredSettlementStarter is what the poller needs from its use case.
type ExpiredSettlementStarter interface {
	Handle(ctx context.Context, now time.Time) error
}

// ExpiryPollerWorker is the expiry poller (ADR-0016): the trigger that starts
// settlement for every auction that simply runs out, the way AcceptBid and Buyout
// start it for the ones that end early.
type ExpiryPollerWorker struct {
	uc ExpiredSettlementStarter
}

func NewExpiryPollerWorker(uc ExpiredSettlementStarter) *ExpiryPollerWorker {
	return &ExpiryPollerWorker{uc: uc}
}

func (w *ExpiryPollerWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(expiryPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.uc.Handle(ctx, time.Now()); err != nil {
				slog.ErrorContext(ctx, "expiry poll failed", "error", err)
			}
		}
	}
}
