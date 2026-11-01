package gameserver

import (
	"context"
	"log/slog"
	"time"
)

/**
* The pod's one ordered Redis writer for party state: party pointers (FS-R82NV R3) and the
* presence index (R7). The hub's loop queues writes and never waits; one goroutine runs them in
* queue order, so a delete never overtakes the write it undoes, and a slow Redis holds up only
* that goroutine.
*
* A full queue treats writes by kind. A write that a refresh repeats (queue) is dropped: the next
* refresh puts it back. A delete (queueMust) is never dropped: it waits in a backlog the loop
* flushes on its next tick, because nothing would ever repeat it (code review 2026-11-01).
**/

const (
	redisWriteBuffer  = 256
	redisWriteTimeout = 2 * time.Second
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

// stopped closes once the writer has finished its last write after ctx ended.
func (w *orderedWriter) stopped() <-chan struct{} { return w.done }

func (w *orderedWriter) loop(ctx context.Context) {
	defer close(w.done)
	for {
		select {
		case <-ctx.Done():
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

// queue hands the writer a write the next refresh repeats; a full queue drops it.
func (w *orderedWriter) queue(write redisWrite) {
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
