package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// WithdrawBidUC cancels a bid the caller owns. Ownership is enforced by the
// domain, which compares the bid's member against MemberID — so MemberID must be
// the authenticated caller, never taken from the request body.
//
// Withdrawing the current leader promotes the runner-up (ADR-0028); the domain
// does it in the same write. Only the withdrawn bid's hold is released here: the
// runner-up's has been RESERVED since it was placed and now backs the lead.
type WithdrawBidUC struct {
	repo        listing.Repository
	holdRelease HoldReleaseStarter
}

func NewWithdrawBidUC(repo listing.Repository, holdRelease HoldReleaseStarter) *WithdrawBidUC {
	return &WithdrawBidUC{
		repo:        repo,
		holdRelease: holdRelease,
	}
}

type WithdrawBidCommand struct {
	ListingID uuid.UUID
	BidID     uuid.UUID
	MemberID  uuid.UUID
	Now       time.Time
}

func (uc *WithdrawBidUC) Handle(ctx context.Context, cmd WithdrawBidCommand) error {
	err := withRetry(ctx, func() error {
		listingDomain, err := uc.repo.FindByID(ctx, cmd.ListingID)

		if err != nil {
			return fmt.Errorf("withdraw bid usecase handle findByID listing id %v : %w", cmd.ListingID, err)
		}

		before := listingDomain.Snapshot()

		if err := listingDomain.WithdrawBid(cmd.BidID, cmd.MemberID, cmd.Now); err != nil {
			return fmt.Errorf("withdraw bid usecase handle withdrawing bid id %v : %w", cmd.BidID, err)
		}

		if err := uc.repo.Save(ctx, listingDomain, before); err != nil {
			return fmt.Errorf("withdraw bid usecase handle saving listing id %v : %w", cmd.ListingID, err)
		}

		return nil
	})
	if err != nil {
		return err
	}

	// The gold goes back, and nothing else will send it. Settlement releases losing
	// bids and rolled-back ones, but a CANCELLED bid is in neither set — it left the
	// auction — so without this the reservation outlives the bid indefinitely.
	//
	// After the write, never before: releasing first and then failing to cancel would
	// leave a live bid with no gold behind it, the same state PlaceBid's
	// hold-before-bid ordering exists to prevent, reached from the other direction.
	//
	// Started, not awaited: the run retries the release until it lands, so a wallet
	// outage no longer strands the gold. Not returned as an error if the start itself
	// fails — the bid is already cancelled by this point, so reporting failure would
	// invite a retry of a withdrawal that already happened. The reconciler picks the
	// hold up instead.
	startCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), compensationTimeout)
	defer cancel()

	if releaseErr := uc.holdRelease.StartReleaseHold(startCtx, cmd.ListingID, cmd.BidID); releaseErr != nil {
		slog.ErrorContext(ctx, "bid withdrawn but starting its hold release failed, gold stays held until reconciled",
			"bid_id", cmd.BidID, "listing_id", cmd.ListingID, "err", releaseErr)
	}

	return nil
}
