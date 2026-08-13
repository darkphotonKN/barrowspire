package grpc

import (
	"context"
	"errors"
	"log/slog"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/domain/ledger"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/dto"
	"github.com/darkphotonKN/barrowspire-server/ledger-service/internal/ledger/usecase"
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
	ledgerReader LedgerReader

	// write
	createLedgerUC *usecase.CreateLedgerUC
}

type LedgerReader interface {
	Execute(ctx context.Context, memberID uuid.UUID) (*dto.LedgerDetails, error)
}

func NewHandler(createLedgerUC *usecase.CreateLedgerUC, ledgerReader LedgerReader) *Handler {
	return &Handler{
		createLedgerUC: createLedgerUC,
		ledgerReader:   ledgerReader,
	}
}

// ========================= WRITE PATHS  =========================

func (h *Handler) CreateLedger(ctx context.Context, req *pb.CreateLedgerRequest) (*pb.CreateLedgerResponse, error) {
	memberID, ok := commonauth.MemberIDFromCtx(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	l, err := h.createLedgerUC.Handle(ctx, usecase.CreateLedgerCommand{
		MemberID: memberID,
	})

	if err != nil {
		return nil, mapError(ctx, err)
	}

	snapshot := l.Snapshot()

	return &pb.CreateLedgerResponse{
		Id:        snapshot.ID.String(),
		MemberId:  snapshot.MemberID.String(),
		CreatedAt: timestamppb.New(snapshot.CreatedAt),
	}, nil
}

// ========================= READ PATHS  =========================

func (h *Handler) GetLedger(ctx context.Context, req *pb.GetLedgerRequest) (*pb.GetLedgerResponse, error) {
	// extract id from ctx passed from interceptor middleware
	id, ok := commonauth.MemberIDFromCtx(ctx)

	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing identity")
	}

	res, err := h.ledgerReader.Execute(ctx, id)

	if err != nil {
		return nil, mapError(ctx, err)
	}

	return &pb.GetLedgerResponse{
		Id:        res.ID.String(),
		MemberId:  res.MemberID.String(),
		CreatedAt: timestamppb.New(res.CreatedAt),
	}, nil
}

// translates domain / infrastructure sentinels into grpc status codes.
// domain-specific cases get added here as the domain grows its own sentinels.
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
	case errors.Is(err, usecase.ErrMaxRetries) || errors.Is(err, ledger.ErrConcurrentModification):
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
