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

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	// read side
	getTransactionQuery := ledgerquery.NewGetTransactionQuery(db)
	listEntriesQuery := ledgerquery.NewListEntriesQuery(db)
	ledgerHandler := ledgergrpc.NewHandler(getTransactionQuery, listEntriesQuery)

	// write side: the saga's AppendLedgerTx activity -> use case -> repository
	ledgerRepo := ledgerrepository.NewLedgerRepository(db)
	appendTransactionUC := ledgerusecase.NewAppendTransactionUC(ledgerRepo)
	ledgerActivities := ledgeractivity.NewActivities(appendTransactionUC)

	return &Services{
		LedgerHandler:    ledgerHandler,
		LedgerActivities: ledgerActivities,
	}
}
