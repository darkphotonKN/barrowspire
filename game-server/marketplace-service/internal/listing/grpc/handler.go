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
	reserveItemUC   *usecase.ReserveItemUC
	createListingUC *usecase.CreateListingUC
	placeBidUC      *usecase.PlaceBidUC
	withdrawBidUC   *usecase.WithdrawBidUC
}

type ListingReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.ListingDetails, error)
}

func NewHandler(
	reserveItemUC *usecase.ReserveItemUC,
	createListingUC *usecase.CreateListingUC,
	placeBidUC *usecase.PlaceBidUC,
	withdrawBidUC *usecase.WithdrawBidUC,
	listingReader ListingReader) *Handler {
	return &Handler{
		reserveItemUC:   reserveItemUC,
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

	memberID, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	// Optional: an absent or malformed key means "no key", which is uuid.Nil.
	// Rejecting a bad one would fail a request the caller could still have
	// served safely, just without replay protection.
	idempotencyKey, err := uuid.Parse(req.GetIdempotencyKey())
	if err != nil {
		idempotencyKey = uuid.Nil
	}

	if err := h.placeBidUC.Handle(ctx, usecase.PlaceBidCommand{
		ListingID:      listingID,
		MemberID:       memberID,
		Amount:         int(req.GetAmount()),
		IdempotencyKey: idempotencyKey,
		Now:            time.Now(),
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

	// the domain's ownership check compares against this, so it must be the
	// authenticated caller and never anything taken from the request
	memberID, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	if err := h.withdrawBidUC.Handle(ctx, usecase.WithdrawBidCommand{
		ListingID: listingID,
		BidID:     bidID,
		MemberID:  memberID,
		Now:       time.Now(),
	}); err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.WithdrawBidResponse{}, nil
}

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
