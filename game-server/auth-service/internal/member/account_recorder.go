package member

import (
	"context"
	"fmt"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// The two ports the recorder needs, declared here because the consumer owns its
// interfaces. Neither is the full repository or inbox surface.

type accountIDWriter interface {
	SetAccountIDTx(ctx context.Context, tx *sqlx.Tx, memberID, accountID uuid.UUID) error
}

type inboxMarker interface {
	MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error)
}

// AccountRecorder caches a member's wallet account id onto their row in
// reaction to account.created.
//
// It is the last hop of the loop FS-9KW9F builds, and the ONLY writer of
// members.account_id (§Req 10). The column is a cache of wallet.accounts.id,
// never a source of truth: no RPC sets it, no signup path sets it, and no admin
// surface edits it. Anything that did would be writing a value it does not own.
type AccountRecorder struct {
	db    *sqlx.DB
	repo  accountIDWriter
	inbox inboxMarker
}

func NewAccountRecorder(db *sqlx.DB, repo accountIDWriter, inbox inboxMarker) *AccountRecorder {
	return &AccountRecorder{db: db, repo: repo, inbox: inbox}
}

// RecordAccountCommand is an inbound application WRITE intent.
//
// EventID is the ANNOUNCING event's id — the one wallet generated for
// account.created — not the signup that ultimately caused it. Wallet's inbox
// and auth's inbox are separate tables keyed on separate events.
type RecordAccountCommand struct {
	EventID   uuid.UUID
	MemberID  uuid.UUID
	AccountID uuid.UUID
}

// Record marks the event processed and writes the column in ONE transaction.
//
// Both or neither. A marked event whose column write rolled back could never be
// retried — the inbox would report it as already seen — so the member would
// keep a NULL account_id forever and never receive the claim.
//
// Returns ErrAlreadyProcessed on a redelivery so the consumer can ack: the work
// was already done, which is a success wearing an error's shape.
func (r *AccountRecorder) Record(ctx context.Context, cmd RecordAccountCommand) error {
	return commonutils.ExecTx(ctx, r.db, nil, func(tx *sqlx.Tx) error {
		inserted, err := r.inbox.MarkEventProcessed(ctx, tx, cmd.EventID, commonconstants.AccountCreatedEvent)
		if err != nil {
			return fmt.Errorf("record account marking event processed: %w", err)
		}
		if !inserted {
			return commonconstants.ErrAlreadyProcessed
		}

		if err := r.repo.SetAccountIDTx(ctx, tx, cmd.MemberID, cmd.AccountID); err != nil {
			return fmt.Errorf("record account setting account id for member %s: %w", cmd.MemberID, err)
		}

		return nil
	})
}
