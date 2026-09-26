package grpc

import (
	"context"
	"errors"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	pbpagination "github.com/darkphotonKN/barrowspire-server/common/api/proto/shared/v1"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commoncursor "github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// INBOUND Adapter

type Handler struct {
	// grpc
	pb.UnimplementedMarketplaceServiceServer

	// read
	myListingsReader MyListingsReader

	// write
	reserveItemUC   *usecase.ReserveItemUC
	createListingUC *usecase.CreateListingUC
	placeBidUC      *usecase.PlaceBidUC
	withdrawBidUC   *usecase.WithdrawBidUC
}

// MyListingsReader reads one page of a seller's listings, newest first. A nil
// cursor is the first page.
type MyListingsReader interface {
	Execute(ctx context.Context, sellerID uuid.UUID, c *commoncursor.Cursor, limit int) (*dto.ListingsPage, error)
}

func NewHandler(
	reserveItemUC *usecase.ReserveItemUC,
	createListingUC *usecase.CreateListingUC,
	placeBidUC *usecase.PlaceBidUC,
	withdrawBidUC *usecase.WithdrawBidUC,
	myListingsReader MyListingsReader) *Handler {
	return &Handler{
		reserveItemUC:    reserveItemUC,
		createListingUC:  createListingUC,
		placeBidUC:       placeBidUC,
		withdrawBidUC:    withdrawBidUC,
		myListingsReader: myListingsReader,
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

func (h *Handler) ListMyListings(ctx context.Context, req *pb.ListMyListingsRequest) (*pb.ListMyListingsResponse, error) {
	// the seller is always the caller; the request has no field to choose another
	sellerID, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	// answered here rather than through mapError, the same way this handler
	// answers a malformed path id: it is a transport-shape failure, not a
	// domain sentinel
	cursor, err := commoncursor.Decode(req.GetCursor())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "malformed cursor")
	}

	page, err := h.myListingsReader.Execute(ctx, sellerID, cursor, int(req.GetLimit()))
	if err != nil {
		return nil, mapError(ctx, err)
	}

	listings := make([]*pb.Listing, 0, len(page.Listings))
	for _, l := range page.Listings {
		listings = append(listings, toProtoListing(l))
	}

	res := &pb.ListMyListingsResponse{Listings: listings}
	if page.NextCursor != "" {
		res.Pagination = &pbpagination.PageInfo{NextCursor: page.NextCursor}
	}

	return res, nil
}

// toProtoListing maps the read model to the wire. The optimistic-locking
// version is internal and never leaves the service.
func toProtoListing(l dto.ListingDetails) *pb.Listing {
	out := &pb.Listing{
		Id:         l.ID.String(),
		SellerId:   l.SellerID.String(),
		ItemId:     l.ItemID.String(),
		StartPrice: int64(l.StartPrice),
		Status:     string(l.Status),
		EndsAt:     timestamppb.New(l.EndsAt),
		CreatedAt:  timestamppb.New(l.CreatedAt),
		UpdatedAt:  timestamppb.New(l.UpdatedAt),
	}

	if l.BuyerID != nil {
		buyerID := l.BuyerID.String()
		out.BuyerId = &buyerID
	}

	if l.SoldPrice != nil {
		soldPrice := int64(*l.SoldPrice)
		out.SoldPrice = &soldPrice
	}

	return out
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
		errors.Is(err, listing.ErrInvalidBidTransition) ||
		errors.Is(err, commonconstants.ErrInsufficientGold):
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
