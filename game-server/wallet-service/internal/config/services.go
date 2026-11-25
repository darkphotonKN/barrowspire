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
	// ExpireHoldsUC is one pass of the hold sweep, run on a ticker in main
	// (FS-A3CQH). Reachable by nothing else: it takes no request.
	ExpireHoldsUC *usecase.ExpireHoldsUC
}

// tracer names for the repository and query decorators
const (
	repoTracer  = "wallet/repository"
	queryTracer = "wallet/query"
)

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	// every consumer takes the repository or query through its own interface,
	// wrapped so each call is a span above its SQL (the trace_gen.go files in
	// internal/account/repository, usecase and grpc)
	concreteAccountRepo := accountrepo.NewAccountRepository(db)
	accountRepo := accountrepo.NewAccountRepositoryWithTracing(concreteAccountRepo, repoTracer)
	placeHoldUC := usecase.NewPlaceHoldUC(accountRepo)
	releaseHoldUC := usecase.NewReleaseHoldUC(accountRepo)
	createAccUC := usecase.NewCreateAccountUC(accountRepo)
	depositGoldUC := usecase.NewDepositGoldUC(accountRepo)
	withdrawGoldUC := usecase.NewWithdrawGoldUC(accountRepo)
	getAccQuery := accountgrpc.NewAccountReaderWithTracing(accountquery.NewGetAccountQuery(db), queryTracer)
	processedActivities := usecase.NewActivityMarkerWithTracing(accountrepo.NewProcessedActivityRepo(), repoTracer)
	creditUC := usecase.NewCreditUC(db, usecase.NewCreditAccountsWithTracing(concreteAccountRepo, repoTracer), processedActivities)
	debitUC := usecase.NewDebitUC(db, usecase.NewDebitAccountsWithTracing(concreteAccountRepo, repoTracer), processedActivities)

	staleHoldsQuery := accountgrpc.NewStaleHoldsReaderWithTracing(accountquery.NewStaleReservedHoldsQuery(db), queryTracer)

	accHandler := accountgrpc.NewHandler(accountgrpc.Deps{
		CreateAccountUC:  createAccUC,
		PlaceHoldUC:      placeHoldUC,
		ReleaseHoldUC:    releaseHoldUC,
		DepositGoldUC:    depositGoldUC,
		WithdrawGoldUC:   withdrawGoldUC,
		CreditUC:         creditUC,
		DebitUC:          debitUC,
		AccountReader:    getAccQuery,
		StaleHoldsReader: staleHoldsQuery,
	})

	// The event-driven birth path. Separate from createAccUC on purpose: this
	// one must write the account, its inbox row, and its outbox row in a single
	// transaction, which the gRPC path has no need of.
	outboxService := commonoutbox.NewService(commonoutbox.NewRepo(db))
	createOnSignupUC := usecase.NewCreateAccountOnSignupUC(
		db, usecase.NewAccountWriterWithTracing(concreteAccountRepo, repoTracer), commoninbox.NewRepo(), outboxService,
	)

	commitHoldUC := usecase.NewCommitHoldUC(accountRepo)
	releaseAllHoldsUC := usecase.NewReleaseAllHoldsUC(accountRepo)
	releaseLosingHoldsUC := usecase.NewReleaseLosingHoldsUC(accountRepo)
	creditSellerUC := usecase.NewCreditSellerUC(db, usecase.NewSellerAccountsWithTracing(concreteAccountRepo, repoTracer), processedActivities)
	activities := accountactivity.NewActivities(commitHoldUC, releaseAllHoldsUC, releaseLosingHoldsUC, creditSellerUC, releaseHoldUC)

	// holdAccounts is a subset of account.Repository, so the traced repository serves it
	expireHoldsUC := usecase.NewExpireHoldsUC(usecase.NewExpiredHoldsWithTracing(accountquery.NewExpiredHoldsQuery(db), queryTracer), accountRepo)

	return &Services{
		AccHandler:       accHandler,
		CreateOnSignupUC: createOnSignupUC,
		OutboxService:    outboxService,
		Activities:       activities,
		ExpireHoldsUC:    expireHoldsUC,
	}
}
