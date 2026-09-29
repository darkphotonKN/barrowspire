package config

import (
	"context"

	commoninbox "github.com/darkphotonKN/barrowspire-server/common/inbox"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	accountactivity "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/activity"
	accountgrpc "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/grpc"
	accountquery "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/query"
	accountrepo "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/repository"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/jmoiron/sqlx"
)

// sets up all services and their dependency injections at
// server start once.

// NOTE: OutboxService is held as commonoutbox.OutboxRetriever rather than the
// concrete type because commonoutbox.NewService returns an UNEXPORTED type,
// which no consumer can name. The interface is what the worker consumes anyway,
// so depending on it is the right shape regardless (DIP).

type Services struct {
	AccHandler       *accountgrpc.Handler
	CreateOnSignupUC *usecase.CreateAccountOnSignupUC
	OutboxService    commonoutbox.OutboxRetriever
	// Activities are the settlement steps wallet owns, registered on its
	// Temporal worker in main. CommitHold is reachable only this way (FS-NXP1W
	// §Req 7): never through gRPC.
	Activities *accountactivity.Activities
}

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	accountRepo := accountrepo.NewAccountRepository(db)
	placeHoldUC := usecase.NewPlaceHoldUC(accountRepo)
	createAccUC := usecase.NewCreateAccountUC(accountRepo)
	depositGoldUC := usecase.NewDepositGoldUC(accountRepo)
	withdrawGoldUC := usecase.NewWithdrawGoldUC(accountRepo)
	getAccQuery := accountquery.NewGetAccountQuery(db)

	accHandler := accountgrpc.NewHandler(accountgrpc.Deps{
		CreateAccountUC: createAccUC,
		PlaceHoldUC:     placeHoldUC,
		DepositGoldUC:   depositGoldUC,
		WithdrawGoldUC:  withdrawGoldUC,
		AccountReader:   getAccQuery,
	})

	// The event-driven birth path. Separate from createAccUC on purpose: this
	// one must write the account, its inbox row, and its outbox row in a single
	// transaction, which the gRPC path has no need of.
	outboxService := commonoutbox.NewService(commonoutbox.NewRepo(db))
	createOnSignupUC := usecase.NewCreateAccountOnSignupUC(
		db, accountRepo, commoninbox.NewRepo(), outboxService,
	)

	commitHoldUC := usecase.NewCommitHoldUC(accountRepo)
	releaseAllHoldsUC := usecase.NewReleaseAllHoldsUC(accountRepo)
	releaseLosingHoldsUC := usecase.NewReleaseLosingHoldsUC(accountRepo)
	activities := accountactivity.NewActivities(commitHoldUC, releaseAllHoldsUC, releaseLosingHoldsUC)

	return &Services{
		AccHandler:       accHandler,
		CreateOnSignupUC: createOnSignupUC,
		OutboxService:    outboxService,
		Activities:       activities,
	}
}
