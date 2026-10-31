package outbox

import (
	"context"
	"log/slog"
	"sync"
	"time"

	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
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
	GetPendingOutboxItems(ctx context.Context, limit *int) ([]*OutboxEvent, error)
	UpdateOutboxToPublished(ctx context.Context, id uuid.UUID) error
}

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
		publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Second*30)
		_ = w.PublishOutboxEvents(publishCtx) // errors are logged inside; the next tick retries
		cancel()
	}
}

/**
* Publishes a single event from an outbox item pulled from the outbox table.
**/
func (w *OutboxWorker) PublishOutboxEvents(ctx context.Context) error {
	outboxEvts, err := w.outboxRetriever.GetPendingOutboxItems(ctx, w.batchCount)

	if err != nil {
		slog.Error("Error when attempting to retrieve latest outbox event.",
			"err", err)
		return err
	}

	for _, evt := range outboxEvts {
		err = w.publishCh.PublishWithContext(
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
			slog.Error("Error occured when attempting to publish event from outbox item.",
				"outbox_id", evt.ID,
				"err", err)
			continue
		}

		// no error, rabbitmq acknowledged, recieved, mark published now while ctx is still live.
		// a failed mark only means a republish next cycle, consumers dedupe on MessageId.
		if err := w.markPublished(ctx, evt.ID); err != nil {
			slog.Error("Error when attempting to update outbox to published.",
				"outbox_id", evt.ID,
				"err", err)
			continue
		}

		slog.Debug("successfully published outbox event",
			"event_id", evt.ID,
			"event", evt.RoutingKey,
			"event_exchange", evt.Exchange,
		)
	}

	return nil
}

/**
* Marks a single outbox row published, retrying transient errors with a
* short backoff that never outlives ctx.
**/
func (w *OutboxWorker) markPublished(ctx context.Context, id uuid.UUID) error {
	const maxRetries = 3
	backoff := 200 * time.Millisecond

	for attempt := 0; ; attempt++ {
		err := w.outboxRetriever.UpdateOutboxToPublished(ctx, id)
		if err == nil {
			return nil
		}

		// ctx is done or the error is permanent, retrying cannot help
		if ctx.Err() != nil || !commonhelpers.IsTransientError(err) || attempt >= maxRetries {
			return err
		}

		// don't sleep past the deadline
		if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) < backoff {
			return err
		}

		slog.Warn("Transient error when attempting to update outbox to published, retrying.",
			"outbox_id", id,
			"attempt", attempt+1,
			"err", err)

		select {
		case <-ctx.Done():
			return err
		case <-time.After(backoff):
		}

		// exponential backoff
		backoff *= 2
	}
}
