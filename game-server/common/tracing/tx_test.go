package tracing

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

func TestWithTx(t *testing.T) {
	errFn := errors.New("write failed")

	cases := []struct {
		name       string
		fnErr      error
		expect     func(m sqlmock.Sqlmock)
		wantErr    error
		wantStatus codes.Code
		skipsFn    bool
	}{
		{
			name:       "commits when fn succeeds",
			expect:     func(m sqlmock.Sqlmock) { m.ExpectBegin(); m.ExpectCommit() },
			wantStatus: codes.Unset,
		},
		{
			name:       "rolls back and fails the span when fn fails",
			fnErr:      errFn,
			expect:     func(m sqlmock.Sqlmock) { m.ExpectBegin(); m.ExpectRollback() },
			wantErr:    errFn,
			wantStatus: codes.Error,
		},
		{
			name:       "keeps fn's error when the rollback fails too",
			fnErr:      errFn,
			expect:     func(m sqlmock.Sqlmock) { m.ExpectBegin(); m.ExpectRollback().WillReturnError(errors.New("conn gone")) },
			wantErr:    errFn,
			wantStatus: codes.Error,
		},
		{
			name:       "a failed begin never calls fn",
			expect:     func(m sqlmock.Sqlmock) { m.ExpectBegin().WillReturnError(errors.New("pool exhausted")) },
			wantStatus: codes.Error,
			skipsFn:    true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := tracetest.NewSpanRecorder()
			prev := otel.GetTracerProvider()
			otel.SetTracerProvider(sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(rec)))
			t.Cleanup(func() { otel.SetTracerProvider(prev) })

			raw, mock, err := sqlmock.New()
			require.NoError(t, err)
			defer raw.Close()
			tc.expect(mock)
			db := sqlx.NewDb(raw, "sqlmock")

			var fnSpan trace.SpanContext
			err = WithTx(context.Background(), db, "test_op", func(ctx context.Context, _ *sqlx.Tx) error {
				fnSpan = trace.SpanContextFromContext(ctx)
				return tc.fnErr
			})

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
			}
			if tc.skipsFn {
				assert.Error(t, err)
				assert.False(t, fnSpan.IsValid(), "fn ran after a failed begin")
			}
			require.NoError(t, mock.ExpectationsWereMet())

			ended := rec.Ended()
			require.Len(t, ended, 1)
			span := ended[0]
			assert.Equal(t, "repo.tx", span.Name())
			assert.Contains(t, span.Attributes(), attribute.String("db.operation", "test_op"))
			assert.Equal(t, tc.wantStatus, span.Status().Code)
			if fnSpan.IsValid() {
				assert.Equal(t, span.SpanContext().SpanID(), fnSpan.SpanID(), "fn did not get the repo.tx span's ctx")
			}
		})
	}
}
