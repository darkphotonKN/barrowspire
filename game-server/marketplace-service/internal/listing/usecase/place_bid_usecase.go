package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// WalletService is what the bid use cases ask of wallet directly. Giving a hold back
// is not here: it goes through HoldReleaseStarter, so it survives the request.
type WalletService interface {
	PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error
}

// compensationTimeout bounds starting the release that follows a failed bid write.
// Short, because a bidder may still be waiting for the response: a healthy start is
// milliseconds, and a start that cannot happen in this long is better left to the
// reconciler than spent holding the reply.
const compensationTimeout = 5 * time.Second

// settlementGrace is how long a hold outlives its listing. It must comfortably
// exceed settlement's retry cap (FS-NXP1W §Req 11: 30m), or the hold sweeper can
// release a hold settlement is still retrying towards committing. Tuning, not
// contract.
const settlementGrace = 2 * time.Hour

// placeBidNamespace scopes PlaceBidID. Fixed forever: changing it would give a
// resend a different bid ID than its first attempt, and a second hold.
var placeBidNamespace = uuid.MustParse("6d839f37-cbdd-4121-b253-5d1479a9850f")

// PlaceBidID is the bid a keyed bid is recorded and held under, so a resend of
// the same bid finds the hold and the bid its first attempt made instead of
// holding gold again (ADR-0027, the scheme ADR-0026 gave buyout). Member and
// listing are part of it so a key reused by another member, or on another
// listing, is another bid.
func PlaceBidID(memberID, listingID, idempotencyKey uuid.UUID) uuid.UUID {
	return uuid.NewSHA1(placeBidNamespace,
		[]byte(memberID.String()+":"+listingID.String()+":"+idempotencyKey.String()))
}

type PlaceBidUC struct {
	repo        listing.Repository
	wallet      WalletService
	holdRelease HoldReleaseStarter
}

func NewPlaceBidUC(repo listing.Repository, wallet WalletService, holdRelease HoldReleaseStarter) *PlaceBidUC {
	return &PlaceBidUC{
		repo:        repo,
		wallet:      wallet,
		holdRelease: holdRelease,
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

	// Without a key there is no deduplication: every request is a new bid.
	bidID := uuid.New()
	if cmd.IdempotencyKey != uuid.Nil {
		bidID = PlaceBidID(cmd.MemberID, cmd.ListingID, cmd.IdempotencyKey)
	}

	// A resend whose bid already landed holds nothing. Advisory, like the read it
	// comes from: a resend racing its own first attempt holds under the same ID,
	// which wallet answers as the hold it already has, and the write below finds
	// the bid under the lock.
	if current.HasBid(bidID) {
		return nil
	}

	if err := uc.wallet.PlaceHold(ctx, cmd.MemberID, bidID, cmd.Amount, expiresAt); err != nil {
		return fmt.Errorf("place bid usecase handle placing hold for bid %v : %w", bidID, err)
	}

	// Set inside the closure: whether this request's bid is on the listing. A
	// deduplicated replay writes nothing and returns nil, and its hold still has
	// to go back.
	var recorded bool
	write := func(ctx context.Context) error {
		recorded = false
		return uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
			// a retry finding the bid means the earlier attempt's COMMIT landed after all
			if l.HasBid(bidID) {
				recorded = true
				return nil
			}

			if err := l.PlaceBidWithID(bidID, cmd.MemberID, cmd.Amount, cmd.IdempotencyKey, cmd.Now); err != nil {
				return err
			}

			// deduplicated on the idempotency key: the original placement stands
			if !l.HasBid(bidID) {
				return nil
			}

			recorded = true
			return l.ConfirmBid(bidID, cmd.Now)
		})
	}

	// TCC: the hold is the Try, this write the Confirm, ReleaseHold the Cancel. Cancel
	// only once the write provably did not land. Only a COMMIT can fail ambiguously;
	// any error that is neither a rejection nor a failure before the read might be
	// one, so the write is retried rather than compensated.
	err = write(ctx)
	if err != nil && !bidRejected(err) && !failedBeforeRead(err) {
		// Retrying is safe because the write is idempotent on bidID, and decisive
		// because its SELECT ... FOR UPDATE queues behind a COMMIT still in flight.
		// On the request's values but not its cancellation: a cancelled request is
		// among the likeliest causes of an ambiguous COMMIT, and retrying on it would
		// fail at once.
		retryCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeRetryDeadline)
		defer cancel()

		// Only a rejection settles a retry. Failing before the read proves this
		// attempt wrote nothing, and says nothing about the one before it.
		err = withBackoff(retryCtx, maxWriteAttempts-1, writeRetryBackoff,
			func(err error) bool { return !bidRejected(err) },
			write)

		if err != nil && !bidRejected(err) {
			// Still unknown. Releasing could pull the gold out from under a bid that did
			// land, so it is left to the reconciler, which releases only what no recorded
			// bid claims. Transient to the caller: re-sending with the same idempotency
			// key is safe, and settles it.
			slog.ErrorContext(ctx, "bid write outcome unknown after retries, hold left for the reconciler",
				"bid_id", bidID, "listing_id", cmd.ListingID, "err", err)

			return fmt.Errorf("place bid usecase handle recording bid %v : %w: %w", bidID, commonconstants.ErrTransient, err)
		}
	}

	if err != nil || !recorded {
		// The gold is frozen behind a bid that does not exist, and no settlement step
		// will ever free it: settlement works from the listing's bids, and this one is
		// not among them. So the use case that reserved it gives it back.
		uc.releaseHold(ctx, bidID, cmd.ListingID, err)
	}

	if err != nil {
		return fmt.Errorf("place bid usecase handle recording bid %v : %w", bidID, err)
	}

	return nil
}

