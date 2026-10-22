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

func NewServices(ctx context.Context, db *sqlx.DB, itemsClient itemreserver.ItemReserverClient, walletClient *listinggrpc.Client, ch *amqp.Channel, temporalClient client.Client) *Services {
	listingRepo := listingrepo.NewListingRepository(db)
	itemReserver := itemreserver.NewItemReserver(itemsClient)
	reserveItemUC := usecase.NewReserveItemUC(itemReserver)
	createAccUC := usecase.NewCreateListingUC(listingRepo)
	// release hold saga
	holdReleaseStarter := releasehold.NewStarter(temporalClient)
	placeBidUC := usecase.NewPlaceBidUC(listingRepo, walletClient, holdReleaseStarter)
	withdrawBidUC := usecase.NewWithdrawBidUC(listingRepo, holdReleaseStarter)
	listMyListingsQuery := listingquery.NewListMyListingsQuery(db)
	listMyBidsQuery := listingquery.NewListMyBidsQuery(db)
	browseListingsQuery := listingquery.NewBrowseListingsQuery(db)
	getListingQuery := listingquery.NewGetListingQuery(db)

	// settlement saga
	settlementStarter := settlement.NewStarter(temporalClient)
	acceptBidUC := usecase.NewAcceptBidUsecase(listingRepo, settlementStarter)
	buyoutUC := usecase.NewBuyoutUC(listingRepo, walletClient, settlementStarter, holdReleaseStarter)

	listingHandler := listinggrpc.NewHandler(reserveItemUC, createAccUC, placeBidUC, withdrawBidUC, listMyListingsQuery, listMyBidsQuery, browseListingsQuery, getListingQuery, acceptBidUC, buyoutUC)

	hasLiveListingQuery := listingquery.NewHasLiveListingQuery(db)
	reconcileReservationsUC := usecase.NewReconcileReservationsUC(hasLiveListingQuery, itemReserver)

	// NOTE: the listing domain (model/repository/service/handler + proto) is
	// intentionally left empty for now. This service only boots the server and
	// its amqp consumer. Wire the domain + pb.RegisterMarketplaceServiceServer
	// here later.
	createListingUC := usecase.NewCreateListingUC(listingRepo)
	consumer := listing.NewConsumer(ch, createListingUC)

	hasBidQuery := listingquery.NewHasBidQuery(db)
	reconcileHoldsUC := usecase.NewReconcileHoldsUC(hasBidQuery, walletClient)
	reconcileHoldsWorker := worker.NewReconcileHoldsWorker(reconcileHoldsUC)
	// same reason as the reservation worker below: Run loops on a ticker and never
	// returns, so it has to be its own goroutine
	go reconcileHoldsWorker.Run(ctx)

	// the expiry trigger (FS-NXP1W §Req 2, ADR-0016): without it an auction that
	// simply runs out never settles. Its own goroutine, for the same reason.
	startExpiredSettlementsUC := usecase.NewStartExpiredSettlementsUC(listingquery.NewExpiredListingsQuery(db), settlementStarter)
	go worker.NewExpiryPollerWorker(startExpiredSettlementsUC).Run(ctx)

	reconcileWorker := worker.NewReconcileWorker(reconcileReservationsUC)
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
	raiseExceptionUC := usecase.NewRaiseSettlementExceptionUC(exceptionRepo)
	resolveExceptionUC := usecase.NewResolveSettlementExceptionUC(exceptionRepo)
	exceptionActivities := listingactivity.NewExceptionActivities(raiseExceptionUC, resolveExceptionUC)

	return &Services{
		ListingHandler:          listingHandler,
		ReconcileReservationsUC: reconcileReservationsUC,
		Activities:              activities,
		ExceptionActivities:     exceptionActivities,
	}
}
