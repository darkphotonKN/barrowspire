package inbox

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The inbox's whole job is a race the database arbitrates, so the tests run
// against a real postgres. common owns no database of its own and must not
// reach for a service's, so the DSN is supplied by the caller and the test
// skips when it is absent.
const dsnEnv = "INBOX_TEST_DB_DSN"

// The shape common/inbox contracts for. Every consuming service ships this as
// its own migration, in its own database (FS-9KW9F §Req 20); the test states it
// here because the package under test is code without storage.
const processedEventsDDL = `
CREATE TABLE processed_events (
	event_id     UUID NOT NULL,
	event_type   TEXT NOT NULL,
	processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (event_id, event_type)
);
`

const testSchema = "inbox_repository_test"

func TestMarkEventProcessed_Redelivery_ReportsAlreadySeen(t *testing.T) {
	db := inboxDB(t)
	repo := NewRepo()
	ctx := context.Background()

	eventID := uuid.New()

	first := inTx(t, db, func(tx *sqlx.Tx) (bool, error) {
		return repo.MarkEventProcessed(ctx, tx, eventID, "member.signedup")
	})
	require.True(t, first, "the first delivery of an event is new")

	second := inTx(t, db, func(tx *sqlx.Tx) (bool, error) {
		return repo.MarkEventProcessed(ctx, tx, eventID, "member.signedup")
	})
	assert.False(t, second, "a redelivery of the same event is not new")
}

// The key is composite so that one service can consume two event types that
// happen to share an id without either masking the other. A repository that
// narrowed the key to event_id alone would pass every test above this one.
func TestMarkEventProcessed_SameIDDifferentType_IsNotSuppressed(t *testing.T) {
	db := inboxDB(t)
	repo := NewRepo()
	ctx := context.Background()

	eventID := uuid.New()

	signedUp := inTx(t, db, func(tx *sqlx.Tx) (bool, error) {
		return repo.MarkEventProcessed(ctx, tx, eventID, "member.signedup")
	})
	require.True(t, signedUp, "the first delivery of an event is new")

	accountCreated := inTx(t, db, func(tx *sqlx.Tx) (bool, error) {
		return repo.MarkEventProcessed(ctx, tx, eventID, "account.created")
	})
	assert.True(t, accountCreated, "a different event type sharing an id is a different event")
}

// The mark is only worth anything if it lives or dies with the side effect it
// guards, which means the caller's transaction must own it. A repository that
// opened a transaction of its own would survive this rollback and swallow the
// event forever.
func TestMarkEventProcessed_RolledBackWithTheCallersTx(t *testing.T) {
	db := inboxDB(t)
	repo := NewRepo()
	ctx := context.Background()

	eventID := uuid.New()

	abandoned, err := db.Beginx()
	require.NoError(t, err)

	inserted, err := repo.MarkEventProcessed(ctx, abandoned, eventID, "member.signedup")
	require.NoError(t, err)
	require.True(t, inserted, "the first delivery of an event is new")
	require.NoError(t, abandoned.Rollback())

	retried := inTx(t, db, func(tx *sqlx.Tx) (bool, error) {
		return repo.MarkEventProcessed(ctx, tx, eventID, "member.signedup")
	})
	assert.True(t, retried, "a rolled-back mark left no record behind")
}

// --- helpers ---

// inTx runs fn in a committed transaction the caller owns, which is the only
// way MarkEventProcessed is ever meant to be called.
func inTx(t *testing.T, db *sqlx.DB, fn func(tx *sqlx.Tx) (bool, error)) bool {
	t.Helper()

	tx, err := db.Beginx()
	require.NoError(t, err)

	inserted, err := fn(tx)
	require.NoError(t, err)
	require.NoError(t, tx.Commit())

	return inserted
}

// inboxDB builds an isolated schema holding nothing but processed_events, and
// skips when no database was supplied.
func inboxDB(t *testing.T) *sqlx.DB {
	t.Helper()

	if testing.Short() {
		t.Skip("the inbox round trip needs a database; skipped under -short")
	}

	dsn := os.Getenv(dsnEnv)
	if dsn == "" {
		t.Skipf("set %s to a postgres the test may create a throwaway schema in", dsnEnv)
	}

	admin, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("no database reachable at %s: %v", dsnEnv, err)
	}
	defer func() { _ = admin.Close() }()

	_, err = admin.Exec(`DROP SCHEMA IF EXISTS ` + testSchema + ` CASCADE`)
	require.NoError(t, err)

	_, err = admin.Exec(`CREATE SCHEMA ` + testSchema)
	require.NoError(t, err)

	db, err := sqlx.Connect("postgres", withSearchPath(dsn, testSchema))
	require.NoError(t, err)

	_, err = db.Exec(processedEventsDDL)
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = db.Close()

		cleanup, err := sqlx.Connect("postgres", dsn)
		if err != nil {
			return
		}
		defer func() { _ = cleanup.Close() }()

		_, _ = cleanup.Exec(`DROP SCHEMA IF EXISTS ` + testSchema + ` CASCADE`)
	})

	return db
}

func withSearchPath(dsn string, schema string) string {
	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}

	return dsn + separator + "search_path=" + schema
}
