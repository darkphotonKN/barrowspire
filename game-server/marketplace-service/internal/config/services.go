package config

import (
	"context"

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

func NewServices(ctx context.Context, db *sqlx.DB) *Services {
	listingRepo := listingrepo.NewListingRepository(db)
	// placeHoldUC := usecase.NewPlaceHoldUC(listingRepo)
	createAccUC := usecase.NewCreateListingUC(listingRepo)
	getListingQuery := listingquery.NewGetListingQuery(db)
	listingHandler := listinggrpc.NewHandler(createAccUC, getListingQuery)

	return &Services{
		ListingHandler: listingHandler,
	}
}