const (
	// maxWriteAttempts bounds how hard an ambiguous write is chased before handing
	// it to the reconciler. Each attempt can wait out the 3s lock_timeout, so this
	// stays small: the bidder is waiting.
	maxWriteAttempts   = 3
	writeRetryBackoff  = 25 * time.Millisecond
	writeRetryDeadline = 10 * time.Second
)

// bidRejected reports a failure that proves the write rolled back after reading the
// locked row: the domain refused the bid, or the database refused a statement. On
// a retry that also proves the earlier attempt never landed, since the retry would
// have found the bid instead.
//
// Every error the bid closure can return must be listed. One that is missed is
// treated as unknown: retried, then reported as transient — safe for the gold, but
// the bidder gets a 503 instead of the refusal.
func bidRejected(err error) bool {
	for _, rejection := range []error{
		listing.ErrBidTooLow,
		listing.ErrBidAtOrAboveBuyout,
		listing.ErrListingExpired,
		listing.ErrListingNotAcceptingBids,
		listing.ErrInvalidAmount,
		listing.ErrInvalidUUID,
		listing.ErrBidNotFound,
		listing.ErrInvalidBidTransition,
		commonconstants.ErrConstraintViolation,
		commonconstants.ErrDuplicateResource,
	} {
		if errors.Is(err, rejection) {
			return true
		}
	}
	return false
}

// failedBeforeRead reports errors Update returns before it has read the listing:
// nothing was written, because nothing could have been. Proof only on the first
// attempt.
func failedBeforeRead(err error) bool {
	return errors.Is(err, commonconstants.ErrLockUnavailable) ||
		errors.Is(err, commonconstants.ErrNotFound) ||
		errors.Is(err, listing.ErrCorruptListingState)
}

// releaseHold is the TCC cancel: it gives back gold reserved for a bid that is proven
// not to exist.
//
// It only starts the release. The run retries the release itself until it lands, so
// nothing here waits on wallet or retries it; the bidder hears about their bid, not
// about the cleanup. Asked once — the Temporal client already retries its own
// transient failures — and a start that still fails is left to the reconciler, which
// compares wallet's stale reservations against the bids actually recorded.
//
// The start outlives the request that triggered it. A cancelled context is one of the
// likeliest reasons the write failed, and starting on that same context would send
// the start already dead.
func (uc *PlaceBidUC) releaseHold(ctx context.Context, bidID, listingID uuid.UUID, cause error) {
	startCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), compensationTimeout)
	defer cancel()

	if err := uc.holdRelease.StartReleaseHold(startCtx, listingID, bidID); err != nil {
		// deliberately not returned: the bidder needs to hear why their bid failed,
		// not why the cleanup did
		slog.ErrorContext(ctx, "bid not recorded and starting its hold release failed, hold is stranded until reconciled",
			"bid_id", bidID, "listing_id", listingID, "release_err", err, "err", cause)
	}
}
