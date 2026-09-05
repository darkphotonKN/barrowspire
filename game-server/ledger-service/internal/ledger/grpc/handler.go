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

// mapError translates domain and infrastructure sentinels into gRPC status
// codes for the READ path. After ADR-0011 the only gRPC on this service is
// GetTransaction and ListEntries; the write path is a Temporal activity whose
// errors are classified by retry policy (ledger.IsNonRetryable), never here.
func mapError(ctx context.Context, err error) error {
	code := codes.Internal
	msg := "internal error"
	logLevel := slog.LevelWarn

	switch {
	case errors.Is(err, commonconstants.ErrTransient):
		code = codes.Unavailable
		msg = "retry later"

	case errors.Is(err, cursor.ErrInvalidDate) || errors.Is(err, cursor.ErrInvalidCursor) || errors.Is(err, cursor.ErrInvalidUUID):
		code = codes.InvalidArgument
		msg = "malformed cursor"

	case errors.Is(err, commonconstants.ErrNotFound):
		code = codes.NotFound // client gets not found, but log below logs the full detail in "err"
		// must stay generic for masking
		msg = "not found"

	case errors.Is(err, ledger.ErrInvalidUUID):
		code = codes.InvalidArgument
		msg = "malformed id"

	default:
		// unhandled and unexpected errors, keep log for tracing
		logLevel = slog.LevelError
	}

	slog.Log(ctx, logLevel, "rpc error", "err", err, "code", code.String())
	return status.Error(code, msg)
}
