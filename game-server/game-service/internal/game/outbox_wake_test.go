package game

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/stretchr/testify/assert"
)

// noWake is an OutboxWaker for tests that do not look at wakes.
type noWake struct{}

func (noWake) Wake() {}

// countingWaker counts wakes, so a test can see whether the outbox worker was
// asked to drain.
type countingWaker struct {
	mu    sync.Mutex
	wakes int
}

func (c *countingWaker) Wake() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.wakes++
}

func (c *countingWaker) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.wakes
}

// The outbox worker is woken once the match-end rows are committed, so they go
// out at once instead of at the next tick; a write that does not commit has
// nothing to send and wakes no one.
func TestMatchEndWrite_WakesTheOutboxOnlyAfterCommit(t *testing.T) {
	tests := []struct {
		name      string
		script    func(mock sqlmock.Sqlmock)
		wantWakes int
	}{
		{
			name: "committed: woken once",
			script: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectExec(insertOutboxStmt).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectExec(insertOutboxStmt).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectCommit()
			},
			wantWakes: 1,
		},
		{
			name: "a row fails: rolled back, not woken",
			script: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectExec(insertOutboxStmt).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectExec(insertOutboxStmt).WillReturnError(errors.New("db down"))
				mock.ExpectRollback()
			},
			wantWakes: 0,
		},
		{
			name: "commit fails: not woken",
			script: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectExec(insertOutboxStmt).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectExec(insertOutboxStmt).WillReturnResult(sqlmock.NewResult(0, 1))
				mock.ExpectCommit().WillReturnError(errors.New("connection lost"))
			},
			wantWakes: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := mockTxDB(t)
			tt.script(mock)
			waker := &countingWaker{}
			svc := NewService(db, commonoutbox.NewService(commonoutbox.NewRepo(db)), waker)

			_ = svc.PublishFieldVisit(context.Background(), endedVisit())

			assert.Equal(t, tt.wantWakes, waker.count())
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}
