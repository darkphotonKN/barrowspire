package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// ListingWithdrawalStarter hands a withdrawn listing's side effects to a durable
// workflow: the item back to its seller and every bid's hold released (ADR-0051).
// It returns once the workflow is started, not once it is done. Starting the same
// listing twice is success.
type ListingWithdrawalStarter interface {
	StartListingWithdrawal(ctx context.Context, listingID, itemID uuid.UUID, bidIDs []uuid.UUID) error
}

// ListingWithdrawalMarker records that a withdrawn listing's workflow has started,
// so the withdraw backstop stops selecting it (FS-V7A5S Req 8 as amended
// 2026-11-05). Fenced on CANCELLED and unmarked, so marking twice is harmless.
type ListingWithdrawalMarker interface {
	MarkWithdrawalStarted(ctx context.Context, listingID uuid.UUID) error
}

// WithdrawListingUC is the seller taking their own listing down (FS-V7A5S). The
// domain decides under the listing's row lock; the item and the gold go back
// through a workflow started after the commit.
//
// MemberID must be the authenticated caller, never taken from the request: the
// domain's seller check compares against it.
type WithdrawListingUC struct {
	repo       listing.Repository
	withdrawal ListingWithdrawalStarter
	marker     ListingWithdrawalMarker
}

func NewWithdrawListingUC(repo listing.Repository, withdrawal ListingWithdrawalStarter, marker ListingWithdrawalMarker) *WithdrawListingUC {
	return &WithdrawListingUC{
		repo:       repo,
		withdrawal: withdrawal,
		marker:     marker,
	}
}

type WithdrawListingCommand struct {
	ListingID uuid.UUID
	MemberID  uuid.UUID
	Now       time.Time
}

func (uc *WithdrawListingUC) Handle(ctx context.Context, cmd WithdrawListingCommand) error {
	var withdrawn listing.ListingSnapshot

	// The row lock, not OCC: a withdrawal must serialize with a bid, a buyout or a
	// bid withdrawal on the same listing, and whichever commits second sees the
	// first (Req 9).
	err := uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
		if err := l.Withdraw(cmd.MemberID, cmd.Now); err != nil {
			return err
		}

		// read under the lock that withdrew the listing, so no bid can join the
		// set after it
		withdrawn = l.Snapshot()

		return nil
	})
	if err != nil {
		return fmt.Errorf("withdraw listing usecase handle listing id %v: %w", cmd.ListingID, err)
	}

	// Every bid, statuses unfiltered, as settlement's 0a passes them: wallet skips a
	// bid it holds nothing for, and a repeat after a failed start finds the live
	// bids already LOST but their gold still held.
	bidIDs := make([]uuid.UUID, 0, len(withdrawn.Bids))
	for _, b := range withdrawn.Bids {
		bidIDs = append(bidIDs, b.ID)
	}

	// Started on a repeat too (Req 4): it dedups on the listing, and it is what
	// makes the seller's retry the recovery when an earlier start failed.
	startCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), workflowStartTimeout)
	defer cancel()

	// A failed start is transient, never success and never a rollback (Req 8 as
	// amended 2026-11-05). The CANCELLED write is committed and stays: the listing
	// is withdrawn. But until a start lands the item stays LISTED and the holds
	// RESERVED, so the seller is told to retry, and the retry, a repeat, starts it.
	// If they never do, the reconcile tick's backstop starts it: the listing is
	// left unmarked, and the backstop starts every unmarked withdrawal.
	if err := uc.withdrawal.StartListingWithdrawal(startCtx, withdrawn.ID, withdrawn.ItemID, bidIDs); err != nil {
		return fmt.Errorf("listing %v withdrawn but its workflow did not start, item %v and holds stay until it does: %w: %w",
			withdrawn.ID, withdrawn.ItemID, commonconstants.ErrTransient, err)
	}

	// Started (or already started): mark it, so the backstop leaves it alone. A
	// failed mark is logged only. The workflow is running and the withdrawal is
	// done; the backstop's next start is a REJECT_DUPLICATE no-op that marks it.
	markWithdrawalStarted(context.WithoutCancel(ctx), uc.marker, withdrawn.ID)

	return nil
}

// markWithdrawalStarted marks a listing whose workflow start landed, under its
// own deadline, and logs a failure rather than returning it: an unmarked started
// withdrawal costs one duplicate start, never a lost one.
func markWithdrawalStarted(ctx context.Context, marker ListingWithdrawalMarker, listingID uuid.UUID) {
	ctx, cancel := context.WithTimeout(ctx, withdrawalMarkTimeout)
	defer cancel()

	if err := marker.MarkWithdrawalStarted(ctx, listingID); err != nil {
		slog.WarnContext(ctx, "withdraw workflow started but the listing was not marked; the backstop will start it again as a no-op and mark it",
			"listing_id", listingID, "error", err)
	}
}

// workflowStartTimeout bounds starting the withdraw workflow after the commit. A
// start is one RPC; a healthy one is milliseconds.
const workflowStartTimeout = 5 * time.Second

// withdrawalMarkTimeout bounds marking a started withdrawal: one indexed UPDATE.
const withdrawalMarkTimeout = 2 * time.Second
