package grpc

import "github.com/darkphotonKN/barrowspire-server/wallet-service/internal/usecase"

// INBOUND Adapter
// Satisfies the port of the usecase to pipe external grpc calls into the
// usecase.

type Handler struct {
	// read

	// write
	createAccountUC *usecase.CreateAccountUC
}

func NewHandler(createAccountUC *usecase.CreateAccountUC) *Handler {
	return &Handler{
		createAccountUC: createAccountUC,
	}
}
