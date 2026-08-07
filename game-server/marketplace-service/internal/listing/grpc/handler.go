package grpc

import (
	"context"
	"errors"
	"log/slog"
	"time"

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
	placeBidUC      *usecase.PlaceBidUC
	withdrawBidUC   *usecase.WithdrawBidUC
}

type ListingReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.ListingDetails, error)
}

func NewHandler(
	createListingUC *usecase.CreateListingUC,
	placeBidUC *usecase.PlaceBidUC,
	withdrawBidUC *usecase.WithdrawBidUC,
	listingReader ListingReader,
) *Handler {
	return &Handler{
		createListingUC: createListingUC,
		placeBidUC:      placeBidUC,
		withdrawBidUC:   withdrawBidUC,
		listingReader:   listingReader,
	}
}

// ========================= WRITE PATHS  =========================

func (h *Handler) PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error) {
	listingID, err := uuid.Parse(req.GetListingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid listing id")
	}

	tempMemberID := uuid.New()

	if err := h.placeBidUC.Handle(ctx, usecase.PlaceBidCommand{
		ListingID: listingID,
		MemberID:  tempMemberID,
		Amount:    int(req.GetAmount()),
		Now:       time.Now(),
	}); err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.PlaceBidResponse{}, nil
}

func (h *Handler) WithdrawBid(ctx context.Context, req *pb.WithdrawBidRequest) (*pb.WithdrawBidResponse, error) {
	listingID, err := uuid.Parse(req.GetListingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid listing id")
	}

	bidID, err := uuid.Parse(req.GetBidId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid bid id")
	}

	tempMemberID := uuid.New()

	if err := h.withdrawBidUC.Handle(ctx, usecase.WithdrawBidCommand{
		ListingID: listingID,
		BidID:     bidID,
		MemberID:  tempMemberID,
		Now:       time.Now(),
	}); err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.WithdrawBidResponse{}, nil
}

// ========================= READ PATHS  =========================

func (h *Handler) CreateListing(ctx context.Context, req *pb.CreateListingRequest) (*pb.CreateListingResponse, error) {
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

	// the caller sent a structurally valid request carrying a nonsensical value
	case errors.Is(err, listing.ErrInvalidAmount) || errors.Is(err, listing.ErrBidTooLow):
		code = codes.InvalidArgument
		msg = "invalid argument"
		logLevel = slog.LevelInfo

	case errors.Is(err, listing.ErrListingNotAcceptingBids) ||
		errors.Is(err, listing.ErrListingExpired) ||
		errors.Is(err, listing.ErrInvalidBidTransition):
		code = codes.FailedPrecondition
		msg = "failed precondition"
		logLevel = slog.LevelInfo

	case errors.Is(err, listing.ErrBidNotFound):
		code = codes.NotFound
		msg = "not found"

	case errors.Is(err, listing.ErrNotBidOwner):
		code = codes.PermissionDenied
		msg = "permission denied"

	default:
		// unexpected, unhandled error
		code = codes.Internal
		msg = "unhandled error"
		logLevel = slog.LevelError
	}

	slog.Log(ctx, logLevel, msg, "code", code)
	return status.Error(code, msg)
}
