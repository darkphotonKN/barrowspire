package grpc

import (
	"context"
	"errors"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// INBOUND Adapter
type Handler struct {
	// grpc
	pb.UnimplementedWalletServiceServer

	// read
	accountReader    AccountReader
	staleHoldsReader StaleHoldsReader

	// write
	createAccountUC AccountCreator
	placeHoldUC     HoldPlacer
	releaseHoldUC   HoldReleaser
	depositGoldUC   GoldDepositor
	withdrawGoldUC  GoldWithdrawer
}

// The handler declares what it needs from each use case rather than naming the
// concrete type, so the seam it depends on is the call it actually makes. Each
// interface is one method wide because the handler uses one method.

type AccountReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.AccountDetails, error)
}

// StaleHoldsReader lists reservations that outlived the write meant to follow them.
// A read: wallet reports, the caller that minted the bid ids decides.
type StaleHoldsReader interface {
	Execute(ctx context.Context, createdBefore time.Time, limit int) ([]uuid.UUID, error)
}

type AccountCreator interface {
	Handle(ctx context.Context, cmd usecase.CreateAccountCommand) (*account.Account, error)
}

type HoldPlacer interface {
	Handle(ctx context.Context, cmd *usecase.PlaceHoldCommand) error
}

type HoldReleaser interface {
	Handle(ctx context.Context, cmd *usecase.ReleaseHoldCommand) error
}

type GoldDepositor interface {
	Handle(ctx context.Context, cmd *usecase.DepositGoldCommand) error
}

type GoldWithdrawer interface {
	Handle(ctx context.Context, cmd *usecase.WithdrawGoldCommand) error
}

// Deps names every dependency the handler needs. A struct rather than positional
// parameters on purpose: CommitHold shipped panicking because its use case was
// declared on Handler but silently omitted from the constructor's argument list,
// and a positional call site gives no hint that something is missing. Named
// fields make an omission visible at the call site instead of at runtime.
type Deps struct {
	CreateAccountUC  AccountCreator
	PlaceHoldUC      HoldPlacer
	ReleaseHoldUC    HoldReleaser
	DepositGoldUC    GoldDepositor
	WithdrawGoldUC   GoldWithdrawer
	AccountReader    AccountReader
	StaleHoldsReader StaleHoldsReader
}

func NewHandler(deps Deps) *Handler {
	return &Handler{
		createAccountUC:  deps.CreateAccountUC,
		placeHoldUC:      deps.PlaceHoldUC,
		releaseHoldUC:    deps.ReleaseHoldUC,
		depositGoldUC:    deps.DepositGoldUC,
		withdrawGoldUC:   deps.WithdrawGoldUC,
		accountReader:    deps.AccountReader,
		staleHoldsReader: deps.StaleHoldsReader,
	}
}

// ========================= WRITE PATHS  =========================

func (h *Handler) CreateAccount(ctx context.Context, req *pb.CreateAccountRequest) (*pb.CreateAccountResponse, error) {
	memberId, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	acc, err := h.createAccountUC.Handle(ctx, usecase.CreateAccountCommand{
		MemberID: memberId,
	})

	if err != nil {
		return nil, mapError(ctx, err)
	}

	snapshot := acc.Snapshot()

	accountPB := &pb.CreateAccountResponse{
		Id:        snapshot.ID.String(),
		MemberId:  memberId.String(),
		Gold:      int64(snapshot.Gold),
		CreatedAt: timestamppb.New(snapshot.CreatedAt),
	}

	return accountPB, nil
}

func (h *Handler) PlaceHold(ctx context.Context, req *pb.PlaceHoldRequest) (*pb.PlaceHoldResponse, error) {
	memberID, ok := commonauth.MemberIDFromCtx(ctx)

	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	bidID, err := uuid.Parse(req.BidId)

	if err != nil {
		slog.InfoContext(ctx, "bidId from req was unparseable as a uuid", "err", err)
		return nil, status.Error(codes.InvalidArgument, "bidId from req was unparseable as a uuid")
	}

	// required: wallet never derives a hold's expiry (FS-NXP1W §Req 19)
	if req.GetExpiresAt() == nil {
		return nil, status.Error(codes.InvalidArgument, "expires_at is required")
	}

	err = h.placeHoldUC.Handle(ctx, &usecase.PlaceHoldCommand{
		MemberID:  memberID,
		BidID:     bidID,
		Gold:      int(req.Gold),
		ExpiresAt: req.GetExpiresAt().AsTime(),
	})

	if err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.PlaceHoldResponse{}, nil
}

// ReleaseHold gives back a reservation whose bid was never recorded.
//
// No identity check, unlike PlaceHold: the caller is a service compensating for its
// own failed write, not a member acting on their own account, and the bid it names
// is one it minted. The hold's bid_id is the whole authorisation — a caller can only
// release a hold it knows the id of, and that id came from it in the first place.
func (h *Handler) ReleaseHold(ctx context.Context, req *pb.ReleaseHoldRequest) (*pb.ReleaseHoldResponse, error) {
	bidID, err := uuid.Parse(req.BidId)

	if err != nil {
		slog.InfoContext(ctx, "bidId from req was unparseable as a uuid", "err", err)
		return nil, status.Error(codes.InvalidArgument, "bidId from req was unparseable as a uuid")
	}

	if err := h.releaseHoldUC.Handle(ctx, &usecase.ReleaseHoldCommand{
		BidID: bidID,
		Now:   time.Now(),
	}); err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.ReleaseHoldResponse{}, nil
}

