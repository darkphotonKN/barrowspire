package config

import (
	"context"

	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing"
	listingactivity "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/activity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/adapter/itemreserver"
	listinggrpc "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/grpc"
	listingquery "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/query"
	listingrepo "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/repository"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/worker"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/releasehold"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/settlement"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/withdrawlisting"
	"github.com/jmoiron/sqlx"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.temporal.io/sdk/client"
)

// sets up all services and their dependency injections at
// server start once.

type Services struct {
	ListingHandler          *listinggrpc.Handler
	ReconcileReservationsUC *usecase.ReconcileReservationsUC
	// Activities are the settlement steps marketplace owns, registered on its
	// Temporal worker in main.
	Activities *listingactivity.Activities
	// ExceptionActivities raise and resolve the exception a parked step records
	// (FS-NXP1W Req 10), registered next to Activities.
	ExceptionActivities *listingactivity.ExceptionActivities
}

// tracer names for the repository and query decorators
const (
	repoTracer  = "marketplace/repository"
	queryTracer = "marketplace/query"
)

func NewServices(ctx context.Context, db *sqlx.DB, itemsClient itemreserver.ItemReserverClient, walletClient *listinggrpc.Client, ch *amqp.Channel, temporalClient client.Client) *Services {
	// every consumer takes the repository or query through its own interface,
	// wrapped so each call is a span above its SQL (the trace_gen.go files in
	// internal/listing/repository, usecase and grpc)
	concreteListingRepo := listingrepo.NewListingRepository(db)
	listingRepo := listingrepo.NewListingRepositoryWithTracing(concreteListingRepo, repoTracer)
	withdrawalMarker := usecase.NewListingWithdrawalMarkerWithTracing(concreteListingRepo, repoTracer)
	itemReserver := itemreserver.NewItemReserver(itemsClient)
	reserveItemUC := usecase.NewReserveItemUC(itemReserver)
	// a listing is created only over a reservation items confirms (ADR-0050)
	createAccUC := usecase.NewCreateListingUC(listingRepo, itemReserver)
	// release hold saga
	holdReleaseStarter := releasehold.NewStarter(temporalClient)
	placeBidUC := usecase.NewPlaceBidUC(listingRepo, walletClient, holdReleaseStarter)
	withdrawBidUC := usecase.NewWithdrawBidUC(listingRepo, holdReleaseStarter)
	listMyListingsQuery := listinggrpc.NewMyListingsReaderWithTracing(listingquery.NewListMyListingsQuery(db), queryTracer)
	listMyBidsQuery := listinggrpc.NewMyBidsReaderWithTracing(listingquery.NewListMyBidsQuery(db), queryTracer)
	browseListingsQuery := listinggrpc.NewBrowseListingsReaderWithTracing(listingquery.NewBrowseListingsQuery(db), queryTracer)
	getListingQuery := listinggrpc.NewListingReaderWithTracing(listingquery.NewGetListingQuery(db), queryTracer)

	// settlement saga
	settlementStarter := settlement.NewStarter(temporalClient)
	acceptBidUC := usecase.NewAcceptBidUsecase(listingRepo, settlementStarter)
	buyoutUC := usecase.NewBuyoutUC(listingRepo, walletClient, settlementStarter, holdReleaseStarter)

	// a seller's withdrawal: the item and every hold go back by workflow (ADR-0051)
	withdrawalStarter := withdrawlisting.NewStarter(temporalClient)
	// the repository marks each started withdrawal, so the backstop skips it
	withdrawListingUC := usecase.NewWithdrawListingUC(listingRepo, withdrawalStarter, withdrawalMarker)

	listingHandler := listinggrpc.NewHandler(reserveItemUC, createAccUC, placeBidUC, withdrawBidUC, listMyListingsQuery, listMyBidsQuery, browseListingsQuery, getListingQuery, acceptBidUC, buyoutUC, withdrawListingUC)

	hasLiveListingQuery := usecase.NewReconcileReaderWithTracing(listingquery.NewHasLiveListingQuery(db), queryTracer)
	reconcileReservationsUC := usecase.NewReconcileReservationsUC(hasLiveListingQuery, itemReserver)
	// the confirmed-without-listing backstop (FS-04ZB6 Req 12): runs on the same
	// tick, after the stale pass
	reconcileConfirmedUC := usecase.NewReconcileConfirmedReservationsUC(usecase.NewConfirmedReservationReaderWithTracing(listingquery.NewListingStatusQuery(db), queryTracer), itemReserver)

	// NOTE: the listing domain (model/repository/service/handler + proto) is
	// intentionally left empty for now. This service only boots the server and
	// its amqp consumer. Wire the domain + pb.RegisterMarketplaceServiceServer
	// here later.
	createListingUC := usecase.NewCreateListingUC(listingRepo, itemReserver)
	consumer := listing.NewConsumer(ch, createListingUC)

	hasBidQuery := usecase.NewBidReaderWithTracing(listingquery.NewHasBidQuery(db), queryTracer)
	reconcileHoldsUC := usecase.NewReconcileHoldsUC(hasBidQuery, walletClient)
	reconcileHoldsWorker := worker.NewReconcileHoldsWorker(reconcileHoldsUC)
	// same reason as the reservation worker below: Run loops on a ticker and never
	// returns, so it has to be its own goroutine
	go reconcileHoldsWorker.Run(ctx)

	// the expiry trigger (FS-NXP1W §Req 2, ADR-0016): without it an auction that
	// simply runs out never settles. Its own goroutine, for the same reason.
	startExpiredSettlementsUC := usecase.NewStartExpiredSettlementsUC(usecase.NewExpiredListingFinderWithTracing(listingquery.NewExpiredListingsQuery(db), queryTracer), settlementStarter)
	go worker.NewExpiryPollerWorker(startExpiredSettlementsUC).Run(ctx)

	// the withdraw backstop (FS-V7A5S Req 8): starts the workflow of every
	// withdrawn listing not yet marked started, for a start that failed or never
	// ran, and marks it
	restartWithdrawalsUC := usecase.NewRestartListingWithdrawalsUC(usecase.NewCancelledListingFinderWithTracing(listingquery.NewCancelledListingsQuery(db), queryTracer), withdrawalStarter, withdrawalMarker)

	reconcileWorker := worker.NewReconcileWorker(
		worker.ReconcilePass{Name: "stale reservations", Run: reconcileReservationsUC.Handle},
		worker.ReconcilePass{Name: "confirmed reservations backstop", Run: reconcileConfirmedUC.Handle},
		worker.ReconcilePass{Name: "withdraw backstop", Run: restartWithdrawalsUC.Handle},
	)
	// Run loops on a ticker and never returns, so it has to be its own
	// goroutine, called inline it would block NewServices forever.
	go reconcileWorker.Run(ctx)
	// start goroutine and listen to events from message broker
	consumer.Listen(ctx)

	freezeListingUC := usecase.NewFreezeListingUC(listingRepo)
	setWinningBidUC := usecase.NewSetWinningBidUC(listingRepo)
	loseAllBidsUC := usecase.NewLoseAllBidsUC(listingRepo)
	expireListingUC := usecase.NewExpireListingUC(listingRepo)
	markSoldUC := usecase.NewMarkSoldListingUC(listingRepo)
	markSettlementFailedUC := usecase.NewMarkSettlementFailedUC(listingRepo)
	activities := listingactivity.NewActivities(freezeListingUC, setWinningBidUC, loseAllBidsUC, expireListingUC, markSoldUC, markSettlementFailedUC)

	// escalate and park: the exception and its settlement.failed share one
	// transaction, so the repository writes the outbox too
	outboxService := commonoutbox.NewService(commonoutbox.NewRepo(db))
	exceptionRepo := listingrepo.NewSettlementExceptionRepository(db, outboxService)
	raiseExceptionUC := usecase.NewRaiseSettlementExceptionUC(usecase.NewSettlementExceptionRaiserWithTracing(exceptionRepo, repoTracer))
	resolveExceptionUC := usecase.NewResolveSettlementExceptionUC(usecase.NewSettlementExceptionResolverWithTracing(exceptionRepo, repoTracer))
	exceptionActivities := listingactivity.NewExceptionActivities(raiseExceptionUC, resolveExceptionUC)

	return &Services{
		ListingHandler:          listingHandler,
		ReconcileReservationsUC: reconcileReservationsUC,
		Activities:              activities,
		ExceptionActivities:     exceptionActivities,
	}
}
