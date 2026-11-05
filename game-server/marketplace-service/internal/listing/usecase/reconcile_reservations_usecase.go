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

// staleReservationsPage is how many stale reservations the reconciler reads per
// call, items' maximum. A pass reads every page, so this bounds one call, not
// one pass (FS-9BJCP Req 11).
const staleReservationsPage = 100

type ReconcileReader interface {
	// HasLiveListing answers for the reservation's own listing id (FS-04ZB6 Req 11).
	HasLiveListing(ctx context.Context, listingID uuid.UUID) (bool, error)
}

// adapter interface
type ReconcileReserver interface {
	ListStaleReserved(ctx context.Context, olderThan time.Duration, after string, limit int) (*pb.ListStaleReservedResponse, error)
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

// Handle reads every stale reservation, page by page from the first, and settles
// each one way or the other: its own listing is live, so the reservation is
// confirmed and leaves the stale set; it is not, so the item goes back to its
// seller. Another live listing on the same item does not count.
//
// A row that fails is logged and skipped, and the keyset moves past it, so it
// never hides the rows behind it; the next tick tries it again (FS-9BJCP Req 11,
// 14). A page that cannot be read, an items that answers no progress, or the end
// of the pass context ends the pass with an error. An items that answers no next
// (one too old to page) ends the pass after its one page (Req 18).
func (uc *ReconcileReservationsUC) Handle(ctx context.Context) error {
	// the bound every reconcile pass runs under
	ctx, cancel := context.WithTimeout(ctx, reconcilePassTimeout)
	defer cancel()

	var tally staleReservationTally
	defer func() {
		slog.InfoContext(ctx, "stale reservation pass done",
			"confirmed", tally.confirmed, "cancelled", tally.cancelled, "skipped", tally.skipped)
	}()

	after := ""
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("list stale reserved after %q: %w", after, err)
		}
		page, err := uc.reconcileReserver.ListStaleReserved(ctx, staleReservationAge, after, staleReservationsPage)
		if err != nil {
			return fmt.Errorf("list stale reserved after %q: %w", after, err)
		}
		if err := uc.reconcilePage(ctx, page.GetReservations(), &tally); err != nil {
			return fmt.Errorf("reconcile stale reservations after %q: %w", after, err)
		}

		// items answers next only when another page follows
		next := page.GetNext()
		if next == "" {
			return nil
		}
		if next == after {
			// paging again would ask for this same page forever
			return fmt.Errorf("list stale reserved after %q: items answered the same position as next, no progress", after)
		}
		after = next
	}
}

// staleReservationTally counts what one pass did, for its one log line.
type staleReservationTally struct {
	confirmed, cancelled, skipped int
}

// reconcilePage settles each row of one page. It stops once the pass context has
// ended, before the next row or during one, and answers why; a row's own failure
// is logged and only counted.
func (uc *ReconcileReservationsUC) reconcilePage(ctx context.Context, rows []*pb.StaleReservation, tally *staleReservationTally) error {
	for _, r := range rows {
		if err := ctx.Err(); err != nil {
			return err
		}
		settled, err := uc.reconcile(ctx, r, tally)
		if err != nil {
			return err
		}
		if !settled {
			tally.skipped++
		}
	}
	return nil
}

// reconcile confirms or cancels one stale reservation and answers whether it
// did; false means the row was logged and left for the next tick. An error means
// the pass context ended while the row's call was in flight: the row is not
// logged as failed, since the pass reports the stop once (Req 13), and it is read
// again next tick.
func (uc *ReconcileReservationsUC) reconcile(ctx context.Context, r *pb.StaleReservation, tally *staleReservationTally) (bool, error) {
	itemID, err := uuid.Parse(r.GetItemId())
	if err != nil {
		slog.ErrorContext(ctx, "stale reservation has an invalid item id", "item_id", r.GetItemId())
		return false, nil
	}
	listingID, err := uuid.Parse(r.GetListingId())
	if err != nil {
		slog.ErrorContext(ctx, "stale reservation has an invalid listing id", "item_id", itemID, "listing_id", r.GetListingId())
		return false, nil
	}

	exists, err := uc.reconcileReader.HasLiveListing(ctx, listingID)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return false, ctxErr
		}
		slog.ErrorContext(ctx, "check listing failed", "item_id", itemID, "listing_id", listingID, "error", err)
		return false, nil
	}

	if exists {
		if _, err := uc.reconcileReserver.ConfirmReservation(ctx, itemID, listingID); err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return false, ctxErr
			}
			slog.ErrorContext(ctx, "confirm reservation failed", "item_id", itemID, "listing_id", listingID, "error", err)
			return false, nil
		}
		tally.confirmed++
		return true, nil
	}

	if _, err := uc.reconcileReserver.CancelReservation(ctx, itemID, listingID); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return false, ctxErr
		}
		slog.ErrorContext(ctx, "cancel reservation failed", "item_id", itemID, "listing_id", listingID, "error", err)
		return false, nil
	}
	tally.cancelled++
	slog.WarnContext(ctx, "reconciled orphaned reservation", "item_id", itemID, "listing_id", listingID)
	return true, nil
}