// ListStaleReservedHolds reports reservations still held after the point their bid
// should have been recorded. It judges nothing: wallet has no bid or listing concept,
// so it cannot tell an orphan from a hold whose auction is simply still running. The
// caller compares these ids against its own records and decides.
func (h *Handler) ListStaleReservedHolds(ctx context.Context, req *pb.ListStaleReservedHoldsRequest) (*pb.ListStaleReservedHoldsResponse, error) {
	if req.GetReservedBefore() == nil {
		// without a cutoff this would return holds placed moments ago, whose bids may
		// still be mid-write — and releasing those is the failure this whole path exists
		// to avoid
		return nil, status.Error(codes.InvalidArgument, "reserved_before is required")
	}

	bidIDs, err := h.staleHoldsReader.Execute(ctx, req.GetReservedBefore().AsTime(), int(req.GetLimit()))
	if err != nil {
		return nil, mapError(ctx, err)
	}

	ids := make([]string, 0, len(bidIDs))
	for _, bidID := range bidIDs {
		ids = append(ids, bidID.String())
	}

	return &pb.ListStaleReservedHoldsResponse{BidIds: ids}, nil
}

func (h *Handler) Deposit(ctx context.Context, req *pb.DepositRequest) (*pb.DepositResponse, error) {
	memberID, ok := commonauth.MemberIDFromCtx(ctx)

	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	err := h.depositGoldUC.Handle(ctx, &usecase.DepositGoldCommand{
		MemberID: memberID,
		Gold:     int(req.Gold),
	})

	if err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.DepositResponse{}, nil
}

func (h *Handler) Withdraw(ctx context.Context, req *pb.WithdrawRequest) (*pb.WithdrawResponse, error) {
	memberID, ok := commonauth.MemberIDFromCtx(ctx)

	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	err := h.withdrawGoldUC.Handle(ctx, &usecase.WithdrawGoldCommand{
		MemberID: memberID,
		Gold:     int(req.Gold),
	})

	if err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.WithdrawResponse{}, nil
}

// ========================= READ PATHS  =========================

func (h *Handler) GetAccount(ctx context.Context, req *pb.GetAccountRequest) (*pb.GetAccountResponse, error) {
	// extract id from ctx passed from interceptor middleware
	id, ok := commonauth.MemberIDFromCtx(ctx)

	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	res, err := h.accountReader.Execute(ctx, id)

	if err != nil {
		return nil, mapError(ctx, err)
	}

	proto := pb.GetAccountResponse{
		Id:            res.ID.String(),
		MemberId:      res.MemberID.String(),
		Gold:          int64(res.Gold),
		HeldGold:      int64(res.HeldGold),
		AvailableGold: int64(res.AvailableGold),
		CreatedAt:     timestamppb.New(res.CreatedAt),
	}

	return &proto, nil
}

func mapError(ctx context.Context, err error) error {
	var code codes.Code
	var msg string
	logLevel := slog.LevelWarn

	switch {
	// NOTE:
	// withRetry helper returns ErrMaxRetries, ErrConcurrentModification is internal
	// but leaving ErrConcurrentModification here for defense
	// maps to http 409 conflict due to OCC version mismatch. caller can retry with fresh state.
	// retry can be immediate, only rejected due to race
	case errors.Is(err, usecase.ErrMaxRetries) || errors.Is(err, account.ErrConcurrentModification):
		code = codes.Aborted
		msg = "conflict, retry request"

	// NOTE: duplicate resource
	// maps to 409 http code, conflict
	case errors.Is(err, commonconstants.ErrDuplicateResource):
		code = codes.AlreadyExists
		msg = "already exists"

	// NOTE: not found
	// maps to http code 404 not found
	case errors.Is(err, commonconstants.ErrNotFound):
		code = codes.NotFound
		msg = "account not found"

	// NOTE: transient error
	// maps to http code 503 temporarily unavailable, client worth retrying shortly
	// retry worthy error, but might need to wait for availability
	case errors.Is(err, commonconstants.ErrTransient):
		code = codes.Unavailable
		msg = "temporarily unavailable, retry shortly"

	// NOTE: failed precondition
	// request structurally valid, but account state doesnt allow, or violates the
	// system constraints like FK, null when supposed to be NOT NULL, etc
	// maps to http 400 for google rpc recommended (or 409 if our team decides on state errors == 409)
	case errors.Is(err, account.ErrHoldsExceedBalance):
		code = codes.FailedPrecondition
		msg = "insufficient available gold"

		// expected error, normal operations, but for tracking where things went wrong
		// if a bug is reported and we need to trace it
		logLevel = slog.LevelInfo

	// NOTE: invalid argument
	// maps to http 400 bad request
	case errors.Is(err, account.ErrInvalidAmount) ||
		errors.Is(err, account.ErrInvalidGold) ||
		errors.Is(err, account.ErrInvalidHoldExpiry):
		code = codes.InvalidArgument
		msg = "invalid argument"

	default:
		// NOTE: internal, unexpected / unhandled error
		// do not leak internals here (sql errors), keep it generic.
		code = codes.Internal
		msg = "internal error"
		logLevel = slog.LevelError
	}

	slog.Log(ctx, logLevel, "rpc error", "err", err, "code", code.String())
	return status.Error(code, msg)
}
