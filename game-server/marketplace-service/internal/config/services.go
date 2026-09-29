package config

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing"
	listingactivity "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/activity"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/adapter/itemreserver"
	listinggrpc "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/grpc"
	listingquery "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/query"
	listingrepo "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/repository"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/worker"
	"github.com/jmoiron/sqlx"
	amqp "github.com/rabbitmq/amqp091-go"
)

// sets up all services and their dependency injections at
// server start once.

type Services struct {
	ListingHandler          *listinggrpc.Handler
	ReconcileReservationsUC *usecase.ReconcileReservationsUC
	// Activities are the settlement steps marketplace owns, registered on its
	// Temporal worker in main.
	Activities *listingactivity.Activities
}

func NewServices(ctx context.Context, db *sqlx.DB, registry discovery.Registry, ch *amqp.Channel) *Services {
	listingRepo := listingrepo.NewListingRepository(db)
	grpcClient := itemreserver.NewClient(registry)
	itemReserver := itemreserver.NewItemReserver(grpcClient)
	reserveItemUC := usecase.NewReserveItemUC(itemReserver)
	createAccUC := usecase.NewCreateListingUC(listingRepo)
	walletClient := listinggrpc.NewClient(registry)
	placeBidUC := usecase.NewPlaceBidUC(listingRepo, walletClient)
	withdrawBidUC := usecase.NewWithdrawBidUC(listingRepo, walletClient)
	listMyListingsQuery := listingquery.NewListMyListingsQuery(db)
	listingHandler := listinggrpc.NewHandler(reserveItemUC, createAccUC, placeBidUC, withdrawBidUC, listMyListingsQuery)

	hasActiveListingQuery := listingquery.NewHasActiveListingQuery(db)
	reconcileReservationsUC := usecase.NewReconcileReservationsUC(hasActiveListingQuery, itemReserver)

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

	reconcileWorker := worker.NewReconcileWorker(reconcileReservationsUC)
	// Run loops on a ticker and never returns, so it has to be its own
	// goroutine, called inline it would block NewServices forever.
	go reconcileWorker.Run(ctx)
	// start goroutine and listen to events from message broker
	consumer.Listen(ctx)

	freezeListingUC := usecase.NewFreezeListingUC(listingRepo)
	setWinningBidUC := usecase.NewSetWinningBidUC(listingRepo)
	loseAllBidsUC := usecase.NewLoseAllBidsUC(listingRepo)
	activities := listingactivity.NewActivities(freezeListingUC, setWinningBidUC, loseAllBidsUC)

	return &Services{
		ListingHandler:          listingHandler,
		ReconcileReservationsUC: reconcileReservationsUC,
		Activities:              activities,
	}
}
