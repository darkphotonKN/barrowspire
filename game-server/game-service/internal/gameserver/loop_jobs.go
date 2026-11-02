package gameserver

import "context"

// loopJobs is work finished off the message hub's loop and handed back to it: the loop runs each
// job in turn, so what a job touches needs no lock. The hub owns the queue and selects on it;
// anything that works off the loop posts here (code review 2026-11-01: the work queue belongs to
// the hub, not to the party registry).
type loopJobs chan func()

// loopJobsBuffer is how much finished work may wait for the hub's loop.
const loopJobsBuffer = 64

func newLoopJobs() loopJobs { return make(loopJobs, loopJobsBuffer) }

// post hands job to the loop, waiting for room unless ctx ends first.
func (q loopJobs) post(ctx context.Context, job func()) {
	select {
	case q <- job:
	case <-ctx.Done():
	}
}
