package config

import (
	"context"

	ledgergrpc "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/grpc"
	ledgerquery "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/query"
	ledgerrepo "github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/repository"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/usecase"
	"github.com/jmoiron/sqlx"
)

// sets up all services and their dependency injections at
// server start once.

type Services struct {
	LedgerHandler *ledgergrpc.Handler
}

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	ledgerRepo := ledgerrepo.NewLedgerRepository(db)
	createLedgerUC := usecase.NewCreateLedgerUC(ledgerRepo)
	getLedgerQuery := ledgerquery.NewGetLedgerQuery(db)
	ledgerHandler := ledgergrpc.NewHandler(createLedgerUC, getLedgerQuery)

	return &Services{
		LedgerHandler: ledgerHandler,
	}
}
