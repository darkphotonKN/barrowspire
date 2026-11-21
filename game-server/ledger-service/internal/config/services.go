package config

import (
	"context"

	ledgeractivity "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/activity"
	ledgergrpc "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/grpc"
	ledgerquery "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/query"
	ledgerrepository "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/repository"
	ledgerusecase "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/usecase"
	"github.com/jmoiron/sqlx"
)

// sets up all services and their dependency injections at
// server start once.

type Services struct {
	LedgerHandler    *ledgergrpc.Handler
	LedgerActivities *ledgeractivity.Activities
}

// tracer names for the repository and query decorators
const (
	repoTracer  = "ledger/repository"
	queryTracer = "ledger/query"
)

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	// read side
	// each query is wrapped so it shows as a span above its SQL
	// (internal/ledger/grpc/trace_gen.go)
	getTransactionQuery := ledgergrpc.NewTransactionReaderWithTracing(ledgerquery.NewGetTransactionQuery(db), queryTracer)
	listEntriesQuery := ledgergrpc.NewEntriesReaderWithTracing(ledgerquery.NewListEntriesQuery(db), queryTracer)
	ledgerHandler := ledgergrpc.NewHandler(getTransactionQuery, listEntriesQuery)

	// write side: the saga's AppendLedgerTx activity -> use case -> repository
	// wrapped so each call is a span above its queries
	// (internal/ledger/repository/trace_gen.go)
	ledgerRepo := ledgerrepository.NewLedgerRepositoryWithTracing(ledgerrepository.NewLedgerRepository(db), repoTracer)
	appendTransactionUC := ledgerusecase.NewAppendTransactionUC(ledgerRepo)
	ledgerActivities := ledgeractivity.NewActivities(appendTransactionUC)

	return &Services{
		LedgerHandler:    ledgerHandler,
		LedgerActivities: ledgerActivities,
	}
}
