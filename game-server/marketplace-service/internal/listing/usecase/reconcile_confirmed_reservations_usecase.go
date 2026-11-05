package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
)

// confirmedReservationGrace is how long ago a reservation must have been
// confirmed before the backstop looks at it. It keeps the backstop away from an
// item.reserved consumer that has confirmed but not yet inserted its listing.
// items-service measures it on its own database clock, the clock that stamped
// the confirmation (FS-04ZB6 Req 12).
const confirmedReservationGrace = 10 * time.Minute

// confirmedReservationsPage is how many confirmed reservations the backstop reads
// per call, items' maximum. A tick reads every page, so this bounds one call, not
// one tick.
const confirmedReservationsPage = 100

type ConfirmedReservationReader interface {
	// ListingStatuses answers the status of each listing among listingIDs that
	// exists, in any status. An id missing from the answer has no listing at all.
	ListingStatuses(ctx context.Context, listingIDs []uuid.UUID) (map[uuid.UUID]listing.ListingStatus, error)
}

// adapter interface
type ConfirmedReservationReserver interface {
	ListConfirmedReservations(ctx context.Context, olderThan time.Duration, after string, limit int) (*pb.ListConfirmedReservationsResponse, error)
	ReleaseConfirmedReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ReleaseConfirmedReservationResponse, error)
}

// ReconcileConfirmedReservationsUC is the confirmed-without-listing backstop
// (FS-04ZB6 Req 12, ADR-0050 rule 5): an item items holds LISTED and confirmed
// for a listing id that no listing carries is handed back to its seller.
type ReconcileConfirmedReservationsUC struct {
	confirmedReader   ConfirmedReservationReader
	confirmedReserver ConfirmedReservationReserver
}

func NewReconcileConfirmedReservationsUC(confirmedReader ConfirmedReservationReader, confirmedReserver ConfirmedReservationReserver) *ReconcileConfirmedReservationsUC {
	return &ReconcileConfirmedReservationsUC{
		confirmedReader:   confirmedReader,
		confirmedReserver: confirmedReserver,
	}
}

// Handle reads every confirmed reservation past the grace, page by page, and
// settles each one by whether a listing with its id exists in any status: none,
// so the item is released to its seller; a live one, so nothing is owed; an
// ended one over a still-LISTED item, so it is warned about and left for a
// human. The listings of a page are looked up in one query.
//
// A row that fails is logged and skipped, and the keyset moves past it, so it
// never hides the rows behind it; the next tick tries it again. A failed lookup
// skips its whole page the same way: not knowing is never read as no listing.
// A page that cannot be read, an items that answers no progress, or the pass
// deadline ends the pass with an error.
func (uc *ReconcileConfirmedReservationsUC) Handle(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, reconcilePassTimeout)
	defer cancel()

	after := ""
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("list confirmed reservations after %q: %w", after, err)
		}
		page, err := uc.confirmedReserver.ListConfirmedReservations(ctx, confirmedReservationGrace, after, confirmedReservationsPage)
		if err != nil {
			return fmt.Errorf("list confirmed reservations after %q: %w", after, err)
		}
		uc.reconcilePage(ctx, page.GetReservations())

		// items answers next only when another page follows
		next := page.GetNext()
		if next == "" {
			return nil
		}
		if next == after {
			// paging again would ask for this same page forever
			return fmt.Errorf("list confirmed reservations after %q: items answered the same position as next, no progress", after)
		}
		after = next
	}
}

// confirmedReservation is one row of a page, with both ids readable.
type confirmedReservation struct {
	itemID    uuid.UUID
	listingID uuid.UUID
}

func (uc *ReconcileConfirmedReservationsUC) reconcilePage(ctx context.Context, rows []*pb.ConfirmedReservation) {
	reservations := make([]confirmedReservation, 0, len(rows))
	listingIDs := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		itemID, err := uuid.Parse(r.GetItemId())
		if err != nil {
			slog.ErrorContext(ctx, "confirmed reservation has an invalid item id", "item_id", r.GetItemId())
			continue
		}
		listingID, err := uuid.Parse(r.GetListingId())
		if err != nil {
			slog.ErrorContext(ctx, "confirmed reservation has an invalid listing id", "item_id", itemID, "listing_id", r.GetListingId())
			continue
		}
		reservations = append(reservations, confirmedReservation{itemID: itemID, listingID: listingID})
		listingIDs = append(listingIDs, listingID)
	}
	if len(reservations) == 0 {
		return
	}

	statuses, err := uc.confirmedReader.ListingStatuses(ctx, listingIDs)
	if err != nil {
		slog.ErrorContext(ctx, "check listings failed; page left for the next tick", "listings", len(listingIDs), "error", err)
		return
	}

	for _, r := range reservations {
		status, found := statuses[r.listingID]
		uc.reconcile(ctx, r, status, found)
	}
}

func (uc *ReconcileConfirmedReservationsUC) reconcile(ctx context.Context, r confirmedReservation, status listing.ListingStatus, found bool) {
	if found {
		if !status.IsLive() {
			slog.WarnContext(ctx, "confirmed item's listing has ended while the item is still listed; left for a human",
				"item_id", r.itemID, "listing_id", r.listingID, "status", status)
		}
		return
	}

	res, err := uc.confirmedReserver.ReleaseConfirmedReservation(ctx, r.itemID, r.listingID)
	if err != nil {
		slog.ErrorContext(ctx, "release confirmed reservation failed", "item_id", r.itemID, "listing_id", r.listingID, "error", err)
		return
	}
	if !res.GetReleased() {
		// confirmed no longer: sold on, released, or relisted since the page was read
		slog.InfoContext(ctx, "confirmed reservation already moved on; nothing released", "item_id", r.itemID, "listing_id", r.listingID)
		return
	}
	slog.WarnContext(ctx, "released confirmed reservation with no listing", "item_id", r.itemID, "listing_id", r.listingID)
}
