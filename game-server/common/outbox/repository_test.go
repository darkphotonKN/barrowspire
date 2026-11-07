package outbox

import (
	"bytes"
	"context"
	"database/sql/driver"
	"errors"
	"log/slog"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	lockPendingBatchPattern = `(?s)SELECT\s+id,\s+routing_key,\s+exchange,\s+payload,\s+created_at\s+FROM outbox\s+WHERE published_at IS NULL\s+ORDER BY created_at ASC\s+LIMIT \$1\s+FOR UPDATE SKIP LOCKED\s*$`
	markPublishedPattern    = `(?s)UPDATE outbox\s+SET published_at = NOW\(\)\s+WHERE id = ANY\(\$1::uuid\[\]\)\s*$`
)

var batchColumns = []string{"id", "routing_key", "exchange", "payload", "created_at"}

func newMockRepo(t *testing.T) (*repo, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return NewRepo(sqlx.NewDb(db, "postgres")), mock
}

func intPtr(n int) *int { return &n }

// handlerSpy is a BatchHandler that records what it was handed and reports
// the given rows as sent.
type handlerSpy struct {
	calls  int
	events []*OutboxEvent
	send   func(events []*OutboxEvent) []uuid.UUID
}

func (h *handlerSpy) handle(_ context.Context, events []*OutboxEvent) []uuid.UUID {
	h.calls++
	h.events = events
	if h.send == nil {
		return nil
	}
	return h.send(events)
}

func sendAll(events []*OutboxEvent) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(events))
	for _, e := range events {
		ids = append(ids, e.ID)
	}
	return ids
}

