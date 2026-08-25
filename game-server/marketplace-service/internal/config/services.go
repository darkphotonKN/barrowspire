package config

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	listinggrpc "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/grpc"
	listingquery "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/query"
	listingrepo "github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/repository"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/jmoiron/sqlx"
)

// sets up all services and their dependency injections at
// server start once.

type Services struct {
	ListingHandler *listinggrpc.Handler
}

func NewServices(ctx context.Context, db *sqlx.DB, registry discovery.Registry) *Services {
	listingRepo := listingrepo.NewListingRepository(db)
	createAccUC := usecase.NewCreateListingUC(listingRepo)
	walletClient := listinggrpc.NewClient(registry)
	placeBidUC := usecase.NewPlaceBidUC(listingRepo, walletClient)
	withdrawBidUC := usecase.NewWithdrawBidUC(listingRepo)
	getListingQuery := listingquery.NewGetListingQuery(db)
	listingHandler := listinggrpc.NewHandler(createAccUC, placeBidUC, withdrawBidUC, getListingQuery)

	return &Services{
		ListingHandler: listingHandler,
	}
}
