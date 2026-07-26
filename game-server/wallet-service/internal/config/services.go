package config

import (
	"context"

	accountgrpc "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/grpc"
	accountquery "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/query"
	accountrepo "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/repository"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/jmoiron/sqlx"
)

// sets up all services and their dependency injections at
// server start once.

type Services struct {
	AccHandler *accountgrpc.Handler
}

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	accountRepo := accountrepo.NewAccountRepository(db)
	placeHoldUC := usecase.NewPlaceHoldUC(accountRepo)
	releaseHoldUC := usecase.NewReleaseHoldUC(accountRepo)
	createAccUC := usecase.NewCreateAccountUC(accountRepo)
	getAccQuery := accountquery.NewGetAccountQuery(db)
	accHandler := accountgrpc.NewHandler(createAccUC, placeHoldUC, releaseHoldUC, getAccQuery)

	return &Services{
		AccHandler: accHandler,
	}
}
