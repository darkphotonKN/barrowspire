package outbox

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
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
