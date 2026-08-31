package grpc

import (
	"context"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	cursor "github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
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
//
// It is deliberately EMPTY. Every caller currently falls through to Internal.
//
// TODO(I-0021): fill the read-path mappings. The sentinel set to cover spans
// two packages, and that is the trap — domain/ledger/errors.go supplies
// ErrInvalidUUID, and common/utils/cursor supplies cursor.ErrInvalidCursor,
// cursor.ErrInvalidDate and cursor.ErrInvalidUUID, which is a DIFFERENT
// sentinel from the ledger one despite the identical name. An arm matching
// only the ledger sentinels compiles, reads correctly, and drops every
// malformed cursor into Internal below — a 500 where FS-0003 §API surface says
// 422. Also needed: NotFound (masked, never Forbidden — see I-0025),
// PermissionDenied, Unauthenticated, Unavailable.
//
//nolint:unused // no handler arm calls this until I-0041; I-0021 fills it.
func mapError(ctx context.Context, err error) error {
	// No mappings. I-0021 owns this function; a pre-filled arm here would
	// silently pre-empt a decision that slice is meant to make.
	code := codes.Internal
	msg := "internal error"

	slog.Log(ctx, slog.LevelError, "rpc error", "err", err, "code", code.String())
	return status.Error(code, msg)
}
