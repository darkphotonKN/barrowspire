package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// reconcileHoldGrace is how long a reservation must have outlived its bid before the
// reconciler will judge it.
//
// Load-bearing, not tuning. PlaceBid reserves the gold and only then writes the bid,
// so between those two steps a perfectly healthy request looks exactly like an
// orphan. Releasing inside that window would leave a recorded bid with no gold behind
// it — the precise state the hold-before-bid ordering exists to prevent. Ten minutes
// is the same grace the item reservation reconciler uses, and a PlaceBid round trip
// is measured in milliseconds.
const reconcileHoldGrace = 10 * time.Minute

// BidReader answers the question wallet cannot: is anyone still accounting for the
// gold these holds are reserving? A hold carries the bid id it was reserved for, but
// that id is marketplace's claim about what the gold was for, not proof that anything
// was recorded — and not proof that the bid still wants it.
type BidReader interface {
	// BidsHoldingGold answers, in one query, which of bidIDs are still claimed; an id
	// absent from the answer is unclaimed.
	BidsHoldingGold(ctx context.Context, bidIDs []uuid.UUID) (map[uuid.UUID]bool, error)
}

// HoldReconciler is wallet's half: report what is still reserved, a page at a time,
// and give back what this service says was never claimed.
type HoldReconciler interface {
	// ListStaleReservedHolds answers one page of holds created before createdBefore,
	// strictly after the opaque position after ("" for the first page), and the
	// position of the following page ("" on the last one).
	ListStaleReservedHolds(ctx context.Context, createdBefore time.Time, after string) (bidIDs []uuid.UUID, next string, err error)
	ReleaseHold(ctx context.Context, bidID uuid.UUID) error
}

// ReconcileHoldsUC returns gold that PlaceBid reserved and then failed to record a
// bid for — the cases its own compensation could not complete, because wallet was
// unreachable at that moment or the process died before it ran.
//
// The comparison has to happen here rather than in wallet. wallet can enumerate its
// reservations but cannot judge them; marketplace can judge but cannot enumerate,
// because an orphaned hold's bid id exists nowhere in its records. So wallet reports
// and marketplace decides, which is also the direction the two services already
// depend in.
type ReconcileHoldsUC struct {
	bids   BidReader
	wallet HoldReconciler
}

func NewReconcileHoldsUC(bids BidReader, wallet HoldReconciler) *ReconcileHoldsUC {
	return &ReconcileHoldsUC{
		bids:   bids,
		wallet: wallet,
	}
}

// Handle reads every stale reserved hold, page by page from the first, and releases
// each one no recorded bid claims. A page's bids are looked up in one query.
//
// A hold whose release fails is logged and skipped, and the keyset moves past it, so
// it never hides the holds behind it; the next tick tries it again (FS-9BJCP Req 11,
// 14). A failed lookup skips its whole page the same way: not knowing whether a bid
// exists is never read as knowing it does not (Req 15). A page that cannot be read, a
// wallet that answers no progress, or the end of the pass context ends the pass with
// an error. A wallet that answers no next (one too old to page) ends the pass after
// its one page (Req 18).
func (uc *ReconcileHoldsUC) Handle(ctx context.Context) error {
	// the bound every reconcile pass runs under (Req 13)
	ctx, cancel := context.WithTimeout(ctx, reconcilePassTimeout)
	defer cancel()

	var tally holdTally
	defer func() {
		slog.InfoContext(ctx, "hold reconcile pass done",
			"released", tally.released, "claimed", tally.claimed, "skipped", tally.skipped)
	}()

	// computed once, so every page of the pass reads the same stale set
	createdBefore := time.Now().Add(-reconcileHoldGrace)

	after := ""
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("list stale reserved holds after %q: %w", after, err)
		}
		bidIDs, next, err := uc.wallet.ListStaleReservedHolds(ctx, createdBefore, after)
		if err != nil {
			return fmt.Errorf("list stale reserved holds after %q: %w", after, err)
		}
		if err := uc.reconcilePage(ctx, bidIDs, &tally); err != nil {
			return fmt.Errorf("reconcile stale reserved holds after %q: %w", after, err)
		}

		// wallet answers next only when another page follows
		if next == "" {
			return nil
		}
		if next == after {
			// paging again would ask for this same page forever
			return fmt.Errorf("list stale reserved holds after %q: wallet answered the same position as next, no progress", after)
		}
		after = next
	}
}

// holdTally counts what one pass did, for its one log line.
type holdTally struct {
	released, claimed, skipped int
}

// reconcilePage releases every hold of one page that no bid claims. It stops once
// the pass context has ended, before the next hold or during a call, and answers
// why; a failed lookup or a failed release is logged and only counted. A call cut
// short by the pass ending is not logged as failed, since the pass reports the stop
// once (Req 13).
func (uc *ReconcileHoldsUC) reconcilePage(ctx context.Context, bidIDs []uuid.UUID, tally *holdTally) error {
	if len(bidIDs) == 0 {
		return nil
	}

	claimed, err := uc.bids.BidsHoldingGold(ctx, bidIDs)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		// never release on a failed lookup: not knowing whether the bid exists is
		// not the same as knowing it does not
		slog.ErrorContext(ctx, "check bids failed, page skipped", "holds", len(bidIDs), "error", err)
		tally.skipped += len(bidIDs)
		return nil
	}

	for _, bidID := range bidIDs {
		if err := ctx.Err(); err != nil {
			return err
		}

		if claimed[bidID] {
			tally.claimed++
			continue
		}

		if err := uc.wallet.ReleaseHold(ctx, bidID); err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return ctxErr
			}
			slog.ErrorContext(ctx, "release orphaned hold failed", "bid_id", bidID, "error", err)
			tally.skipped++
			continue // next tick tries again
		}

		tally.released++
		slog.WarnContext(ctx, "reconciled orphaned hold", "bid_id", bidID)
	}

	return nil
}
