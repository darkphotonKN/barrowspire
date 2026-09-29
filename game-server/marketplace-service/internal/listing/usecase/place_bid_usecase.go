package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

type WalletService interface {
	PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error
	// ReleaseHold compensates a PlaceHold whose bid never got recorded. Idempotent,
	// and a bid that never had a hold is nothing to give back rather than an error,
	// so the caller may call it without knowing whether the hold landed.
	ReleaseHold(ctx context.Context, bidID uuid.UUID) error
}

// settlementGrace is how long a hold outlives its listing. It must comfortably
// exceed settlement's retry cap (FS-NXP1W §Req 11: 30m), or the hold sweeper can
// release a hold settlement is still retrying towards committing. Tuning, not
// contract.
const settlementGrace = 2 * time.Hour

type PlaceBidUC struct {
	repo   listing.Repository
	wallet WalletService
}

func NewPlaceBidUC(repo listing.Repository, wallet WalletService) *PlaceBidUC {
	return &PlaceBidUC{
		repo:   repo,
		wallet: wallet,
	}
}

type PlaceBidCommand struct {
	ListingID      uuid.UUID
	MemberID       uuid.UUID
	Amount         int
	IdempotencyKey uuid.UUID
	Now            time.Time
}

func (uc *PlaceBidUC) Handle(ctx context.Context, cmd PlaceBidCommand) error {
	// read-only, outside the lock: to set when the hold lapses, and to refuse a
	// bid that certainly cannot land before any gold is held for it. Advisory
	// only — the listing can change before the lock is taken, so the bidding rules
	// are still decided under Update below.
	current, err := uc.repo.FindByID(ctx, cmd.ListingID)
	if err != nil {
		return fmt.Errorf("place bid usecase handle reading listing %v : %w", cmd.ListingID, err)
	}
	if err := current.AcceptsBidAt(cmd.Now); err != nil {
		return fmt.Errorf("place bid usecase handle listing %v : %w", cmd.ListingID, err)
	}
	expiresAt := current.Snapshot().EndsAt.Add(settlementGrace)

	bidID := uuid.New()
	if err := uc.wallet.PlaceHold(ctx, cmd.MemberID, bidID, cmd.Amount, expiresAt); err != nil {
		return fmt.Errorf("place bid usecase handle placing hold for bid %v : %w", bidID, err)
	}

	// So every failure is final for this request, including a lock_timeout, which
	// arrives as ErrLockUnavailable and becomes a 409 telling the bidder the listing
	// is busy. The bidder pressing the button again is the retry, with a human as the
	// backoff — and the hold released below means that costs them nothing.
	err = uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
		if err := l.PlaceBidWithID(bidID, cmd.MemberID, cmd.Amount, cmd.IdempotencyKey, cmd.Now); err != nil {
			return err
		}

		if !l.HasBid(bidID) {
			return nil
		}

		return l.ConfirmBid(bidID, cmd.Now)
	})
	if err != nil {
		// The gold is frozen behind a bid that does not exist, and no settlement step
		// will ever free it: settlement works from the listing's bids, and this one is
		// not among them. So the use case that reserved it gives it back.
		//
		// Best effort, one attempt. This runs while a bidder waits for a response, so
		// it must not turn one failure into a slow one — the reconciler sweeps up
		// whatever this misses, comparing wallet's stale reservations against the bids
		// actually recorded.
		//
		// Known window: if Update's COMMIT itself failed ambiguously, the bid may have
		// landed after all and this releases gold that is backing a real bid. Closing
		// it would need the bid and the hold to commit together, which is not available
		// across two services.
		if releaseErr := uc.wallet.ReleaseHold(ctx, bidID); releaseErr != nil {
			// deliberately not returned: the bidder needs to hear why their bid failed,
			// not why the cleanup did
			slog.ErrorContext(ctx, "bid write failed and releasing its hold failed too, hold is stranded until reconciled",
				"bid_id", bidID, "listing_id", cmd.ListingID, "release_err", releaseErr, "err", err)
		}

		return fmt.Errorf("place bid usecase handle recording bid %v : %w", bidID, err)
	}

	return nil
}
