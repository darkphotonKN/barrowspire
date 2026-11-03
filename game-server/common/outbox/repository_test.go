package outbox

import (
	"bytes"
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const unpublishedBatchQuery = `(?s)SELECT\s+id,\s+routing_key,\s+exchange,\s+payload,\s+created_at\s+FROM outbox\s+WHERE published_at IS NULL\s+ORDER BY created_at ASC\s+LIMIT \$1\s*$`

func newMockRepo(t *testing.T) (*repo, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return NewRepo(sqlx.NewDb(db, "postgres")), mock
}

func intPtr(n int) *int { return &n }

func TestGetUnpublishedOutboxItems_Limit_BindsBatchSize(t *testing.T) {
	tests := []struct {
		name      string
		limit     *int
		wantLimit int
	}{
		{"explicit limit", intPtr(5), 5},
		{"nil limit defaults to 20", nil, 20},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, mock := newMockRepo(t)
			mock.ExpectQuery(unpublishedBatchQuery).
				WithArgs(tt.wantLimit).
				WillReturnRows(sqlmock.NewRows([]string{"id", "routing_key", "exchange", "payload", "created_at"}))

			items, err := r.GetUnpublishedOutboxItems(context.Background(), tt.limit)

			require.NoError(t, err)
			assert.Empty(t, items)
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestGetUnpublishedOutboxItems_Rows_MappedOldestFirst(t *testing.T) {
	r, mock := newMockRepo(t)
	older, newer := uuid.New(), uuid.New()
	t0 := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	mock.ExpectQuery(unpublishedBatchQuery).
		WithArgs(2).
		WillReturnRows(sqlmock.NewRows([]string{"id", "routing_key", "exchange", "payload", "created_at"}).
			AddRow(older.String(), "match.ended", "game", []byte(`{"a":1}`), t0).
			AddRow(newer.String(), "items.extracted", "game", []byte(`{"b":2}`), t0.Add(time.Second)))

	items, err := r.GetUnpublishedOutboxItems(context.Background(), intPtr(2))

	require.NoError(t, err)
	require.Len(t, items, 2)
	assert.Equal(t, &OutboxEvent{ID: older, RoutingKey: "match.ended", Exchange: "game", Payload: []byte(`{"a":1}`), CreatedAt: t0}, items[0])
	assert.Equal(t, newer, items[1].ID)
	assert.Equal(t, "items.extracted", items[1].RoutingKey)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestGetUnpublishedOutboxItems_DBError_WrappedWithContext(t *testing.T) {
	r, mock := newMockRepo(t)
	dbErr := errors.New("connection reset")
	mock.ExpectQuery(unpublishedBatchQuery).WithArgs(20).WillReturnError(dbErr)

	items, err := r.GetUnpublishedOutboxItems(context.Background(), nil)

	assert.Nil(t, items)
	require.ErrorIs(t, err, dbErr)
	assert.Contains(t, err.Error(), "outbox repo")
	assert.Contains(t, err.Error(), "get unpublished outbox items")
	assert.NoError(t, mock.ExpectationsWereMet())
}

const (
	insertWithoutIDQuery = `(?s)INSERT INTO outbox\(routing_key, exchange, payload\)\s+VALUES\(\$1, \$2, \$3\)\s*$`
	insertWithIDQuery    = `(?s)INSERT INTO outbox\(id, routing_key, exchange, payload\)\s+VALUES\(\$1, \$2, \$3, \$4\)\s+ON CONFLICT \(id\) DO NOTHING\s*$`
)

// createOutboxEntry is one of the repo's two insert entry points, so every
// insert case runs against both. expectInsert declares the insert, after the
// begin when the entry point writes in a transaction.
type createOutboxEntry func(t *testing.T, r *repo, mock sqlmock.Sqlmock, expectInsert func(), params OutboxParams) error

var createOutboxEntries = map[string]createOutboxEntry{
	"CreateOutbox": func(_ *testing.T, r *repo, _ sqlmock.Sqlmock, expectInsert func(), params OutboxParams) error {
		expectInsert()
		return r.CreateOutbox(context.Background(), params)
	},
	"CreateOutboxTx": func(t *testing.T, r *repo, mock sqlmock.Sqlmock, expectInsert func(), params OutboxParams) error {
		mock.ExpectBegin()
		expectInsert()
		tx, err := r.db.Beginx()
		require.NoError(t, err)
		return r.CreateOutboxTx(context.Background(), tx, params)
	},
}

// A row given an id is written under it, and a row whose id already exists is
// a no-op that reports success, so a retried write leaves one row; the skip is
// warned with the id and routing key, so a collision is never silent. A row
// without an id is written as before, under an id the database picks.
// FS-GV8WN §B R7, I-GV8WN-1.
func TestCreateOutbox_ID_WrittenUnderItOnceWithoutKeepsDatabaseID(t *testing.T) {
	id := uuid.New()
	payload := []byte(`{"a":1}`)

	tests := []struct {
		name         string
		params       OutboxParams
		query        string
		args         []driver.Value
		rowsAffected int64
		wantWarn     bool
	}{
		{
			name:         "with id, new row: inserted under it",
			params:       OutboxParams{ID: id, RoutingKey: "items.extracted", Exchange: "game", Payload: payload},
			query:        insertWithIDQuery,
			args:         []driver.Value{id, "items.extracted", "game", payload},
			rowsAffected: 1,
		},
		{
			name:         "with id, row exists: nothing written, warned, success",
			params:       OutboxParams{ID: id, RoutingKey: "items.extracted", Exchange: "game", Payload: payload},
			query:        insertWithIDQuery,
			args:         []driver.Value{id, "items.extracted", "game", payload},
			rowsAffected: 0,
			wantWarn:     true,
		},
		{
			name:         "without id: the database picks it, as before",
			params:       OutboxParams{RoutingKey: "member.created", Exchange: "auth", Payload: payload},
			query:        insertWithoutIDQuery,
			args:         []driver.Value{"member.created", "auth", payload},
			rowsAffected: 1,
		},
	}

	for entryName, entry := range createOutboxEntries {
		for _, tt := range tests {
			t.Run(entryName+"/"+tt.name, func(t *testing.T) {
				var logs bytes.Buffer
				prev := slog.Default()
				slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelWarn})))
				t.Cleanup(func() { slog.SetDefault(prev) })
				r, mock := newMockRepo(t)

				err := entry(t, r, mock, func() {
					mock.ExpectExec(tt.query).WithArgs(tt.args...).
						WillReturnResult(sqlmock.NewResult(0, tt.rowsAffected))
				}, tt.params)

				require.NoError(t, err)
				assert.NoError(t, mock.ExpectationsWereMet())
				if tt.wantWarn {
					assert.Contains(t, logs.String(), "level=WARN")
					assert.Contains(t, logs.String(), "id="+tt.params.ID.String())
					assert.Contains(t, logs.String(), "routing_key="+tt.params.RoutingKey)
				} else {
					assert.Empty(t, logs.String())
				}
			})
		}
	}
}

