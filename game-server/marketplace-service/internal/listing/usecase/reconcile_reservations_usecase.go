package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
)

type ReconcileReader interface {
	HasActiveListing(ctx context.Context, itemID uuid.UUID) (bool, error)
}

// adapter interface
type ReconcileReserver interface {
	ListStaleReserved(ctx context.Context, delay time.Time) (*pb.ListStaleReservedResponse, error)
	CancelReservation(ctx context.Context, itemID uuid.UUID) (*pb.CancelReservationResponse, error)
}

type ReconcileReservationsUC struct {
	reconcileReader   ReconcileReader
	reconcileReserver ReconcileReserver
}

func NewReconcileReservationsUC(reconcileReader ReconcileReader, reconcileReserver ReconcileReserver) *ReconcileReservationsUC {
	return &ReconcileReservationsUC{
		reconcileReader:   reconcileReader,
		reconcileReserver: reconcileReserver,
	}
}

func (uc *ReconcileReservationsUC) Handle(ctx context.Context) error {

	reservedBefore := time.Now().Add(-time.Minute * 10)
	stale, err := uc.reconcileReserver.ListStaleReserved(ctx, reservedBefore)
	if err != nil {
		return fmt.Errorf("list stale reserved: %w", err)
	}

	for _, itemID := range stale.ItemIds {
		id, err := uuid.Parse(itemID)
		if err != nil {
			slog.Info("invalid item id")
			continue
		}
		exists, err := uc.reconcileReader.HasActiveListing(ctx, id)
		if err != nil {
			slog.Error("check listing failed", "item_id", id, "error", err)
			continue
		}
		if exists {
			continue
		}

		if _, err := uc.reconcileReserver.CancelReservation(ctx, id); err != nil {
			slog.Error("cancel failed", "item_id", id, "error", err)
			continue // 下一轮再试
		}
		slog.Warn("reconciled orphaned reservation", "item_id", id)
	}
	return nil
}

// todo： ReconcileReader兩個func 到item service的grpc > handle > service > repo 流程還沒寫, worker
