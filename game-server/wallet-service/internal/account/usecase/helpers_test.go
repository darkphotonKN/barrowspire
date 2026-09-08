package usecase_test

import (
	"context"
	"errors"

	commoninbox "github.com/darkphotonKN/barrowspire-server/common/inbox"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// Declared here because common/inbox.NewRepo returns an UNEXPORTED type, so a
// consumer cannot name it. An interface is the only way to hold the value.
type inboxMarker interface {
	MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error)
}

// The real inbox, not a fake. Deduplication is a race the database arbitrates,
// so substituting it would remove the only thing worth testing.
func newInbox() inboxMarker { return commoninbox.NewRepo() }

// failingOutbox fails at the LAST step, after the account row has already been
// written inside the transaction. That ordering is the point: it is the only
// way to tell a real transaction from three writes that happen to succeed.
type failingOutbox struct{}

func (failingOutbox) CreateOutboxTx(context.Context, *sqlx.Tx, commonoutbox.OutboxParams) error {
	return errors.New("outbox write failed on purpose")
}
