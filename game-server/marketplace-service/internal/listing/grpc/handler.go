package grpc

import (
	"context"
	"errors"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// INBOUND Adapter

type Handler struct {
	// grpc
	pb.UnimplementedMarketplaceServiceServer

	// read
	listingReader ListingReader

	// write
	createListingUC *usecase.CreateListingUC
}

type ListingReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.ListingDetails, error)
}

func NewHandler(createListingUC *usecase.CreateListingUC, listingReader ListingReader) *Handler {
	return &Handler{
		createListingUC: createListingUC,
		listingReader:   listingReader,
	}
}

// ========================= WRITE PATHS  =========================

// ========================= READ PATHS  =========================

func (h *Handler) CreateListing(ctx context.Context, req *pb.CreateListingRequest) (*pb.CreateListingResponse, error) {
	// TODO: update to use interceptor
	tempMemberID := uuid.New()

	_, err := h.listingReader.Execute(ctx, tempMemberID)

	if err != nil {
		return nil, mapError(ctx, err)
	}

	// TODO: map to pb

	return nil, nil
}

func mapError(ctx context.Context, err error) error {
	var code codes.Code
	var msg string
	logLevel := slog.LevelWarn

	switch {
	// withRetry helper returns ErrMaxRetries, ErrConcurrentModification is internal
	// but leaving it here for defense
	case errors.Is(err, usecase.ErrMaxRetries) || errors.Is(err, listing.ErrConcurrentModification):
		// OCC version mismatch. caller can retry with fresh state.
		code = codes.Aborted
		msg = "aborted"
	case errors.Is(err, commonconstants.ErrDuplicateResource):
		code = codes.AlreadyExists
		msg = "already exists"
	case errors.Is(err, commonconstants.ErrNotFound):
		code = codes.NotFound
		msg = "not found"
	// NOTE: retry worthy error
	// log level warn, worth noting rate
	case errors.Is(err, commonconstants.ErrTransient):
		code = codes.Unavailable
		msg = "unavailable"
	// request structurally valid, but listing state doesnt allow, or violates the
	// system constraints like FK, null when supposed to be NOT NULL, etc
	case errors.Is(err, commonconstants.ErrConstraintViolation):
		msg = "failed precondition"
		code = codes.FailedPrecondition

		// expected error, normal operations, but for tracking where things went wrong
		// if a bug is reported and we need to trace it
		logLevel = slog.LevelInfo

	// case errors.Is(err, listing.ErrInvalidAmount) || errors.Is(err, listing.ErrInvalidGold):
	// 	code = codes.InvalidArgument
	// 	msg = "invalid argument"

	default:
		// unexpected, unhandled error
		code = codes.Internal
		msg = "unhandled error"
		logLevel = slog.LevelError
	}

	slog.Log(ctx, logLevel, msg, "code", code)
	return status.Error(code, msg)
}
