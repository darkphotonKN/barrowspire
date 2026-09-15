package grpc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commoncursor "github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/dto"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
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
	Execute(ctx context.Context, caller *commonauth.Identity, accountIDTarget *uuid.UUID, cursor *commoncursor.Cursor, limit int) (*dto.ListEntriesDetails, error)
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
func (h *Handler) ListEntries(ctx context.Context, req *pb.ListEntriesRequest) (*pb.ListEntriesResponse, error) {

	// validates and passes caller, query houses the logic that determines whos gets what
	identity, ok := commonauth.IdentityFromCtx(ctx)

	if !ok {
		return nil, mapError(ctx, fmt.Errorf("ledger service token unauthenticated : %w", apperr.ErrUnauthenticated))
	}

	// deocde and validate cursor
	cursor, err := commoncursor.Decode(req.Cursor)

	if err != nil {
		return nil, mapError(ctx, err)
	}

	// validate accountId target, if present
	var accountIdTarget *uuid.UUID
	if req.AccountIdTarget != nil {
		a, err := uuid.Parse(*req.AccountIdTarget)
		if err != nil {
			return nil, mapError(ctx, fmt.Errorf("ledger service account_id_target corrupted : %w", ledger.ErrInvalidUUID))
		}

		accountIdTarget = &a
	}

	res, err := h.entriesReader.Execute(ctx, &commonauth.Identity{
		AccountID: identity.AccountID,
		Role:      identity.Role,
	}, accountIdTarget, cursor, int(req.Limit))

	if err != nil {
		return nil, mapError(ctx, err)
	}

	// map to proto
	protoEntries := make([]*pb.Entry, 0, len(res.Entries))

	for _, entry := range res.Entries {
		protoEntries = append(protoEntries, &pb.Entry{
			Id:            entry.ID.String(),
			TransactionId: entry.TransactionID.String(),
			ReferenceId:   entry.ReferenceID.String(),
			AccountId:     entry.AccountID.String(),
			Reason:        entry.Reason,
			Amount:        entry.Amount,
			Direction:     entry.Direction,
			CreatedAt:     timestamppb.New(entry.CreatedAt),
		})

	}

	return &pb.ListEntriesResponse{
		Entries: protoEntries,
	}, nil
}

// mapError translates domain and infrastructure sentinels into gRPC status
// codes for the READ path. After ADR-0011 the only gRPC on this service is
// GetTransaction and ListEntries; the write path is a Temporal activity whose
// errors are classified by retry policy (ledger.IsNonRetryable), never here.
func mapError(ctx context.Context, err error) error {
	code := codes.Internal
	msg := "internal error"
	logLevel := slog.LevelWarn

	switch {
	case errors.Is(err, apperr.ErrUnauthenticated):
		code = codes.Unauthenticated
		msg = "unauthenticated"

	case errors.Is(err, commonconstants.ErrTransient):
		code = codes.Unavailable
		msg = "retry later"

	case errors.Is(err, commoncursor.ErrInvalidDate) || errors.Is(err, commoncursor.ErrInvalidCursor) || errors.Is(err, commoncursor.ErrInvalidUUID):
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
