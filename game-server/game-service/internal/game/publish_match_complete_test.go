package game

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"sync"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const insertOutboxStmt = `INSERT INTO outbox`

// mockTxDB is a database whose transactions are real *sqlx.Tx values driven by
// sqlmock, so a test can assert the exact statement sequence of a write.
func mockTxDB(t *testing.T) (*sqlx.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return sqlx.NewDb(db, "postgres"), mock
}

// txBudget is how many begin/commit pairs committingTxDB scripts. sqlmock needs
// every transaction declared up front, and a test that ends a match opens one
// transaction per PublishMatchComplete; 16 covers every current test with room
// to spare. Raise it if a test legitimately ends more matches.
const txBudget = 16

// budgetedTxDB fails the test by name once committingTxDB's scripted
// transactions run out, instead of leaving sqlmock's "all expectations were
// already fulfilled" error buried in a log line and an empty outbox.
type budgetedTxDB struct {
	t    *testing.T
	db   *sqlx.DB
	mu   sync.Mutex
	used int
}

func (b *budgetedTxDB) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	b.mu.Lock()
	b.used++
	used := b.used
	b.mu.Unlock()
	if used > txBudget {
		b.t.Errorf("committingTxDB: transaction %d exceeds the scripted budget of %d; raise txBudget", used, txBudget)
	}
	return b.db.BeginTxx(ctx, opts)
}

// committingTxDB is a database that lets up to txBudget transactions begin and
// commit, for tests that only read what the outbox captured.
func committingTxDB(t *testing.T) TxBeginner {
	t.Helper()
	db, mock := mockTxDB(t)
	mock.MatchExpectationsInOrder(false)
	for range txBudget {
		mock.ExpectBegin()
		mock.ExpectCommit()
	}
	return &budgetedTxDB{t: t, db: db}
}

// countingOutbox counts CreateOutboxTx calls, so a test can prove a failed
// insert stops the write before the next one is attempted.
type countingOutbox struct {
	next  OutboxWriter
	calls int
}

func (c *countingOutbox) CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error {
	c.calls++
	return c.next.CreateOutboxTx(ctx, tx, params)
}

// errorLog captures ERROR records so a test can see what a failure logged.
type errorLog struct {
	mu      sync.Mutex
	records []slog.Record
}

func (l *errorLog) Enabled(_ context.Context, level slog.Level) bool { return level >= slog.LevelError }
func (l *errorLog) Handle(_ context.Context, r slog.Record) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.records = append(l.records, r)
	return nil
}
func (l *errorLog) WithAttrs(_ []slog.Attr) slog.Handler { return l }
func (l *errorLog) WithGroup(_ string) slog.Handler      { return l }

// loggedSessionID reports whether any ERROR record carries the session id.
func (l *errorLog) loggedSessionID(id uuid.UUID) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, r := range l.records {
		found := false
		r.Attrs(func(a slog.Attr) bool {
			if a.Key == "session_id" && a.Value.String() == id.String() {
				found = true
				return false
			}
			return true
		})
		if found {
			return true
		}
	}
	return false
}

func captureErrors(t *testing.T) *errorLog {
	t.Helper()
	log := &errorLog{}
	prev := slog.Default()
	slog.SetDefault(slog.New(log))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return log
}

// Both match-end rows are written in one transaction or not at all; any
// failure rolls back and is logged with the session id. FS-9TNJA
// §Requirements 13–17, I-9TNJA-4.
func TestPublishMatchComplete_OutboxRows_AllOrNothing(t *testing.T) {
	dbErr := errors.New("db down")
	itemsExtracted := func(mock sqlmock.Sqlmock) *sqlmock.ExpectedExec {
		return mock.ExpectExec(insertOutboxStmt).
			WithArgs(commonconstants.ItemsExtracted, commonconstants.GameEventsExchange, sqlmock.AnyArg())
	}
	matchEnded := func(mock sqlmock.Sqlmock) *sqlmock.ExpectedExec {
		return mock.ExpectExec(insertOutboxStmt).
			WithArgs(commonconstants.GameMatchEnded, commonconstants.GameEventsExchange, sqlmock.AnyArg())
	}

	tests := []struct {
		name        string
		expect      func(mock sqlmock.Sqlmock)
		wantInserts int
		wantError   bool
	}{
		{
			name: "both inserts succeed: commit",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				itemsExtracted(mock).WillReturnResult(sqlmock.NewResult(0, 1))
				matchEnded(mock).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectCommit()
			},
			wantInserts: 2,
		},
		{
			name: "begin fails: no inserts, no commit",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin().WillReturnError(dbErr)
			},
			wantInserts: 0,
			wantError:   true,
		},
		{
			name: "first insert fails: rollback, no commit",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				itemsExtracted(mock).WillReturnError(dbErr)
				mock.ExpectRollback()
			},
			wantInserts: 1,
			wantError:   true,
		},
		{
			name: "second insert fails: rollback, no commit",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				itemsExtracted(mock).WillReturnResult(sqlmock.NewResult(0, 1))
				matchEnded(mock).WillReturnError(dbErr)
				mock.ExpectRollback()
			},
			wantInserts: 2,
			wantError:   true,
		},
		{
			name: "commit fails: logged",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				itemsExtracted(mock).WillReturnResult(sqlmock.NewResult(0, 1))
				matchEnded(mock).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectCommit().WillReturnError(dbErr)
			},
			wantInserts: 2,
			wantError:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := mockTxDB(t)
			tt.expect(mock)
			errs := captureErrors(t)
			outbox := &countingOutbox{next: commonoutbox.NewService(commonoutbox.NewRepo(db))}
			svc := NewService(db, outbox)
			sessionID := uuid.New()

			svc.PublishMatchComplete(context.Background(), &types.RawMatchState{
				SessionID: sessionID,
				Players:   []types.RawPlayerState{{MemberID: uuid.NewString(), Username: "wren"}},
			})

			assert.NoError(t, mock.ExpectationsWereMet())
			assert.Equal(t, tt.wantInserts, outbox.calls,
				"a failed insert stops the write: no later insert is attempted")
			assert.Equal(t, tt.wantError, errs.loggedSessionID(sessionID),
				"a failed match-end write is logged with the session id")
		})
	}
}