func uuidArray(ids ...uuid.UUID) pq.StringArray {
	out := make(pq.StringArray, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	return out
}

// The batch is locked with SKIP LOCKED inside a transaction and binds the
// batch size, 20 when none is given. An empty batch never reaches the handler
// and the transaction is still ended. ADR-0069 §Decision 2, I-ADR0069-1.
func TestRelayPendingBatch_Limit_BindsBatchSizeInATransaction(t *testing.T) {
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
			mock.ExpectBegin()
			mock.ExpectQuery(lockPendingBatchPattern).WithArgs(tt.wantLimit).WillReturnRows(sqlmock.NewRows(batchColumns))
			mock.ExpectRollback()
			spy := &handlerSpy{send: sendAll}

			marked, err := r.RelayPendingBatch(context.Background(), tt.limit, spy.handle)

			require.NoError(t, err)
			assert.Zero(t, marked)
			assert.Zero(t, spy.calls, "an empty batch is not handed over")
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// The locked rows are handed over oldest first, and exactly the ids the
// handler reports as sent are marked published in the same transaction,
// which then commits. ADR-0069 §Decision 2–3, I-ADR0069-1.
func TestRelayPendingBatch_Rows_HandedOverAndSentOnesMarkedThenCommitted(t *testing.T) {
	r, mock := newMockRepo(t)
	older, newer := uuid.New(), uuid.New()
	t0 := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	mock.ExpectBegin()
	mock.ExpectQuery(lockPendingBatchPattern).WithArgs(2).
		WillReturnRows(sqlmock.NewRows(batchColumns).
			AddRow(older.String(), "match.ended", "game", []byte(`{"a":1}`), t0).
			AddRow(newer.String(), "items.extracted", "game", []byte(`{"b":2}`), t0.Add(time.Second)))
	mock.ExpectExec(markPublishedPattern).WithArgs(uuidArray(older)).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	spy := &handlerSpy{send: func(events []*OutboxEvent) []uuid.UUID { return []uuid.UUID{events[0].ID} }}

	marked, err := r.RelayPendingBatch(context.Background(), intPtr(2), spy.handle)

	require.NoError(t, err)
	assert.Equal(t, 1, marked)
	require.Len(t, spy.events, 2)
	assert.Equal(t, &OutboxEvent{ID: older, RoutingKey: "match.ended", Exchange: "game", Payload: []byte(`{"a":1}`), CreatedAt: t0}, spy.events[0])
	assert.Equal(t, newer, spy.events[1].ID)
	assert.Equal(t, "items.extracted", spy.events[1].RoutingKey)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// A batch where nothing was sent writes nothing, and its transaction is ended,
// which releases the locks for the next batch. ADR-0069 §Decision 3.
func TestRelayPendingBatch_NothingSent_WritesNothingAndEndsTheTransaction(t *testing.T) {
	r, mock := newMockRepo(t)
	mock.ExpectBegin()
	mock.ExpectQuery(lockPendingBatchPattern).WithArgs(20).
		WillReturnRows(sqlmock.NewRows(batchColumns).AddRow(uuid.NewString(), "match.ended", "game", []byte(`{}`), time.Now()))
	mock.ExpectRollback()
	spy := &handlerSpy{}

	marked, err := r.RelayPendingBatch(context.Background(), nil, spy.handle)

	require.NoError(t, err)
	assert.Zero(t, marked)
	assert.Equal(t, 1, spy.calls)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// Every failing step is wrapped with the repo and the operation, nothing is
// reported marked, and the transaction is ended whatever step failed.
// ADR-0069 §Decision 4.
func TestRelayPendingBatch_DBError_WrappedAndTheTransactionEnded(t *testing.T) {
	dbErr := errors.New("connection reset")
	row := func() *sqlmock.Rows {
		return sqlmock.NewRows(batchColumns).AddRow(uuid.NewString(), "match.ended", "game", []byte(`{}`), time.Now())
	}
	tests := []struct {
		name        string
		expect      func(mock sqlmock.Sqlmock)
		wantHandled bool
	}{
		{
			name:   "begin fails",
			expect: func(mock sqlmock.Sqlmock) { mock.ExpectBegin().WillReturnError(dbErr) },
		},
		{
			name: "lock query fails",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectQuery(lockPendingBatchPattern).WillReturnError(dbErr)
				mock.ExpectRollback()
			},
		},
		{
			name: "mark fails",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectQuery(lockPendingBatchPattern).WillReturnRows(row())
				mock.ExpectExec(markPublishedPattern).WillReturnError(dbErr)
				mock.ExpectRollback()
			},
			wantHandled: true,
		},
		{
			name: "commit fails",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectQuery(lockPendingBatchPattern).WillReturnRows(row())
				mock.ExpectExec(markPublishedPattern).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectCommit().WillReturnError(dbErr)
			},
			wantHandled: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, mock := newMockRepo(t)
			tt.expect(mock)
			spy := &handlerSpy{send: sendAll}

			marked, err := r.RelayPendingBatch(context.Background(), nil, spy.handle)

			require.ErrorIs(t, err, dbErr)
			assert.Contains(t, err.Error(), "outbox repo")
			assert.Contains(t, err.Error(), "relay pending batch")
			assert.Zero(t, marked)
			assert.Equal(t, tt.wantHandled, spy.calls == 1)
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
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

// The relay's correctness is a race the database arbitrates (row locks,
// SKIP LOCKED), so these tests run against a real postgres. common owns no
// database of its own and must not reach for a service's, so the DSN is
// opt-in, as common/inbox does it, and every test works in a throwaway schema.
const outboxDSNEnv = "OUTBOX_TEST_DB_DSN"

// outboxTestSchemaPrefix names each test's throwaway schema; a random suffix
// keeps two runs on one database (or a schema a crashed run left behind) apart.
const outboxTestSchemaPrefix = "outbox_relay_test_"

// The shape every service ships as its own outbox migration (auth, game,
// items, marketplace, stats, wallet), restated here because the package under
// test is code without storage.
const outboxDDL = `
CREATE TABLE outbox (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	routing_key VARCHAR(255) NOT NULL,
	exchange VARCHAR(255) NOT NULL,
	payload BYTEA NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	published_at TIMESTAMPTZ NULL
);
CREATE INDEX idx_outbox_pending ON outbox (created_at) WHERE published_at IS NULL;
`

// outboxDSN builds a fresh throwaway schema holding nothing but an outbox
// table and returns a DSN pinned to it, or skips when no database was given.
func outboxDSN(t *testing.T) string {
	t.Helper()

	if testing.Short() {
		t.Skip("the outbox relay tests need a database; skipped under -short")
	}
	dsn := os.Getenv(outboxDSNEnv)
	if dsn == "" {
		t.Skipf("set %s to a postgres the test may create a throwaway schema in", outboxDSNEnv)
	}

	admin, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("no database reachable at %s: %v", outboxDSNEnv, err)
	}
	defer func() { _ = admin.Close() }()

	schema := outboxTestSchemaPrefix + strings.ReplaceAll(uuid.NewString()[:13], "-", "")
	_, err = admin.Exec(`CREATE SCHEMA ` + schema)
	require.NoError(t, err)

	scoped := withSearchPath(dsn, schema)
	db := openPool(t, scoped, 1)
	_, err = db.Exec(outboxDDL)
	require.NoError(t, err)

	t.Cleanup(func() {
		cleanup, err := sqlx.Connect("postgres", dsn)
		if err != nil {
			return
		}
		defer func() { _ = cleanup.Close() }()
		_, _ = cleanup.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`)
	})

	return scoped
}

// outboxDB is one 2-connection pool on a fresh throwaway outbox, the pool
// size most services run with.
func outboxDB(t *testing.T) *sqlx.DB {
	t.Helper()
	return openPool(t, outboxDSN(t), 2)
}

// openPool opens a pool of its own on dsn: two pools on one outbox are what
// two replicas of a service are, from postgres's side.
func openPool(t *testing.T, dsn string, maxConns int) *sqlx.DB {
	t.Helper()
	db, err := sqlx.Connect("postgres", dsn)
	require.NoError(t, err)
	db.SetMaxOpenConns(maxConns)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func withSearchPath(dsn, schema string) string {
	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	return dsn + separator + "search_path=" + schema
}

// seedRows writes n pending rows a millisecond apart and returns their ids
// oldest first, the order the relay takes them in.
func seedRows(t *testing.T, db *sqlx.DB, n int) []uuid.UUID {
	t.Helper()
	_, err := db.Exec(`
		INSERT INTO outbox (routing_key, exchange, payload, created_at)
		SELECT 'test.key', 'test.exchange', '\x00'::bytea, clock_timestamp() + g * interval '1 millisecond'
		FROM generate_series(1, $1) AS g`, n)
	require.NoError(t, err)

	var ids []uuid.UUID
	require.NoError(t, db.Select(&ids, `SELECT id FROM outbox WHERE published_at IS NULL ORDER BY created_at DESC LIMIT $1`, n))
	for i, j := 0, len(ids)-1; i < j; i, j = i+1, j-1 {
		ids[i], ids[j] = ids[j], ids[i]
	}
	return ids
}

// rowsWhere lists outbox ids, oldest first, matching a published_at condition.
func rowsWhere(t *testing.T, db *sqlx.DB, cond string) []uuid.UUID {
	t.Helper()
	ids := []uuid.UUID{}
	require.NoError(t, db.Select(&ids, `SELECT id FROM outbox WHERE `+cond+` ORDER BY created_at`))
	return ids
}

func pendingRows(t *testing.T, db *sqlx.DB) []uuid.UUID {
	return rowsWhere(t, db, "published_at IS NULL")
}

func publishedRows(t *testing.T, db *sqlx.DB) []uuid.UUID {
	return rowsWhere(t, db, "published_at IS NOT NULL")
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

// A step that fails on the batch deadline keeps its name in the error, along
// with the deadline itself, rather than collapsing to a bare transient error,
// so the log says where the batch ran out of time.
func TestRelayPendingBatch_DeadlineError_KeepsItsStep(t *testing.T) {
	row := func() *sqlmock.Rows {
		return sqlmock.NewRows(batchColumns).AddRow(uuid.NewString(), "match.ended", "game", []byte(`{}`), time.Now())
	}
	tests := []struct {
		step   string
		expect func(mock sqlmock.Sqlmock)
	}{
		{"begin", func(mock sqlmock.Sqlmock) { mock.ExpectBegin().WillReturnError(context.DeadlineExceeded) }},
		{"lock", func(mock sqlmock.Sqlmock) {
			mock.ExpectBegin()
			mock.ExpectQuery(lockPendingBatchPattern).WillReturnError(context.DeadlineExceeded)
			mock.ExpectRollback()
		}},
		{"mark published", func(mock sqlmock.Sqlmock) {
			mock.ExpectBegin()
			mock.ExpectQuery(lockPendingBatchPattern).WillReturnRows(row())
			mock.ExpectExec(markPublishedPattern).WillReturnError(context.DeadlineExceeded)
			mock.ExpectRollback()
		}},
		{"commit", func(mock sqlmock.Sqlmock) {
			mock.ExpectBegin()
			mock.ExpectQuery(lockPendingBatchPattern).WillReturnRows(row())
			mock.ExpectExec(markPublishedPattern).WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectCommit().WillReturnError(context.DeadlineExceeded)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.step, func(t *testing.T) {
			r, mock := newMockRepo(t)
			tt.expect(mock)

			_, err := r.RelayPendingBatch(context.Background(), nil, (&handlerSpy{send: sendAll}).handle)

			require.ErrorIs(t, err, context.DeadlineExceeded)
			assert.Contains(t, err.Error(), "relay pending batch: "+tt.step+":")
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

// A publish that fails mid-batch stops the batch there: the rows sent before
// it are marked and committed, the failed row and the ones after it stay
// pending, and their locks are released, so the next batch takes them.
// ADR-0069 §Decision 3, I-ADR0069-1.
func TestPublishOutboxEvents_PublishFailsMidBatch_SentRowsMarkedRestReleased(t *testing.T) {
	dsn := outboxDSN(t)
	db := openPool(t, dsn, 2)
	ids := seedRows(t, db, 5)
	pub := &fakePublisher{failFor: map[string]bool{ids[2].String(): true}}
	w := NewOutboxWorker(time.Second, 20, NewService(NewRepo(db)), pub, &sync.WaitGroup{})

	require.NoError(t, w.PublishOutboxEvents(context.Background()))

	assert.Equal(t, []string{ids[0].String(), ids[1].String(), ids[2].String()}, pub.messageIds(), "publishing stops at the failed row")
	assert.Equal(t, ids[:2], publishedRows(t, db), "rows sent before the failure are marked")
	assert.Equal(t, ids[2:], pendingRows(t, db), "the failed row and the ones after it stay pending")

	// the broker is back: the released rows go out on the next batch, from another pool
	pub.failFor = map[string]bool{}
	next := NewOutboxWorker(time.Second, 20, NewService(NewRepo(openPool(t, dsn, 2))), pub, &sync.WaitGroup{})
	require.NoError(t, next.PublishOutboxEvents(context.Background()))
	assert.Equal(t, ids, publishedRows(t, db))
	assert.Empty(t, pendingRows(t, db))
}

// While one batch holds rows, a second batch from another pool takes the
// others, and a third finds none; neither waits on the first. ADR-0069
// §Decision 2 (SKIP LOCKED), I-ADR0069-1.
func TestRelayPendingBatch_SecondBatchWhileFirstHolds_GetsTheOthersWithoutWaiting(t *testing.T) {
	dsn := outboxDSN(t)
	first, second, third := NewRepo(openPool(t, dsn, 2)), NewRepo(openPool(t, dsn, 2)), NewRepo(openPool(t, dsn, 2))
	ids := seedRows(t, first.db, 4)
	two := intPtr(2)

	var held, others, rest []uuid.UUID
	var secondTook, thirdTook time.Duration
	var secondErr, thirdErr error
	_, err := first.RelayPendingBatch(context.Background(), two, func(_ context.Context, events []*OutboxEvent) []uuid.UUID {
		held = sendAll(events)

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		start := time.Now()
		_, secondErr = second.RelayPendingBatch(ctx, two, func(_ context.Context, events []*OutboxEvent) []uuid.UUID {
			others = sendAll(events)

			start := time.Now()
			_, thirdErr = third.RelayPendingBatch(ctx, two, func(_ context.Context, events []*OutboxEvent) []uuid.UUID {
				rest = sendAll(events)
				return nil
			})
			thirdTook = time.Since(start)
			return nil
		})
		secondTook = time.Since(start)
		return nil
	})
	require.NoError(t, err)
	require.NoError(t, secondErr)
	require.NoError(t, thirdErr)

	assert.Equal(t, ids[:2], held)
	assert.Equal(t, ids[2:], others, "the second batch skips the held rows and takes the rest")
	assert.Empty(t, rest, "with every row held, the third batch gets none")
	assert.Less(t, secondTook, time.Second, "the second batch does not wait on the first")
	assert.Less(t, thirdTook, 500*time.Millisecond, "the third batch does not wait either")
	assert.Equal(t, ids, pendingRows(t, first.db), "nothing was sent, so nothing is marked")
}

// When the batch deadline passes while a publish is still blocked (the amqp
// publisher ignores its context), the transaction is rolled back anyway: the
// rows can be locked by another batch before the publish returns, and nothing
// from the timed-out batch is marked. ADR-0069 §Decision 4, I-ADR0069-1.
func TestRelayPendingBatch_DeadlinePassesMidPublish_TransactionEndsAndRowsRelease(t *testing.T) {
	dsn := outboxDSN(t)
	stuck, other := NewRepo(openPool(t, dsn, 2)), NewRepo(openPool(t, dsn, 2))
	ids := seedRows(t, stuck.db, 3)

	type result struct {
		marked int
		err    error
	}
	entered, unblock, done := make(chan struct{}), make(chan struct{}), make(chan result, 1)
	var unblockOnce sync.Once
	release := func() { unblockOnce.Do(func() { close(unblock) }) }
	t.Cleanup(release) // a failed assertion below still lets the held batch return
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	go func() {
		marked, err := stuck.RelayPendingBatch(ctx, nil, func(_ context.Context, events []*OutboxEvent) []uuid.UUID {
			close(entered)
			<-unblock // a publish call that ignores its context
			return sendAll(events)
		})
		done <- result{marked, err}
	}()
	<-entered

	var retaken []uuid.UUID
	deadline := time.Now().Add(3 * time.Second)
	for len(retaken) == 0 && time.Now().Before(deadline) {
		pollCtx, pollCancel := context.WithTimeout(context.Background(), time.Second)
		_, err := other.RelayPendingBatch(pollCtx, nil, func(_ context.Context, events []*OutboxEvent) []uuid.UUID {
			retaken = sendAll(events)
			return nil
		})
		pollCancel()
		require.NoError(t, err)
		if len(retaken) == 0 {
			time.Sleep(20 * time.Millisecond)
		}
	}
	select {
	case <-done:
		t.Fatal("the stuck batch returned before its publish was unblocked")
	default:
	}
	assert.Equal(t, ids, retaken, "the rows are released while the publish is still blocked")

	release()
	res := <-done
	require.Error(t, res.err, "the timed-out batch reports its failure")
	assert.Contains(t, res.err.Error(), "mark published", "the error names the step that ran out of time")
	assert.Zero(t, res.marked)
	assert.Equal(t, ids, pendingRows(t, stuck.db), "nothing from the timed-out batch is marked")
}
