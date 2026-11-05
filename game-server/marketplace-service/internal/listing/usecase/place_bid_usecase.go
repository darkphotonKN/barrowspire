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
// is not here: it goes through HoldReleaseAwaiter, so it survives the request.
type WalletService interface {
	PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error
}

// compensationTimeout bounds starting the release that follows a failed bid write.
// Short, because a bidder may still be waiting for the response: a healthy start is
// milliseconds, and a start that cannot happen in this long is better left to the
// reconciler than spent holding the reply.
const compensationTimeout = 5 * time.Second

// releaseWait bounds how long a refused bid waits for its hold to be back before
// answering (ADR-0049). A healthy release is tens of milliseconds, so this only
// runs out while wallet is struggling, and then the release carries on alone.
// It must stay well under every timeout between the bidder and here: a reply that
// times out upstream is retried by the client under the same key, the very resend
// this wait exists to fence off. Inside compensationTimeout, which bounds the start
// and the wait together. Tuning, not contract.
const releaseWait = 3 * time.Second

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
	holdRelease HoldReleaseAwaiter
}

func NewPlaceBidUC(repo listing.Repository, wallet WalletService, holdRelease HoldReleaseAwaiter) *PlaceBidUC {
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
	if err := current.CanPlaceBid(cmd.MemberID, cmd.Now); err != nil {
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

	// After the replay shortcut, so a resend of a bid recorded before the member
	// reached the cap is still its replay. Advisory too: PlaceBidWithID applies the
	// cap again under the lock (ADR-0052).
	if err := current.WithinBidWithdrawalCap(cmd.MemberID); err != nil {
		return fmt.Errorf("place bid usecase handle listing %v : %w", cmd.ListingID, err)
	}

	// After the replay shortcut and the cap, as PlaceBidWithID orders them, so a
	// leader's bid holds no gold. Advisory too: PlaceBidWithID decides it again
	// under the lock (ADR-0054, FS-72KT8 Req 6). Not asked of a resend whose key
	// is already on the listing under another ID (a bid recorded before IDs were
	// derived, ADR-0027): under the lock its key replay answers before the leading
	// check, so refusing it here would turn a replay into a refusal.
	//
	// The price rules last, as PlaceBidWithID orders them, under the same guard: a
	// legacy resend of a bid outbid since is still its replay. So a bid the read
	// already prices out holds no gold, writes no hold row and starts no release.
	// Advisory like the rest: a bid that lands between this read and the lock is
	// caught there, and the hold goes back (ADR-0049).
	if !current.HasBidByKey(cmd.MemberID, cmd.IdempotencyKey) {
		if err := current.NotLeading(cmd.MemberID); err != nil {
			return fmt.Errorf("place bid usecase handle listing %v : %w", cmd.ListingID, err)
		}
		if err := current.AcceptsBidAmount(cmd.Amount); err != nil {
			return fmt.Errorf("place bid usecase handle listing %v : %w", cmd.ListingID, err)
		}
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

	// Nothing written, but not proof the ID is spent: a keyed bid's busy listing.
	// The hold waits for the same key's retry, or else the reconciler.
	if err != nil && failedBeforeRead(err) && !releasableBeforeRead(err, cmd.IdempotencyKey != uuid.Nil) {
		return fmt.Errorf("place bid usecase handle recording bid %v : %w", bidID, err)
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
		listing.ErrSellerCannotBid,
		listing.ErrListingExpired,
		listing.ErrListingNotAcceptingBids,
		listing.ErrInvalidAmount,
		listing.ErrInvalidUUID,
		listing.ErrBidNotFound,
		listing.ErrInvalidBidTransition,
		listing.ErrBidWithdrawLimitReached,
		listing.ErrAlreadyLeading, // FS-72KT8 Req 5
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

// releasableBeforeRead reports a failure before the read that also proves this
// bid ID can never land, so its hold may go back at once. Every failedBeforeRead
// error proves the first attempt wrote nothing, but a lock timeout only means the
// listing was busy: the caller is told to retry, and a keyed caller retries under
// the same derived ID, onto this same hold. Releasing it would race that retry,
// and a release landing after the retried bid leaves a winning bid with no gold
// (ADR-0027). A random ID is never retried under, so for it the hold may go back.
func releasableBeforeRead(err error, keyed bool) bool {
	if !failedBeforeRead(err) {
		return false
	}
	return !keyed || !errors.Is(err, commonconstants.ErrLockUnavailable)
}

// releaseHold is the TCC cancel: it gives back gold reserved for a bid that is proven
// not to exist.
//
// It starts the release and waits up to releaseWait for the gold to be back before
// the bidder hears anything (ADR-0049). Answering first would let a resend under the
// same key find the hold still RESERVED, take it as its own, and be recorded, and the
// release landing after it would leave a leading bid with no gold behind it. The
// run retries the release itself until it lands, so nothing here retries it, and a
// wait that runs out leaves the run going. Asked once — the Temporal client already
// retries its own transient failures — and a start that still fails is left to the
// reconciler, which compares wallet's stale reservations against the bids actually
// recorded.
//
// The release outlives the request that triggered it. A cancelled context is one of
// the likeliest reasons the write failed, and starting on that same context would
// send the start already dead.
func (uc *PlaceBidUC) releaseHold(ctx context.Context, bidID, listingID uuid.UUID, cause error) {
	releaseCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), compensationTimeout)
	defer cancel()

	// deliberately not returned: the bidder needs to hear why their bid failed, not
	// how the cleanup went
	err := uc.holdRelease.ReleaseHoldAndWait(releaseCtx, listingID, bidID, releaseWait)
	switch {
	case err == nil:
	case errors.Is(err, ErrHoldReleasePending):
		slog.WarnContext(ctx, "bid not recorded and its hold release outlasted the wait, answering while it continues",
			"bid_id", bidID, "listing_id", listingID, "release_err", err, "err", cause)
	default:
		slog.ErrorContext(ctx, "bid not recorded and its hold release did not start or failed, hold is stranded until reconciled",
			"bid_id", bidID, "listing_id", listingID, "release_err", err, "err", cause)
	}
}
