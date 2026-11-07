package outbox

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type OutboxParams struct {
	// optional: the caller's own row id, which is the MessageId consumers
	// dedup on. A row whose id exists is not written again (FS-GV8WN §B R7).
	// uuid.Nil = the database picks a random one, as before.
	ID         uuid.UUID `db:"id"`
	RoutingKey string    `db:"routing_key"`
	Exchange   string    `db:"exchange"`
	Payload    []byte    `db:"payload"`
}

type OutboxEvent struct {
	ID         uuid.UUID `db:"id"`
	RoutingKey string    `db:"routing_key"`
	Exchange   string    `db:"exchange"`
	Payload    []byte    `db:"payload"`
	CreatedAt  time.Time `db:"created_at"`
	// nil = pending, not nil = processed
	PublishedAt *time.Time `db:"published_at"`
}

// Backlog is what the worker has yet to publish.
type Backlog struct {
	Rows             int     `db:"unpublished"`
	OldestAgeSeconds float64 `db:"oldest_age_seconds"`
}

// BatchHandler publishes a locked batch, oldest row first, and returns the ids
// it sent. Those ids are marked published in the batch's own transaction, so
// it returns only ids taken from events, and stops at the first row it could
// not send (ADR-0069 §Decision 3).
type BatchHandler func(ctx context.Context, events []*OutboxEvent) (sent []uuid.UUID)

// isp interface for all services
type OutboxPublisher interface {
	CreateOutbox(ctx context.Context, params OutboxParams) error
	CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params OutboxParams) error
}
