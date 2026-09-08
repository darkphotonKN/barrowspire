package usecase_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	accountrepo "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/repository"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The whole point of this use case is that three writes commit or roll back
// TOGETHER. That is a property of a transaction, and a fake cannot have it — a
// stubbed repository would report success for two independent writes just as
// happily. So these run against wallet's real database.
//
// Defaults to the local compose values rather than requiring an env var, so a
// plain `go test ./...` exercises them instead of silently skipping.
func walletDSN() string {
	get := func(k, fallback string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return fallback
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		get("DB_USER", "user"), get("DB_PASSWORD", "password"),
		get("DB_HOST", "localhost"), get("DB_PORT", "5225"),
		get("DB_NAME", "barrowspire_wallet_service_db"))
}

func walletDB(t *testing.T) *sqlx.DB {
	t.Helper()
	db, err := sqlx.Connect("postgres", walletDSN())
	if err != nil {
		t.Skipf("wallet database unreachable, skipping integration test: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func newUC(t *testing.T, db *sqlx.DB) *usecase.CreateAccountOnSignupUC {
	t.Helper()
	return usecase.NewCreateAccountOnSignupUC(
		db,
		accountrepo.NewAccountRepository(db),
		newInbox(),
		commonoutbox.NewService(commonoutbox.NewRepo(db)),
	)
}

func countAccounts(t *testing.T, db *sqlx.DB, memberID uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, db.Get(&n, `SELECT COUNT(*) FROM accounts WHERE member_id = $1`, memberID))
	return n
}

func countOutbox(t *testing.T, db *sqlx.DB, memberID uuid.UUID) int {
	t.Helper()
	var n int
	// convert_from, not ::text — payload is BYTEA, and ::text renders it as a
	// hex escape string that matches nothing.
	require.NoError(t, db.Get(&n,
		`SELECT COUNT(*) FROM outbox WHERE convert_from(payload, 'UTF8') LIKE '%' || $1::text || '%'`,
		memberID))
	return n
}

// FS-0006 §Requirements 11, 12, 14.
func TestCreateAccountOnSignup_FirstDelivery_CreatesAccountAndQueuesEvent(t *testing.T) {
	db := walletDB(t)
	uc := newUC(t, db)
	memberID, eventID := uuid.New(), uuid.New()

	require.NoError(t, uc.Handle(context.Background(), usecase.CreateAccountOnSignupCommand{
		EventID: eventID, MemberID: memberID,
	}))

	assert.Equal(t, 1, countAccounts(t, db, memberID), "exactly one account for the member")
	assert.Equal(t, 1, countOutbox(t, db, memberID), "exactly one account.created queued")

	var row struct {
		RoutingKey string `db:"routing_key"`
		Exchange   string `db:"exchange"`
	}
	require.NoError(t, db.Get(&row,
		`SELECT routing_key, exchange FROM outbox WHERE convert_from(payload, 'UTF8') LIKE '%' || $1::text || '%'`,
		memberID))
	assert.Equal(t, commonconstants.AccountCreatedEvent, row.RoutingKey)
	assert.Equal(t, commonconstants.WalletEventsExchange, row.Exchange,
		"published on wallet.events, not an exchange named after the event")

	var payload []byte
	require.NoError(t, db.Get(&payload,
		`SELECT payload FROM outbox WHERE convert_from(payload, 'UTF8') LIKE '%' || $1::text || '%'`,
		memberID))

	var ev commonconstants.AccountCreatedEventPayload
	require.NoError(t, json.Unmarshal(payload, &ev))
	assert.Equal(t, memberID.String(), ev.MemberID)
	assert.NotEmpty(t, ev.AccountID)
	// §Req 14: the consumer's dedupe key rides IN the payload, and is not the
	// inbound event's id either — this is a new event with its own identity.
	assert.NotEmpty(t, ev.EventID)
	assert.NotEqual(t, eventID.String(), ev.EventID)
}

// FS-0006 §Requirements 16, §Edge States. Redelivery is a no-op, not a second
// account and not an error the broker has to interpret.
func TestCreateAccountOnSignup_Redelivery_IsANoOp(t *testing.T) {
	db := walletDB(t)
	uc := newUC(t, db)
	memberID, eventID := uuid.New(), uuid.New()
	cmd := usecase.CreateAccountOnSignupCommand{EventID: eventID, MemberID: memberID}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	err := uc.Handle(context.Background(), cmd)

	assert.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed,
		"a redelivery reports already-processed so the consumer can ack it")
	assert.Equal(t, 1, countAccounts(t, db, memberID), "still exactly one account")
	assert.Equal(t, 1, countOutbox(t, db, memberID), "still exactly one queued event")
}

// FS-0006 §Requirements 12, §Edge States: "a forced failure after the insert
// leaves neither". This is the assertion a happy-path test cannot make — two
// independent writes would satisfy every check above and fail this one.
func TestCreateAccountOnSignup_OutboxWriteFails_LeavesNoAccount(t *testing.T) {
	db := walletDB(t)
	memberID := uuid.New()

	uc := usecase.NewCreateAccountOnSignupUC(
		db,
		accountrepo.NewAccountRepository(db),
		newInbox(),
		failingOutbox{}, // fails AFTER the account insert has already happened
	)

	err := uc.Handle(context.Background(), usecase.CreateAccountOnSignupCommand{
		EventID: uuid.New(), MemberID: memberID,
	})

	require.Error(t, err)
	assert.Equal(t, 0, countAccounts(t, db, memberID),
		"the account insert must roll back with the failed outbox write")
}
