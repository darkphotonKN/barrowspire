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
	browseReader     BrowseListingsReader
	listingReader    ListingReader

	// write
	reserveItemUC   *usecase.ReserveItemUC
	createListingUC *usecase.CreateListingUC
	placeBidUC      *usecase.PlaceBidUC
	withdrawBidUC   *usecase.WithdrawBidUC
	acceptBid       AcceptBid
	buyout          Buyout
}

// AcceptBid starts settlement for a listing its seller is ending early.
type AcceptBid interface {
	Handle(ctx context.Context, cmd usecase.AcceptBidCommand) error
}

// Buyout records a buyout and starts settlement for it.
type Buyout interface {
	Handle(ctx context.Context, cmd usecase.BuyoutCommand) error
}

// MyListingsReader reads one page of a seller's listings, newest first. A nil
// cursor is the first page.
type MyListingsReader interface {
	Execute(ctx context.Context, sellerID uuid.UUID, c *commoncursor.Cursor, limit int) (*dto.ListingsPage, error)
}

// BrowseListingsReader reads one page of every seller's live auctions,
// soonest-ending first. A nil cursor is the first page.
type BrowseListingsReader interface {
	Execute(ctx context.Context, c *commoncursor.EndsAt, limit int) (*dto.ListingsPage, error)
}

// ListingReader reads one listing in any status. An unknown id is
// commonconstants.ErrNotFound.
type ListingReader interface {
	Execute(ctx context.Context, listingID uuid.UUID) (*dto.ListingDetails, error)
}

func NewHandler(
	reserveItemUC *usecase.ReserveItemUC,
	createListingUC *usecase.CreateListingUC,
	placeBidUC *usecase.PlaceBidUC,
	withdrawBidUC *usecase.WithdrawBidUC,
	myListingsReader MyListingsReader,
	browseReader BrowseListingsReader,
	listingReader ListingReader,
	acceptBid AcceptBid,
	buyout Buyout) *Handler {
	return &Handler{
		reserveItemUC:    reserveItemUC,
		createListingUC:  createListingUC,
		placeBidUC:       placeBidUC,
		withdrawBidUC:    withdrawBidUC,
		myListingsReader: myListingsReader,
		browseReader:     browseReader,
		listingReader:    listingReader,
		acceptBid:        acceptBid,
		buyout:           buyout,
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

// AcceptBid lets a seller end their auction early at its current WINNING bid
// (FS-NXP1W §Req 3). It only starts settlement; the sale completes on its own.
func (h *Handler) AcceptBid(ctx context.Context, req *pb.AcceptBidRequest) (*pb.AcceptBidResponse, error) {
	listingID, err := uuid.Parse(req.GetListingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid listing id")
	}

	// the domain's seller check compares against this, so it must be the
	// authenticated caller and never anything taken from the request
	memberID, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	if err := h.acceptBid.Handle(ctx, usecase.AcceptBidCommand{
		ListingID: listingID,
		MemberID:  memberID,
		Now:       time.Now(),
	}); err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.AcceptBidResponse{}, nil
}

// Buyout buys a listing outright at its buyout price and starts settlement
// (FS-NXP1W §Req 4). It returns once the buyout is recorded; the sale completes
// on its own.
func (h *Handler) Buyout(ctx context.Context, req *pb.BuyoutRequest) (*pb.BuyoutResponse, error) {
	listingID, err := uuid.Parse(req.GetListingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid listing id")
	}

	// the buyer is who the gold is held from and who the domain refuses if they
	// are the seller, so it is only ever the authenticated caller
	memberID, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	if err := h.buyout.Handle(ctx, usecase.BuyoutCommand{
		ListingID: listingID,
		MemberID:  memberID,
		Now:       time.Now(),
	}); err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.BuyoutResponse{}, nil
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
		SellerID:    sellerId,
		StartPrice:  int(req.StartPrice),
		BuyoutPrice: optionalInt(req.BuyoutPrice),
		ItemID:      itemID,
		EndsAt:      req.EndsAt.AsTime(),
		Now:         now,
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

	now := time.Now()
	listings := make([]*pb.Listing, 0, len(page.Listings))
	for _, l := range page.Listings {
		listings = append(listings, toProtoListing(l, now))
	}

	res := &pb.ListMyListingsResponse{Listings: listings}
	if page.NextCursor != "" {
		res.Pagination = &pbpagination.PageInfo{NextCursor: page.NextCursor}
	}

	return res, nil
}

// BrowseListings pages every seller's live auctions. Public (see publicMethods
// in common/auth): it reads no caller, so the page is the same for everyone.
func (h *Handler) BrowseListings(ctx context.Context, req *pb.BrowseListingsRequest) (*pb.BrowseListingsResponse, error) {
	// a transport-shape failure, answered here like ListMyListings answers one
	cursor, err := commoncursor.DecodeEndsAt(req.GetCursor())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "malformed cursor")
	}

	page, err := h.browseReader.Execute(ctx, cursor, int(req.GetLimit()))
	if err != nil {
		return nil, mapError(ctx, err)
	}

	now := time.Now()
	listings := make([]*pb.Listing, 0, len(page.Listings))
	for _, l := range page.Listings {
		listings = append(listings, toProtoListing(l, now))
	}

	res := &pb.BrowseListingsResponse{Listings: listings}
	if page.NextCursor != "" {
		res.Pagination = &pbpagination.PageInfo{NextCursor: page.NextCursor}
	}

	return res, nil
}

