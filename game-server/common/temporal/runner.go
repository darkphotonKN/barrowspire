package temporal

import (
	"fmt"

	"go.temporal.io/sdk/client"
	sdklog "go.temporal.io/sdk/log"
	"go.temporal.io/sdk/worker"
)

// Register is how a service declares what its worker can execute.
//
// Each service registers ONLY its own activities. Marketplace additionally
// registers the workflows it hosts. A workflow never imports another service's
// activity function — it schedules by NAME onto that service's queue, which is
// why activity names live in shared packages (ADR-0019).
type Register func(worker.Worker)

// Runner owns one worker on one task queue.
//
// It deliberately does NOT own the client. The caller dials, the caller closes
// — so `Stop()` means exactly one thing regardless of who called it. Marketplace
// keeps using its client for the expiry poller after the worker is stopped;
// making that depend on which constructor was used would be a side effect
// invisible from the signature.
type Runner struct {
	cfg    Config
	worker worker.Worker
	logger sdklog.Logger
}

// NewRunner builds a worker on cfg.TaskQueue and applies the registrations.
// The client must already be dialled (see Dial) and stays the caller's.
func NewRunner(c client.Client, cfg Config, logger sdklog.Logger, opts worker.Options, regs ...Register) (*Runner, error) {
	if c == nil {
		return nil, fmt.Errorf("temporal: client is required")
	}
	if cfg.TaskQueue == "" {
		return nil, fmt.Errorf("temporal: task queue is required")
	}

	w := worker.New(c, cfg.TaskQueue.String(), opts)
	for _, reg := range regs {
		if reg != nil {
			reg(w)
		}
	}

	return &Runner{cfg: cfg, worker: w, logger: logger}, nil
}

// Start begins polling. It does not block — the SDK runs its own poller
// goroutines; the service's own lifecycle keeps the main goroutine.
func (r *Runner) Start() error {
	if err := r.worker.Start(); err != nil {
		return fmt.Errorf("temporal: worker start on queue %q: %w", r.cfg.TaskQueue, err)
	}
	if r.logger != nil {
		r.logger.Info("temporal: worker started", "taskQueue", r.cfg.TaskQueue.String())
	}
	return nil
}

// Stop drains pollers and waits for in-flight activities to finish.
//
// MUST run before the service closes its database pool. An activity killed
// mid-transaction is not lost — Temporal reschedules it — so the symptom is not
// a bug report but unexplained retries after every deploy.
func (r *Runner) Stop() {
	r.worker.Stop()
	if r.logger != nil {
		r.logger.Info("temporal: worker stopped", "taskQueue", r.cfg.TaskQueue.String())
	}
}
