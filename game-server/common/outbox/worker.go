package outbox

import (
	"context"
	"log/slog"
	"sync"
	"time"

	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

/**
* Houses the struct and logic of the workers that process the outbox
* event messages for publishing.
**/

type OutboxWorker struct {
	workCycle       time.Duration
	batchCount      *int
	outboxRetriever OutboxRetriever
	publishCh       commonbroker.Publisher
	wg              *sync.WaitGroup
	// wake asks Run to drain now rather than at the next tick; one ring waits
	// while a drain is under way, and any more are folded into it
	wake chan struct{}
}

type OutboxRetriever interface {
	LockPendingBatch(ctx context.Context, limit *int, handle BatchHandler) (int, error)
	GetBacklog(ctx context.Context) (Backlog, error)
}

// batchTimeout bounds one batch. The batch's transaction is begun under it, so
// a stalled broker holds one pooled connection (most services run 2) and the
// batch's row locks for about this long at most (ADR-0069 §Decision 4).
const batchTimeout = 5 * time.Second

func NewOutboxWorker(workCycle time.Duration, batchCount int, outboxRetriever OutboxRetriever, publishCh commonbroker.Publisher, wg *sync.WaitGroup) *OutboxWorker {
	return &OutboxWorker{
		workCycle:       workCycle,
		batchCount:      &batchCount,
		outboxRetriever: outboxRetriever,
		publishCh:       publishCh,
		wg:              wg,
		wake:            make(chan struct{}, 1),
	}
}

/**
* Wake asks the worker to drain the outbox now instead of at the next tick, for
* a writer that just committed rows someone is waiting on. It never blocks: a
* ring already waiting covers this one too, and the tick still retries whatever
* the woken drain could not publish.
**/
func (w *OutboxWorker) Wake() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

/**
* Sets up the cancel and publish for select which initiates the workers
**/
func (w *OutboxWorker) Run(ctx context.Context) {
	// finished cancelling gracefully, notify waitgroup
	defer w.wg.Done()

	timer := time.NewTicker(w.workCycle)

	slog.Info("Initiating outbox workers..")

	defer timer.Stop()

	for {
		select {
		case <-timer.C:
		case <-w.wake:
			// cancelled
		case <-ctx.Done():
			return
		}

		// incase a tick or a wake and ctx.Done() land at the same instant
		if ctx.Err() != nil {
			return
		}
		publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), batchTimeout)
		_ = w.PublishOutboxEvents(publishCtx) // errors are logged inside; the next tick retries
		w.recordBacklog(publishCtx)
		cancel()
	}
}

/**
* Publishes one batch of pending outbox rows. The batch is locked with SKIP
* LOCKED and marked in one transaction, so another replica draining the same
* outbox never takes these rows (ADR-0069). A publish failure ends the batch at
* that row; the rows already sent are still marked, the rest go back for the
* next tick. Errors are logged here and returned.
**/
func (w *OutboxWorker) PublishOutboxEvents(ctx context.Context) error {
	if _, err := w.outboxRetriever.LockPendingBatch(ctx, w.batchCount, w.publishBatch); err != nil {
		slog.Error("Error when attempting to publish a batch of outbox events.",
			"err", err)
		return err
	}
	return nil
}

/**
* publishBatch publishes events in order and returns the ids it sent, stopping
* at the first failure so the rows after it stay pending (ADR-0069 §Decision 3).
**/
func (w *OutboxWorker) publishBatch(ctx context.Context, events []*OutboxEvent) []uuid.UUID {
	sent := make([]uuid.UUID, 0, len(events))
	for _, evt := range events {
		err := w.publishCh.PublishWithContext(
			ctx,
			evt.Exchange,
			evt.RoutingKey,
			commonbroker.Message{
				ContentType:  "application/protobuf",
				Body:         evt.Payload,
				DeliveryMode: amqp.Persistent,
				// row id is stable across republishes, so consumers can dedupe on it
				MessageId: evt.ID.String(),
			})

		if err != nil {
			slog.Error("Error occured when attempting to publish event from outbox item, ending the batch here.",
				"outbox_id", evt.ID,
				"err", err)
			return sent
		}

		slog.Debug("successfully published outbox event",
			"event_id", evt.ID,
			"event", evt.RoutingKey,
			"event_exchange", evt.Exchange,
		)
		sent = append(sent, evt.ID)
	}
	return sent
}

/**
* Sets the backlog gauges after a cycle. On a failed read they keep the last
* value rather than drop to 0, which would look like a healthy empty outbox.
**/
func (w *OutboxWorker) recordBacklog(ctx context.Context) {
	backlog, err := w.outboxRetriever.GetBacklog(ctx)
	if err != nil {
		slog.Error("Error when attempting to read the outbox backlog.",
			"err", err)
		return
	}

	unpublishedRows.Set(float64(backlog.Rows))
	oldestUnpublishedAge.Set(backlog.OldestAgeSeconds)
}
