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
)

// INBOUND Adapter
// Satisfies the port of the usecase to pipe external grpc calls into the
// usecase.

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

func NewHandler(createAccountUC *usecase.CreateAccountUC) *Handler {
	return &Handler{
		createAccountUC: createAccountUC,
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

	// TODO: map to pb

	return nil, nil
}

func mapError(ctx context.Context, err error) error {
	switch {
	case errors.Is(err, account.ErrConcurrentModification):
		// OCC version mismatch. caller can retry with fresh state.
		return status.Error(codes.Aborted, "aborted")
	case errors.Is(err, commonconstants.ErrDuplicateResource):
		return status.Error(codes.AlreadyExists, "already exists")
	case errors.Is(err, commonconstants.ErrNotFound):
		return status.Error(codes.NotFound, "not found")
	// NOTE: retry worthy
	case errors.Is(err, commonconstants.ErrTransient):
		return status.Error(codes.Unavailable, "unavailable")
	// request structurally valid, but account state doesnt allow, or violates the
	// system constraints like FK , null when supposed to be NOT NULL, etc
	case errors.Is(err, commonconstants.ErrConstraintViolation) || errors.Is(err, account.ErrHoldsExceedBalanace):
		return status.Error(codes.FailedPrecondition, "failed precondition")

	case errors.Is(err, account.ErrInvalidAmount) || errors.Is(err, account.ErrInvalidGold):
		return status.Error(codes.InvalidArgument, "invalid argument")

	default:
		// unexpected error
		slog.ErrorContext(ctx, "unexpected error")
		return status.Error(codes.Internal, "internal")
	}

}
