package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// Usecase
// Coordinator of the domain, incoming requests, and outbound calls like
// repository and external services.
// Recommended to keep our structure with thin slices of functionality in each usecase

// ListingReservation is what creating a listing needs from items: the item's
// reservation for this listing, confirmed before the listing is written and
// released if the listing definitely will not be (ADR-0050).
type ListingReservation interface {
	ConfirmReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ConfirmReservationResponse, error)
	ReleaseConfirmedReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ReleaseConfirmedReservationResponse, error)
}

// reservationCallTimeout bounds each call to items, so a hung items-service holds
// one delivery for this long, not the consumer forever. A call that runs out
// decided nothing and the event is redelivered.
const reservationCallTimeout = 10 * time.Second

// listingInsertTimeout bounds the insert after a successful confirm, so a hung
// database cannot stretch the gap between confirm and insert toward the
// backstop's 10-minute grace (FS-04ZB6 Req 12). A timeout is an unknown outcome:
// the event is requeued, never released.
const listingInsertTimeout = 10 * time.Second

type CreateListingUC struct {
	repo        listing.Repository
	reservation ListingReservation
}

func NewCreateListingUC(repo listing.Repository, reservation ListingReservation) *CreateListingUC {
	return &CreateListingUC{
		repo:        repo,
		reservation: reservation,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
type CreateListingCommand struct {
	// ListingID is the ID items-service minted on reserve; the listing is born with it.
	ListingID  uuid.UUID
	SellerID   uuid.UUID
	ItemID     uuid.UUID
	StartPrice int
	// BuyoutPrice is optional; nil births a plain auction.
	BuyoutPrice *int
	Now         time.Time
	EndsAt      time.Time
}

// Handle turns one reservation into a listing: validate the terms, confirm the
// reservation, then insert (ADR-0050 rule 1).
//
// nil means the event is done with: the listing was inserted, was already there
// (a replay), or the item is no longer reserved for it. A domain refusal or a
// definite insert refusal can never succeed on redelivery. Any other error
// decided nothing for certain and is worth redelivering.
func (uc *CreateListingUC) Handle(ctx context.Context, cmd *CreateListingCommand) error {
	// validated before confirming: a refused event leaves its reservation waiting,
	// for the reconciler to cancel
	listingDomain, err := listing.NewListing(cmd.ListingID, cmd.SellerID, cmd.ItemID, cmd.StartPrice, cmd.BuyoutPrice, cmd.Now, cmd.EndsAt)
	if err != nil {
		return fmt.Errorf("create listing usecase birthing new listing : %w", err)
	}

	confirmed, err := uc.confirm(ctx, cmd.ItemID, cmd.ListingID)
	if err != nil {
		return fmt.Errorf("create listing usecase confirming reservation of item %s for listing %s: %w: %w",
			cmd.ItemID, cmd.ListingID, commonconstants.ErrTransient, err)
	}
	if !confirmed {
		// cancelled by the reconciler, relisted under another id, or past LISTED
		slog.InfoContext(ctx, "item no longer reserved for this listing, dropping event",
			"item_id", cmd.ItemID, "listing_id", cmd.ListingID)
		return nil
	}

	err = uc.insert(ctx, listingDomain)
	if err == nil {
		return nil
	}
	if errors.Is(err, listing.ErrListingAlreadyExists) {
		slog.InfoContext(ctx, "listing already exists, replayed event acknowledged",
			"item_id", cmd.ItemID, "listing_id", cmd.ListingID)
		return nil
	}
	if !insertRefused(err) {
		// the INSERT may have landed: releasing could free an item under a live
		// listing. Redelivery confirms again and either inserts or meets the row.
		return fmt.Errorf("create listing usecase inserting listing %s, outcome unknown: %w", cmd.ListingID, err)
	}

	return uc.releaseAfterRefusal(ctx, cmd, err)
}

// insertRefused reports an insert failure that proves the row was not written:
// the database refused the statement. Like bidRejected for PlaceBid, anything
// not listed here is treated as unknown, because only a refusal proves the
// write rolled back. A replay (ErrListingAlreadyExists) is handled before this.
func insertRefused(err error) bool {
	return errors.Is(err, commonconstants.ErrDuplicateResource) ||
		errors.Is(err, commonconstants.ErrConstraintViolation)
}

// releaseAfterRefusal is the TCC Cancel: the item was confirmed for a listing
// that will never exist, so it goes back to its seller before the event is
// dead-lettered. The refusal is returned so the event is dead-lettered; a
// release that got no answer is returned as transient instead, so the event is
// redelivered and the whole path runs again.
func (uc *CreateListingUC) releaseAfterRefusal(ctx context.Context, cmd *CreateListingCommand, refusal error) error {
	callCtx, cancel := context.WithTimeout(ctx, reservationCallTimeout)
	defer cancel()

	res, err := uc.reservation.ReleaseConfirmedReservation(callCtx, cmd.ItemID, cmd.ListingID)
	if err != nil {
		// the refusal is kept as text only: in the chain it would read as
		// dead-letter, with the item still LISTED under no listing
		return fmt.Errorf("create listing usecase releasing item %s after refused insert (%v): %w: %w",
			cmd.ItemID, refusal, commonconstants.ErrTransient, err)
	}

	released := res.GetReleased()
	// Warn, not Error: the consumer logs the dead-letter at Error once, and the
	// returned refusal carries the released flag into that line
	slog.WarnContext(ctx, "listing insert refused after confirm, releasing item and dead-lettering",
		"item_id", cmd.ItemID, "listing_id", cmd.ListingID, "released", released, "error", refusal)
	if !released {
		slog.WarnContext(ctx, "release of confirmed reservation matched nothing",
			"item_id", cmd.ItemID, "listing_id", cmd.ListingID)
	}

	return fmt.Errorf("create listing usecase inserting listing %s refused (item released: %t): %w",
		cmd.ListingID, released, refusal)
}

// insert writes the listing under listingInsertTimeout.
func (uc *CreateListingUC) insert(ctx context.Context, l *listing.Listing) error {
	insertCtx, cancel := context.WithTimeout(ctx, listingInsertTimeout)
	defer cancel()

	return uc.repo.Insert(insertCtx, l)
}

// confirm asks items whether the item is still reserved for this listing, taking
// it out of the reconciler's reach if so.
func (uc *CreateListingUC) confirm(ctx context.Context, itemID, listingID uuid.UUID) (bool, error) {
	callCtx, cancel := context.WithTimeout(ctx, reservationCallTimeout)
	defer cancel()

	res, err := uc.reservation.ConfirmReservation(callCtx, itemID, listingID)
	if err != nil {
		return false, err
	}
	return res.GetConfirmed(), nil
}