// GetListing reads one listing in any status. Public (see publicMethods in
// common/auth): it reads no caller, so every visitor sees the same listing.
func (h *Handler) GetListing(ctx context.Context, req *pb.GetListingRequest) (*pb.GetListingResponse, error) {
	listingID, err := uuid.Parse(req.GetListingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid listing id")
	}

	l, err := h.listingReader.Execute(ctx, listingID)
	if err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.GetListingResponse{Listing: toProtoListing(*l, time.Now())}, nil
}

// toProtoListing maps the read model to the wire. The optimistic-locking
// version is internal and never leaves the service.
//
// The price facts are only as complete as the read that built l: a read that
// did not select them maps a zero bid count and the start price as the minimum.
func toProtoListing(l dto.ListingDetails, now time.Time) *pb.Listing {
	out := &pb.Listing{
		Id:          l.ID.String(),
		SellerId:    l.SellerID.String(),
		ItemId:      l.ItemID.String(),
		StartPrice:  int64(l.StartPrice),
		BuyoutPrice: optionalInt64(l.BuyoutPrice),
		Status:      string(l.Status),
		EndsAt:      timestamppb.New(l.EndsAt),
		CreatedAt:   timestamppb.New(l.CreatedAt),
		UpdatedAt:   timestamppb.New(l.UpdatedAt),
		MinimumBid:  int64(l.MinimumBid()),
		BidCount:    int32(l.BidCount),
		Ended:       l.EndedAt(now),
	}

	if l.CurrentPrice != nil {
		currentPrice := int64(*l.CurrentPrice)
		out.CurrentPrice = &currentPrice
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
	// A row lock that timed out: somebody else is writing this listing right now.
	// Aborted rather than Unavailable, because the gateway turns Unavailable into a
	// 503 and gRPC clients commonly retry it on their own — which would rebuild the
	// retry storm the row lock was taken to avoid. Aborted becomes a 409, the same
	// answer an OCC conflict gets, and leaves the decision to re-bid with the caller.
	//
	// Info, not Warn: contention on a popular listing is what success looks like
	// under load, and logging it as a fault buries the faults that are real.
	case errors.Is(err, commonconstants.ErrLockUnavailable):
		code = codes.Aborted
		msg = "listing busy, try again"
		logLevel = slog.LevelInfo

	// NOTE: retry worthy error
	// log level warn, worth noting rate
	case errors.Is(err, commonconstants.ErrTransient):
		code = codes.Unavailable
		msg = "unavailable"

	// the caller sent a structurally valid request carrying a nonsensical value
	case errors.Is(err, listing.ErrInvalidAmount) ||
		errors.Is(err, listing.ErrBidTooLow) ||
		errors.Is(err, listing.ErrBidAtOrAboveBuyout):
		code = codes.InvalidArgument
		msg = "invalid argument"
		logLevel = slog.LevelInfo

	case errors.Is(err, listing.ErrListingNotAcceptingBids) ||
		errors.Is(err, listing.ErrListingExpired) ||
		errors.Is(err, listing.ErrInvalidBidTransition) ||
		errors.Is(err, listing.ErrNoBidToAccept) ||
		errors.Is(err, listing.ErrNoBuyoutPrice) ||
		errors.Is(err, commonconstants.ErrInsufficientGold):
		code = codes.FailedPrecondition
		msg = "failed precondition"
		logLevel = slog.LevelInfo

	case errors.Is(err, listing.ErrBidNotFound):
		code = codes.NotFound
		msg = "not found"

	case errors.Is(err, listing.ErrNotBidOwner) ||
		errors.Is(err, listing.ErrNotSeller) ||
		errors.Is(err, listing.ErrSellerCannotBuyout):
		code = codes.PermissionDenied
		msg = "permission denied"

	case errors.Is(err, listing.ErrInvalidUUID) ||
		errors.Is(err, listing.ErrInvalidEndTime) ||
		errors.Is(err, listing.ErrInvalidStartPrice) ||
		errors.Is(err, listing.ErrInvalidBuyoutPrice) ||
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

// optionalInt narrows an optional proto int64 to the domain's *int, keeping
// absent as nil rather than collapsing it to 0.
func optionalInt(v *int64) *int {
	if v == nil {
		return nil
	}
	n := int(*v)
	return &n
}

// optionalInt64 is optionalInt's inverse, for responses.
func optionalInt64(v *int) *int64 {
	if v == nil {
		return nil
	}
	n := int64(*v)
	return &n
}
