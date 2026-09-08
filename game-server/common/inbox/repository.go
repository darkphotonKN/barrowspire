// Package inbox is the consumer side of the transactional outbox pattern: the
// record of which events a service has already acted on, so a redelivery is
// recognised rather than applied twice.
//
// The code is shared; the storage is not. Every consuming service ships its own
// processed_events table in its own database and no service reads another's
// (FS-0006 §Req 20). The table this package writes to is:
//
//	processed_events(event_id UUID, event_type TEXT, processed_at TIMESTAMPTZ,
//	                 PRIMARY KEY (event_id, event_type))
//
// Keying on (event_id, event_type) rather than event_id alone is deliberate: it
// lets one service consume two event types that could share an id without one
// masking the other (FS-0006 §Req 21).
package inbox

import (
	"context"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// Repo is exported so consumers can name the value NewRepo returns.
type Repo struct{}

// NewRepo builds the inbox repository. It takes no database handle on purpose:
// the inbox only ever writes inside the caller's transaction, next to the side
// effect it is guarding, and a connection of its own would be a route around
// that.
func NewRepo() *Repo {
	return &Repo{}
}

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// and wraps anything else with the repo name + operation for context.
func wrapDBErr(op string, err error) error {
	return commonhelpers.WrapDBErr("inbox repo", op, err)
}

const markEventProcessedQuery = `
	INSERT INTO processed_events (event_id, event_type)
	VALUES ($1, $2)
	ON CONFLICT (event_id, event_type) DO NOTHING
`

// MarkEventProcessed inserts a row into processed_events.
// Returns true if the row was inserted (new event), false if it already existed (duplicate).
// Must run inside the same tx as the business side effect.
func (r *Repo) MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error) {
	result, err := tx.ExecContext(ctx, markEventProcessedQuery, eventID, eventType)
	if err != nil {
		return false, wrapDBErr("mark event processed", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}

	return rows == 1, nil
}
