package grpc

import (
	"context"
	"errors"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
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
	reserveItemUC *usecase.ReserveItemUC
}

type ListingReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.ListingDetails, error)
}

func NewHandler(reserveItemUC *usecase.ReserveItemUC, listingReader ListingReader) *Handler {
	return &Handler{
		reserveItemUC: reserveItemUC,
		listingReader: listingReader,
	}
}

// ========================= WRITE PATHS  =========================

// ========================= READ PATHS  =========================

func (h *Handler) ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error) {
	sellerId, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	slog.Debug("ListItem", "sellerid:", sellerId)

	itemID, err := uuid.Parse(req.ItemId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "Invalid item id")
	}

	now := time.Now()
	err = h.reserveItemUC.Handle(ctx, &usecase.ReserveItemCommand{
		SellerID:   sellerId,
		StartPrice: int(req.StartPrice),
		ItemID:     itemID,
		EndsAt:     req.EndsAt.AsTime(),
		Now:        now,
	})

	if err != nil {
		return nil, mapError(ctx, err)
	}

	// snapshot := listing.Snapshot()

	listingPB := &pb.ListItemResponse{
		// Id:         snapshot.ID.String(),
		// SellerId:   snapshot.SellerID.String(),
		// ItemId:     snapshot.ItemID.String(),
		// StartPrice: int64(snapshot.StartPrice),
		// Status:     string(snapshot.Status),
		// EndsAt:     timestamppb.New(snapshot.EndsAt),
	}

	return listingPB, nil
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

	case errors.Is(err, listing.ErrInvalidUUID) ||
		errors.Is(err, listing.ErrInvalidEndTime) ||
		errors.Is(err, listing.ErrInvalidStartPrice) ||
		errors.Is(err, listing.ErrInvalidSoldPrice) ||
		errors.Is(err, listing.ErrInvalidSoldTime):
		code = codes.InvalidArgument
		msg = "invalid argument"
		logLevel = slog.LevelInfo

	case errors.Is(err, listing.ErrInvalidListingState):
		code = codes.FailedPrecondition
		msg = "invalid listing state"
		logLevel = slog.LevelInfo

	case errors.Is(err, listing.ErrCorruptListingState):
		code = codes.Internal
		msg = "corrupt listing state"
		logLevel = slog.LevelError

	default:
		// unexpected, unhandled error
		code = codes.Internal
		msg = "unhandled error"
		logLevel = slog.LevelError
	}

	slog.Log(ctx, logLevel, msg, "code", code, "err", err)
	return status.Error(code, msg)
}
