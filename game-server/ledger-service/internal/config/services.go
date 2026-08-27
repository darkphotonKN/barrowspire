package config

import (
	"context"

	ledgergrpc "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/grpc"
	ledgerquery "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/query"
	"github.com/jmoiron/sqlx"
)

// sets up all services and their dependency injections at
// server start once.

type Services struct {
	LedgerHandler *ledgergrpc.Handler
}

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	getTransactionQuery := ledgerquery.NewGetTransactionQuery(db)
	listEntriesQuery := ledgerquery.NewListEntriesQuery(db)
	ledgerHandler := ledgergrpc.NewHandler(getTransactionQuery, listEntriesQuery)

	return &Services{
		LedgerHandler: ledgerHandler,
	}
}
