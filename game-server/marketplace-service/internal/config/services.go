package config

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing"
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
}

func NewServices(ctx context.Context, db *sqlx.DB, registry discovery.Registry, ch *amqp.Channel) *Services {
	listingRepo := listingrepo.NewListingRepository(db)
	grpcClient := itemreserver.NewClient(registry)
	itemReserver := itemreserver.NewItemReserver(grpcClient)
	reserveItemUC := usecase.NewReserveItemUC(itemReserver)
	getListingQuery := listingquery.NewGetListingQuery(db)
	listingHandler := listinggrpc.NewHandler(reserveItemUC, getListingQuery)

	hasActiveListingQuery := listingquery.NewHasActiveListingQuery(db)
	reconcileReservationsUC := usecase.NewReconcileReservationsUC(hasActiveListingQuery, itemReserver)

	// NOTE: the listing domain (model/repository/service/handler + proto) is
	// intentionally left empty for now. This service only boots the server and
	// its amqp consumer. Wire the domain + pb.RegisterMarketplaceServiceServer
	// here later, following example-service.
	createListingUC := usecase.NewCreateListingUC(listingRepo)
	consumer := listing.NewConsumer(ch, createListingUC)

	worker := worker.NewReconcileWorker()
	worker.Run(ctx)
	// start goroutine and listen to events from message broker
	consumer.Listen(ctx)

	return &Services{
		ListingHandler:          listingHandler,
		ReconcileReservationsUC: reconcileReservationsUC,
	}
}
