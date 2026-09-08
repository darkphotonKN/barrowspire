package usecase

import (
	"context"
	"encoding/json"
	"fmt"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// The three ports this use case needs, declared HERE because the consumer owns
// its interfaces. None of them is the full repository, inbox, or outbox surface.

type accountWriter interface {
	InsertTx(ctx context.Context, tx *sqlx.Tx, acc *account.Account) error
}

type inboxMarker interface {
	MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error)
}

type outboxWriter interface {
	CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error
}

// CreateAccountOnSignupUC births a member's gold account in reaction to
// member.signedup, and announces it — both in one transaction.
//
// Wallet learns about new members from the broker rather than being called, so
// it takes on no dependency on auth-service's availability at signup. The
// reverse dependency is what this whole loop exists to avoid: auth must never
// have to ask wallet anything while minting a token (ADR-0014).
type CreateAccountOnSignupUC struct {
	db     *sqlx.DB
	repo   accountWriter
	inbox  inboxMarker
	outbox outboxWriter
}

func NewCreateAccountOnSignupUC(db *sqlx.DB, repo accountWriter, inbox inboxMarker, outbox outboxWriter) *CreateAccountOnSignupUC {
	return &CreateAccountOnSignupUC{db: db, repo: repo, inbox: inbox, outbox: outbox}
}

// CreateAccountOnSignupCommand is an INBOUND application WRITE intent, named
// per the convention CreateAccountCommand set.
//
// EventID is the INBOUND event's id, used only to deduplicate. It is not
// reused as the outgoing event's id: see Handle.
type CreateAccountOnSignupCommand struct {
	EventID  uuid.UUID
	MemberID uuid.UUID
}

// Handle runs the whole reaction in ONE transaction: mark the event processed,
// birth the account, queue the announcement.
//
// All three or none. A partial commit here has no good failure mode — an
// account that exists unannounced never reaches auth-service, and a marked
// event whose account rolled back can never be retried because the inbox will
// report it as already seen.
//
// Returns ErrAlreadyProcessed on a redelivery so the consumer can ACK and move
// on. That is a successful outcome wearing an error's shape, not a failure:
// the work was already done.
func (uc *CreateAccountOnSignupUC) Handle(ctx context.Context, cmd CreateAccountOnSignupCommand) error {
	return commonutils.ExecTx(ctx, uc.db, nil, func(tx *sqlx.Tx) error {
		inserted, err := uc.inbox.MarkEventProcessed(ctx, tx, cmd.EventID, commonconstants.MemberSignedUpEvent)
		if err != nil {
			return fmt.Errorf("create account on signup marking event processed: %w", err)
		}
		if !inserted {
			return commonconstants.ErrAlreadyProcessed
		}

		acc, err := account.NewAccount(cmd.MemberID)
		if err != nil {
			return fmt.Errorf("create account on signup birthing account for member %s: %w", cmd.MemberID, err)
		}

		if err := uc.repo.InsertTx(ctx, tx, acc); err != nil {
			return fmt.Errorf("create account on signup inserting account for member %s: %w", cmd.MemberID, err)
		}

		snapshot := acc.Snapshot()

		// A NEW event id, not the inbound one. This is a different event on a
		// different exchange with a different consumer, and reusing the signup's
		// id would make auth-service's inbox and wallet's inbox collide on a key
		// that means two unrelated things (FS-0006 §Req 14).
		payload, err := json.Marshal(commonconstants.AccountCreatedEventPayload{
			EventID:   uuid.NewString(),
			AccountID: snapshot.ID.String(),
			MemberID:  snapshot.MemberID.String(),
		})
		if err != nil {
			return fmt.Errorf("create account on signup marshalling account.created: %w", err)
		}

		if err := uc.outbox.CreateOutboxTx(ctx, tx, commonoutbox.OutboxParams{
			RoutingKey: commonconstants.AccountCreatedEvent,
			Exchange:   commonconstants.WalletEventsExchange,
			Payload:    payload,
		}); err != nil {
			return fmt.Errorf("create account on signup queueing account.created: %w", err)
		}

		return nil
	})
}
