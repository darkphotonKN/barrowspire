package gameserver

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

/**
* The party runner: the one goroutine per pod that makes the pod's party calls to Redis, in the
* order the hub's loop asked for them, so two actions sent one after the other on this pod reach
* Redis in that order (I-NCC9J-1 D1, amended). The loop never waits on it: it queues a call and is
* handed the outcome back as a loop job.
**/

// partyCallTimeout bounds one script or read behind a party action.
const partyCallTimeout = 2 * time.Second

// partyRunBuffer is how many Redis calls may wait for the runner.
const partyRunBuffer = 256

// errPartyRunnerBehind refuses a Redis call the runner has no room for.
var errPartyRunnerBehind = errors.New("party runner behind")

type partyRunner struct {
	runs chan func(ctx context.Context)
	jobs loopJobs
	// set on the loop as the pod's parties close: outcomes arriving after are dropped
	stopped bool
}

func newPartyRunner(jobs loopJobs) *partyRunner {
	return &partyRunner{runs: make(chan func(ctx context.Context), partyRunBuffer), jobs: jobs}
}

// start runs the runner for the life of ctx.
func (p *partyRunner) start(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case job := <-p.runs:
				job(ctx)
			}
		}
	}()
}

// stop drops every outcome from now on. Called on the loop.
func (p *partyRunner) stop() { p.stopped = true }

// onRunner queues call for the runner, bounded by partyCallTimeout, and hands its outcome to done
// back on the hub's loop, unless the runner has stopped meanwhile. Called on the loop, which never
// waits: a runner with no room answers done at once with errPartyRunnerBehind.
func onRunner[T any](ctx context.Context, p *partyRunner, call func(ctx context.Context) (T, error), done func(T, error)) {
	job := func(runCtx context.Context) {
		callCtx, cancel := context.WithTimeout(runCtx, partyCallTimeout)
		res, err := call(callCtx)
		cancel()
		p.jobs.post(runCtx, func() {
			if p.stopped {
				return
			}
			done(res, err)
		})
	}
	select {
	case p.runs <- job:
	default:
		slog.Warn("party redis call refused: runner behind")
		var zero T
		done(zero, errPartyRunnerBehind)
	}
}
