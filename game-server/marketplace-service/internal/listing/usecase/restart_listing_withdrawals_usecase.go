package usecase

import (
	"context"
	"errors"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/dto"
)

// CancelledListingFinder is what the backstop needs from the read side: CANCELLED
// listings whose withdraw workflow is not marked started, ordered by
// (updated_at, id), strictly after the cursor (nil for the first page), each with
// its item and every bid.
type CancelledListingFinder interface {
	UnstartedCancelledListings(ctx context.Context, after *dto.CancelledListing, limit int) ([]dto.CancelledListing, error)
}

// RestartListingWithdrawalsUC is the withdraw backstop (FS-V7A5S Req 8 as amended
// 2026-11-05): it starts the withdraw workflow for every withdrawn listing not
// yet marked started, and marks each start that lands. It catches a start that
// failed and was never retried by the seller, a crash between the CANCELLED
// commit and the start, and a start whose mark failed.
//
// There is no time window: a withdrawal stays a candidate until it is marked, so
// no outage is too long. The decision lives in marketplace's own table, not in
// Temporal's history retention, and the candidate set is normally empty. A
// candidate whose workflow did start (only its mark failed) costs one
// REJECT_DUPLICATE no-op, which the starter answers as success.
type RestartListingWithdrawalsUC struct {
	finder  CancelledListingFinder
	starter ListingWithdrawalStarter
	marker  ListingWithdrawalMarker
}

func NewRestartListingWithdrawalsUC(finder CancelledListingFinder, starter ListingWithdrawalStarter, marker ListingWithdrawalMarker) *RestartListingWithdrawalsUC {
	return &RestartListingWithdrawalsUC{finder: finder, starter: starter, marker: marker}
}

// Handle walks every page of unstarted withdrawals, starting and marking each.
// One failed start or mark does not stop the others; every failure is returned,
// joined, for the tick to log once. Once ctx ends (the pass's deadline passes),
// every later start and read would fail the same way, so the walk stops there and
// reports ctx's error once.
//
// Marking during the walk cannot skip a listing: a marked row leaves the
// candidate set, but it sits at or before the cursor, and the next page starts
// strictly after it.
func (uc *RestartListingWithdrawalsUC) Handle(ctx context.Context) error {
	var failed []error
	stopped := func() error {
		return errors.Join(append(failed, fmt.Errorf("restart listing withdrawals stopped: %w", ctx.Err()))...)
	}
	var after *dto.CancelledListing
	for {
		page, err := uc.finder.UnstartedCancelledListings(ctx, after, withdrawalBackstopPage)
		if ctx.Err() != nil {
			return stopped()
		}
		if err != nil {
			return errors.Join(append(failed, fmt.Errorf("read unstarted cancelled listings: %w", err))...)
		}
		for _, l := range page {
			err := uc.restart(ctx, l)
			if ctx.Err() != nil {
				return stopped()
			}
			if err != nil {
				failed = append(failed, err)
			}
		}
		if len(page) < withdrawalBackstopPage {
			return errors.Join(failed...)
		}
		after = &page[len(page)-1]
	}
}

// restart starts one withdrawal's workflow and, once that lands, marks it, each
// under its own deadline. A failed start leaves it unmarked for the next tick.
func (uc *RestartListingWithdrawalsUC) restart(ctx context.Context, l dto.CancelledListing) error {
	if err := uc.start(ctx, l); err != nil {
		return fmt.Errorf("restart withdrawal for listing %v: %w", l.ID, err)
	}

	markCtx, cancel := context.WithTimeout(ctx, withdrawalMarkTimeout)
	defer cancel()
	if err := uc.marker.MarkWithdrawalStarted(markCtx, l.ID); err != nil {
		return fmt.Errorf("mark withdrawal started for listing %v: %w", l.ID, err)
	}
	return nil
}

// start runs one workflow start under its own deadline.
func (uc *RestartListingWithdrawalsUC) start(ctx context.Context, l dto.CancelledListing) error {
	ctx, cancel := context.WithTimeout(ctx, workflowStartTimeout)
	defer cancel()
	return uc.starter.StartListingWithdrawal(ctx, l.ID, l.ItemID, l.BidIDs)
}

// withdrawalBackstopPage bounds one read of unstarted withdrawals.
const withdrawalBackstopPage = 100
