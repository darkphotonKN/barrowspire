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
	}
}

// markTimeout bounds one attempt to mark a published row, independent of the
// tick that published it.
const markTimeout = 10 * time.Second

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
			// incase time.C and ctx.Done() runs at the same instant
			if ctx.Err() != nil {
				return
			}
			publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Second*30)
			_ = w.PublishOutboxEvents(publishCtx) // errors are logged inside; the next tick retries
			cancel()

			// cancelled
		case <-ctx.Done():
			return
		}
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

		// no error, rabbitmq acknowledged, recieved, update status.
		// The mark outlives the tick: Run cancels ctx as soon as this function
		// returns, and a mark made with that context fails at once, so the row
		// would be republished every tick while the retries logged "context
		// canceled" for minutes. Each attempt gets its own bounded context.
		go func(evtId uuid.UUID) {
			var offsetTime = time.Second * 10
			var retries = 0

			for {
				markCtx, cancelMark := context.WithTimeout(context.WithoutCancel(ctx), markTimeout)
				err := w.outboxRetriever.UpdateOutboxToPublished(markCtx, evtId)
				cancelMark()
				if err != nil {
					if commonhelpers.IsTransientError(err) && retries < 5 {
						slog.Error("Transient error when attempting to update outbox to published.",
							"err", err)

						time.Sleep(offsetTime)

						// exponential backoff
						offsetTime = offsetTime * 2
						retries += 1
						continue
					}

					slog.Error("Error when attempting to update outbox to published.",
						"err", err)

					return
				}

				return
			}
		}(evt.ID)

		// update worked, exit goroutine
		slog.Debug("successfully published outbox event",
			"event_id", evt.ID,
			"event", evt.RoutingKey,
			"event_exchange", evt.Exchange,
		)
	}

	return nil
}
