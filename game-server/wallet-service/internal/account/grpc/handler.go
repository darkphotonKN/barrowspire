package grpc

import (
	"context"
	"errors"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
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
}

type AccountReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.AccountDetails, error)
}

func NewHandler(createAccountUC *usecase.CreateAccountUC, accountReader AccountReader) *Handler {
	return &Handler{
		createAccountUC: createAccountUC,
		accountReader:   accountReader,
	}
}

// ========================= WRITE PATHS  =========================

// ========================= READ PATHS  =========================

func (h *Handler) GetAccount(ctx context.Context, req *pb.GetAccountRequest) (*pb.GetAccountResponse, error) {
	// TODO: update to use interceptor
	tempMemberID := uuid.New()

	res, err := h.accountReader.Execute(ctx, tempMemberID)

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
	// withRetry helper returns ErrMaxRetries, ErrConcurrentModification is internal
	// but leaving it here for defense
	case errors.Is(err, usecase.ErrMaxRetries) || errors.Is(err, account.ErrConcurrentModification):
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
	// request structurally valid, but account state doesnt allow, or violates the
	// system constraints like FK, null when supposed to be NOT NULL, etc
	case errors.Is(err, commonconstants.ErrConstraintViolation) || errors.Is(err, account.ErrHoldsExceedBalanace):
		msg = "failed precondition"
		code = codes.FailedPrecondition

		// expected error, normal operations, but for tracking where things went wrong
		// if a bug is reported and we need to trace it
		logLevel = slog.LevelInfo

	case errors.Is(err, account.ErrInvalidAmount) || errors.Is(err, account.ErrInvalidGold):
		code = codes.InvalidArgument
		msg = "invalid argument"

	default:
		// unexpected, unhandled error
		code = codes.Internal
		msg = "unhandled error"
		logLevel = slog.LevelError
	}

	slog.Log(ctx, logLevel, "rpc error", "err", err, "code", code.String())
	return status.Error(code, msg)
}
