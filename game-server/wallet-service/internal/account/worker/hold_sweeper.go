package worker

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
)

// HoldSweepInterval is how often expired holds are released (FS-A3CQH §Req 7).
//
// Minutes rather than seconds because this is a backstop, not the main path: a
// hold is normally committed or released by the settlement that placed it, and
// only the cases where that never happened reach the sweep. An expired hold
// already cannot be committed, so a few minutes' wait costs the bidder only how
// soon the gold is spendable again. Tuning, not contract.
const HoldSweepInterval = 5 * time.Minute

// holdSweep is one pass of the sweep.
type holdSweep interface {
	Handle(ctx context.Context, cmd *usecase.ExpireHoldsCommand) (int, error)
}

// HoldSweeper runs the hold sweep on a ticker in wallet-service's process. Several
// replicas may run one each: they serialize on the account's version, so no
// leader is needed (§Req 10).
type HoldSweeper struct {
	interval time.Duration
	sweep    holdSweep
	wg       *sync.WaitGroup
}

// NewHoldSweeper takes a slot in wg the caller has already added; Run gives it
// back when it returns, as the outbox worker does.
func NewHoldSweeper(interval time.Duration, sweep holdSweep, wg *sync.WaitGroup) *HoldSweeper {
	return &HoldSweeper{
		interval: interval,
		sweep:    sweep,
		wg:       wg,
	}
}

// Run sweeps every interval until ctx is cancelled. A failed pass is logged and
// never stops the worker: the next tick is its retry.
func (w *HoldSweeper) Run(ctx context.Context) {
	defer w.wg.Done()

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := w.sweep.Handle(ctx, &usecase.ExpireHoldsCommand{Now: time.Now()}); err != nil && ctx.Err() == nil {
				slog.ErrorContext(ctx, "hold sweep pass failed", "error", err)
			}
		}
	}
}
