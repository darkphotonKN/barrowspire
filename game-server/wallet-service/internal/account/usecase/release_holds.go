package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/domain/account"
	"github.com/google/uuid"
)

// holdReleaser is the release loop both settlement steps that give gold back are
// built on: the pre-pivot rollback (§Req 12) and step 2 of the tail (§Req 29). They
// differ in which bids they are given and what they report, never in the rules for
// releasing one, so those rules live here once.
type holdReleaser struct {
	repo account.Repository
}

// releaseEach releases the hold for every bid in bidIDs and reports how many are
// released once it returns — not how many this call moved. A step that is retried
// has to answer the same thing every time (§Req 9: already applied returns the same
// output the first application would give), so a re-run over holds that are all
// released still reports them.
func (r holdReleaser) releaseEach(ctx context.Context, bidIDs []uuid.UUID, now time.Time) (int, error) {
	released := 0

	for _, bidID := range bidIDs {
		ok, err := r.releaseOne(ctx, bidID, now)

		if err != nil {
			// named so a partial release says which bid it stopped on; the step is
			// retried from the beginning and the ones already done are no-ops
			return released, fmt.Errorf("bid_id %s: %w", bidID, err)
		}

		if ok {
			released++
		}
	}

	return released, nil
}

// releaseOne reports whether bidID's hold is released once it returns, which is true
// both for one this call moved and one an earlier attempt already moved.
func (r holdReleaser) releaseOne(ctx context.Context, bidID uuid.UUID, now time.Time) (bool, error) {
	released := false

	// retry due to optimistic concurrency (OCC)
	err := withRetry(ctx, func() error {
		acc, err := r.repo.FindByBidID(ctx, bidID)

		// No hold for this bid, so there is nothing to give back. A bid whose gold
		// was never held is ordinary input here — a FAILED bid is one wallet refused
		// to hold for in the first place — and both callers retry without giving up
		// on a schedule of their own, so treating it as an error would not merely be
		// wrong, it would never finish.
		if errors.Is(err, commonconstants.ErrNotFound) {
			released = false
			return nil
		}

		if err != nil {
			return fmt.Errorf("FindByBidID: %w", err)
		}

		before := acc.Snapshot()

		if err := acc.ReleaseHold(bidID, now); err != nil {
			return fmt.Errorf("ReleaseHold: %w", err)
		}

		// a no-op when the hold was already released: the snapshot carries no change
		if err := r.repo.Save(ctx, acc, before); err != nil {
			return fmt.Errorf("Save: %w", err)
		}

		released = true

		return nil
	})

	return released, err
}
