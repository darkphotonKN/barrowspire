package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

type WalletService interface {
	PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error
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

	// NOT an OCC loop, despite the name: Update writes under a row lock with no
	// version predicate, so ErrConcurrentModification cannot come back from it.
	// What this retries is the other half of IsRetriable — ErrTransient, meaning a
	// deadlock or a connection blip, which FOR UPDATE makes possible and which the
	// buyer should not have to re-bid over.
	//
	// A lock_timeout is deliberately NOT retried here: it arrives as
	// ErrLockUnavailable, which IsRetriable does not match, so contention fails
	// fast instead of rejoining the queue. That is the whole point of taking a row
	// lock rather than an optimistic one.
	err = withRetry(ctx, func() error {
		return uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
			if err := l.PlaceBidWithID(bidID, cmd.MemberID, cmd.Amount, cmd.IdempotencyKey, cmd.Now); err != nil {
				return err
			}

			if !l.HasBid(bidID) {
				return nil
			}

			return l.ConfirmBid(bidID, cmd.Now)
		})
	})
	if err != nil {
		return fmt.Errorf("place bid usecase handle recording bid %v, hold is stranded : %w", bidID, err)
	}

	return nil
}
