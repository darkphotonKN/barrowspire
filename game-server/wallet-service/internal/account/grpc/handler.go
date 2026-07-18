package grpc

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/usecase"
	"github.com/google/uuid"
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
		// TODO: update to handle errors based on sentinel
		return nil, err
	}

	return nil, nil
}
