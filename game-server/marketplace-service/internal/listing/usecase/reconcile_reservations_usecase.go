package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
)

// staleReservationAge is how long an item may sit LISTED waiting for its listing
// before the reconciler asks whether the listing exists. items-service measures
// it on its own database clock, so a reservation made just as the worker ticks is
// still never looked at before this much time has passed.
const staleReservationAge = 10 * time.Minute

type ReconcileReader interface {
	HasLiveListing(ctx context.Context, itemID uuid.UUID) (bool, error)
}

// adapter interface
type ReconcileReserver interface {
	ListStaleReserved(ctx context.Context, olderThan time.Duration) (*pb.ListStaleReservedResponse, error)
	CancelReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.CancelReservationResponse, error)
	ConfirmReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ConfirmReservationResponse, error)
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

// Handle settles each stale reservation one way or the other: a listing exists,
// so the reservation is confirmed and leaves the stale set; none does, so the
// item goes back to its seller. A row that fails is left for the next sweep.
func (uc *ReconcileReservationsUC) Handle(ctx context.Context) error {
	stale, err := uc.reconcileReserver.ListStaleReserved(ctx, staleReservationAge)
	if err != nil {
		return fmt.Errorf("list stale reserved: %w", err)
	}

	for _, r := range stale.GetReservations() {
		itemID, err := uuid.Parse(r.GetItemId())
		if err != nil {
			slog.ErrorContext(ctx, "stale reservation has an invalid item id", "item_id", r.GetItemId())
			continue
		}
		listingID, err := uuid.Parse(r.GetListingId())
		if err != nil {
			slog.ErrorContext(ctx, "stale reservation has an invalid listing id", "item_id", itemID, "listing_id", r.GetListingId())
			continue
		}

		exists, err := uc.reconcileReader.HasLiveListing(ctx, itemID)
		if err != nil {
			slog.ErrorContext(ctx, "check listing failed", "item_id", itemID, "error", err)
			continue
		}

		if exists {
			if _, err := uc.reconcileReserver.ConfirmReservation(ctx, itemID, listingID); err != nil {
				slog.ErrorContext(ctx, "confirm reservation failed", "item_id", itemID, "listing_id", listingID, "error", err)
			}
			continue
		}

		if _, err := uc.reconcileReserver.CancelReservation(ctx, itemID, listingID); err != nil {
			slog.ErrorContext(ctx, "cancel reservation failed", "item_id", itemID, "listing_id", listingID, "error", err)
			continue
		}
		slog.WarnContext(ctx, "reconciled orphaned reservation", "item_id", itemID, "listing_id", listingID)
	}
	return nil
}
