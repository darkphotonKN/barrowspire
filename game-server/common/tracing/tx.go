package tracing

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jmoiron/sqlx"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// TxBeginner begins a transaction. *sqlx.DB satisfies it.
type TxBeginner interface {
	BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error)
}

const txTracer = "barrowspire/tx"

// WithTx runs fn in one transaction: it commits when fn returns nil and rolls
// back otherwise. The transaction sits in a repo.tx span tagged with
// db.operation=operation, and fn gets the span's ctx, so the queries fn runs
// nest under it and a trace shows how long the transaction held its locks,
// not only how long each statement took.
//
// A rollback that itself fails is joined onto fn's error, so it is never lost.
func WithTx(ctx context.Context, db TxBeginner, operation string, fn func(ctx context.Context, tx *sqlx.Tx) error) (err error) {
	ctx, span := otel.Tracer(txTracer).Start(ctx, "repo.tx",
		trace.WithAttributes(attribute.String("db.operation", operation)))
	defer func() { EndSpan(span, err) }()

	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin %s tx: %w", operation, err)
	}

	if err = fn(ctx, tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil && !errors.Is(rbErr, sql.ErrTxDone) {
			err = errors.Join(err, fmt.Errorf("rollback %s tx: %w", operation, rbErr))
		}
		return err
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit %s tx: %w", operation, err)
	}
	return nil
}
