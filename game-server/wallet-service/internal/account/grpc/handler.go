package grpc

import (
	"context"
	"errors"
	"log/slog"

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
	accountReader AccountReader

	// write
	createAccountUC *usecase.CreateAccountUC
	placeHoldUC     *usecase.PlaceHoldUC
}

type AccountReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.AccountDetails, error)
}

func NewHandler(createAccountUC *usecase.CreateAccountUC, placeHoldUC *usecase.PlaceHoldUC, accountReader AccountReader) *Handler {

	return &Handler{
		createAccountUC: createAccountUC,
		placeHoldUC:     placeHoldUC,
		accountReader:   accountReader,
	}
}

// ========================= WRITE PATHS  =========================

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
	// maps to http 400 (or 409 if our team decides on state errors == 409)
	case errors.Is(err, account.ErrHoldsExceedBalance):
		code = codes.FailedPrecondition
		msg = "insufficient available gold"

		// expected error, normal operations, but for tracking where things went wrong
		// if a bug is reported and we need to trace it
		logLevel = slog.LevelInfo

	// NOTE: invalid argument
	// maps to http 400 bad request
	case errors.Is(err, account.ErrInvalidAmount) || errors.Is(err, account.ErrInvalidGold):
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
