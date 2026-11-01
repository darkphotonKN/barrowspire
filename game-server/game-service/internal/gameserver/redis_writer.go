package gameserver

import (
	"context"
	"log/slog"
	"time"
)

/**
* The pod's one ordered Redis writer for the presence index (FS-R82NV R7; party changes go through
* the party registry's runner, FS-NCC9J). The hub's loop queues writes and never waits; one goroutine runs them in
* queue order, so a delete never overtakes the write it undoes, and a slow Redis holds up only
* that goroutine.
*
* A full queue treats writes by kind. A write that a refresh repeats (queue) is dropped: the next
* refresh puts it back. A delete (queueMust) is never dropped: it waits in a backlog the loop
* flushes on its next tick, because nothing would ever repeat it (code review 2026-11-01). While
* the backlog holds anything, every new write joins it, so order holds across both kinds.
**/

const (
	redisWriteBuffer  = 256
	redisWriteTimeout = 2 * time.Second
	// how long a stopping writer spends on the writes still queued
	redisDrainTimeout = 2 * time.Second
)

type redisWrite func(ctx context.Context) error

type orderedWriter struct {
	writes chan redisWrite
	// deletes the full queue could not take, oldest first; only the hub's loop touches it
	backlog []redisWrite
	started bool
	done    chan struct{}
}

func newOrderedWriter() *orderedWriter {
	return &orderedWriter{
		writes: make(chan redisWrite, redisWriteBuffer),
		done:   make(chan struct{}),
	}
}

// start runs the writer for the life of ctx.
func (w *orderedWriter) start(ctx context.Context) {
	w.started = true
	go w.loop(ctx)
}

// running reports whether start was called: a pod built without Redis never starts one.
func (w *orderedWriter) running() bool { return w.started }

// stopped closes once the writer has run what was still queued after ctx ended.
func (w *orderedWriter) stopped() <-chan struct{} { return w.done }

func (w *orderedWriter) loop(ctx context.Context) {
	defer close(w.done)
	for {
		select {
		case <-ctx.Done():
			w.drain(ctx)
			return
		case write := <-w.writes:
			writeCtx, cancel := context.WithTimeout(ctx, redisWriteTimeout)
			err := write(writeCtx)
			cancel()
			if err != nil && ctx.Err() == nil {
				slog.Warn("party redis write failed", "error", err)
			}
		}
	}
}

// drain runs the writes still queued as the pod stops, within redisDrainTimeout, so a delete
// queued just before shutdown still lands while Redis is open (I-R82NV-3 review). ctx's values
// are kept, its cancellation is not.
func (w *orderedWriter) drain(ctx context.Context) {
	drainCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), redisDrainTimeout)
	defer cancel()
	for drainCtx.Err() == nil {
		select {
		case write := <-w.writes:
			if err := write(drainCtx); err != nil {
				slog.Warn("party redis write failed while stopping", "error", err)
			}
		default:
			return
		}
	}
}

// runBacklog runs the writes the full queue left waiting (deletes, and the refreshes queued behind
// them), in order, once the writer has stopped: the last tick could not flush them. Called on the
// hub's loop, which owns the backlog.
func (w *orderedWriter) runBacklog(ctx context.Context) {
	for _, write := range w.backlog {
		if ctx.Err() != nil {
			return
		}
		if err := write(ctx); err != nil {
			slog.Warn("party redis delete failed while stopping", "error", err)
		}
	}
	w.backlog = nil
}

// queue hands the writer a write the next refresh repeats. While the backlog holds anything it
// goes behind it, so it never lands before a delete queued ahead of it; a full queue, or a backlog
// already as long as the queue, drops it, since the next refresh repeats it.
func (w *orderedWriter) queue(write redisWrite) {
	if len(w.backlog) > 0 {
		if len(w.backlog) >= redisWriteBuffer {
			slog.Warn("party redis write dropped: backlog full")
			return
		}
		w.backlog = append(w.backlog, write)
		return
	}
	select {
	case w.writes <- write:
	default:
		slog.Warn("party redis write dropped: writer behind")
	}
}

// queueMust hands the writer a delete; a full queue keeps it for the next flush.
func (w *orderedWriter) queueMust(write redisWrite) {
	if len(w.backlog) > 0 {
		// behind older deletes already waiting, so order holds
		w.backlog = append(w.backlog, write)
		return
	}
	select {
	case w.writes <- write:
	default:
		slog.Warn("party redis delete deferred: writer behind")
		w.backlog = append(w.backlog, write)
	}
}

// flush moves waiting deletes into the queue, oldest first, as far as it has room.
func (w *orderedWriter) flush() {
	for len(w.backlog) > 0 {
		select {
		case w.writes <- w.backlog[0]:
			w.backlog = w.backlog[1:]
		default:
			return
		}
	}
}
