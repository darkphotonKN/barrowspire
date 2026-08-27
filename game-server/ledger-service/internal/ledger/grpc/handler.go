package grpc

import (
	"context"
	"errors"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	cursor "github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/dto"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// INBOUND Adapter
type Handler struct {
	// grpc
	pb.UnimplementedLedgerServiceServer

	// read
	transactionReader TransactionReader
	entriesReader     EntriesReader
}

type TransactionReader interface {
	Execute(ctx context.Context, transactionID uuid.UUID) (*dto.TransactionDetails, error)
}

type EntriesReader interface {
	Execute(ctx context.Context, accountIDTarget *uuid.UUID, cursor *cursor.Cursor, limit int) (*dto.ListEntriesDetails, error)
}

func NewHandler(transactionReader TransactionReader, entriesReader EntriesReader) *Handler {
	return &Handler{
		transactionReader: transactionReader,
		entriesReader:     entriesReader,
	}
}

// ========================= WRITE PATHS  =========================
// nothing, for now

// ========================= READ PATHS  =========================

// translates domain / infrastructure sentinels into grpc status codes.
// domain-specific cases get added here as the domain grows its own sentinels.
func mapError(ctx context.Context, err error) error {
	var code codes.Code
	var msg string
	logLevel := slog.LevelWarn

	switch {

	// NOTE: duplicate resource
	// maps to 409 http code, conflict
	case errors.Is(err, commonconstants.ErrDuplicateResource):
		code = codes.AlreadyExists
		msg = "already exists"

	// NOTE: not found
	// maps to http code 404 not found
	case errors.Is(err, commonconstants.ErrNotFound):
		code = codes.NotFound
		msg = "ledger not found"

	// NOTE: transient error
	// maps to http code 503 temporarily unavailable, client worth retrying shortly
	// retry worthy error, but might need to wait for availability
	case errors.Is(err, commonconstants.ErrTransient):
		code = codes.Unavailable
		msg = "temporarily unavailable, retry shortly"

	// NOTE: invalid argument
	// maps to http 400 bad request
	case errors.Is(err, ledger.ErrInvalidUUID):
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
