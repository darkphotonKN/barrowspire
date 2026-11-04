package tracing

import (
	"context"
	"database/sql/driver"
	"fmt"

	"github.com/XSAM/otelsql"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// OpenPostgres is sqlx.Connect("postgres", dsn) with every query as a child
// span of the request that ran it, statement text included. With tracing off
// the spans go to the no-op provider, so it is safe to use unconditionally.
func OpenPostgres(dsn string) (*sqlx.DB, error) {
	db, err := otelsql.Open("postgres", dsn,
		otelsql.WithAttributes(semconv.DBSystemPostgreSQL),
		otelsql.WithSpanOptions(otelsql.SpanOptions{
			// pool bookkeeping, not queries: one span each per call is noise
			OmitConnResetSession: true,
			OmitRows:             true,
			DisableErrSkip:       true,
			SpanFilter:           withinTrace,
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	sdb := sqlx.NewDb(db, "postgres")
	if err := sdb.Ping(); err != nil {
		_ = sdb.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return sdb, nil
}

// withinTrace keeps a query's span only when the query runs inside an existing
// trace. Background pollers (the outbox worker) query on a bare context, and
// without this every poll would start a one-span trace of its own.
func withinTrace(ctx context.Context, _ otelsql.Method, _ string, _ []driver.NamedValue) bool {
	return trace.SpanContextFromContext(ctx).IsValid()
}