// A failed insert is wrapped with the repo and the operation, with or without an id.
func TestCreateOutbox_DBError_WrappedWithContext(t *testing.T) {
	dbErr := errors.New("connection reset")
	tests := []struct {
		name   string
		params OutboxParams
	}{
		{"with id", OutboxParams{ID: uuid.New(), RoutingKey: "match.ended", Exchange: "game", Payload: []byte(`{}`)}},
		{"without id", OutboxParams{RoutingKey: "member.created", Exchange: "auth", Payload: []byte(`{}`)}},
	}

	for entryName, entry := range createOutboxEntries {
		for _, tt := range tests {
			t.Run(entryName+"/"+tt.name, func(t *testing.T) {
				r, mock := newMockRepo(t)

				err := entry(t, r, mock, func() {
					mock.ExpectExec(`INSERT INTO outbox`).WillReturnError(dbErr)
				}, tt.params)

				require.ErrorIs(t, err, dbErr)
				assert.Contains(t, err.Error(), "outbox repo")
				assert.Contains(t, err.Error(), "create outbox")
				assert.NoError(t, mock.ExpectationsWereMet())
			})
		}
	}
}

// outboxDB is a real Postgres connection whose outbox is a TEMP table of the
// services' shape, so the test never writes rows a running outbox worker
// would publish. The pool keeps one connection: a temp table lives only in the
// session that made it. Defaults are the local compose values; skips when the
// database is unreachable.
func outboxDB(t *testing.T) *sqlx.DB {
	t.Helper()

	get := func(k, fallback string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return fallback
	}
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		get("DB_USER", "user"), get("DB_PASSWORD", "password"),
		get("DB_HOST", "localhost"), get("DB_PORT", "5432"),
		get("DB_NAME", "barrowspire_game_service_db"))

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("outbox database unreachable, skipping integration test: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	db.SetMaxOpenConns(1)

	_, err = db.Exec(`
		CREATE TEMP TABLE outbox (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			routing_key VARCHAR(255) NOT NULL,
			exchange VARCHAR(255) NOT NULL,
			payload BYTEA NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			published_at TIMESTAMPTZ
		)`)
	require.NoError(t, err)

	return db
}

func commitOutboxTx(t *testing.T, r *repo, params OutboxParams) {
	t.Helper()
	tx, err := r.db.Beginx()
	require.NoError(t, err)
	require.NoError(t, r.CreateOutboxTx(context.Background(), tx, params))
	require.NoError(t, tx.Commit())
}

// The same settlement written twice, in two transactions, leaves one row under
// its own id, and both writes succeed. FS-GV8WN §B R7, I-GV8WN-1.
func TestCreateOutboxTx_SameIDTwice_OneRow(t *testing.T) {
	r := NewRepo(outboxDB(t))
	params := OutboxParams{ID: uuid.New(), RoutingKey: "items.extracted", Exchange: "game", Payload: []byte(`{"a":1}`)}

	commitOutboxTx(t, r, params)
	commitOutboxTx(t, r, params)

	var ids []uuid.UUID
	require.NoError(t, r.db.Select(&ids, `SELECT id FROM outbox`))
	assert.Equal(t, []uuid.UUID{params.ID}, ids)
}

// Rows without an id each get their own database-picked id, as before.
func TestCreateOutboxTx_NoIDTwice_TwoRows(t *testing.T) {
	r := NewRepo(outboxDB(t))
	params := OutboxParams{RoutingKey: "member.created", Exchange: "auth", Payload: []byte(`{}`)}

	commitOutboxTx(t, r, params)
	commitOutboxTx(t, r, params)

	var ids []uuid.UUID
	require.NoError(t, r.db.Select(&ids, `SELECT id FROM outbox`))
	require.Len(t, ids, 2)
	assert.NotEqual(t, ids[0], ids[1])
	assert.NotContains(t, ids, uuid.Nil)
}
