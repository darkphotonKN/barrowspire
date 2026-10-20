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

// errBuyoutAlreadyRecorded is why a hold is released when the buyer's own
// buyout, under another ID, was already on the listing. Logged, never returned:
// the buyout succeeded.
var errBuyoutAlreadyRecorded = errors.New("buyer's buyout already recorded under another bid ID")

// buyoutBidNamespace scopes BuyoutBidID. Fixed forever: changing it would give
// a resend a different bid ID than its first attempt, and a second hold. Not the
// namespace ADR-0025 used, whose IDs carried no key.
var buyoutBidNamespace = uuid.MustParse("9fc9a2e4-2e6e-4606-a9a8-20f7e95b8830")

// BuyoutBidID is the bid a keyed buyout is recorded and held under, so a resend
// of the same intent finds the hold and the bid its first attempt made instead
// of making new ones (ADR-0026). The key, not the buyer and listing alone, is
// what makes it one intent: a buyer whose earlier attempt was abandoned and its
// hold released needs a fresh ID to try again, and gets one with a new key.
func BuyoutBidID(memberID, listingID, idempotencyKey uuid.UUID) uuid.UUID {
	return uuid.NewSHA1(buyoutBidNamespace,
		[]byte(memberID.String()+":"+listingID.String()+":"+idempotencyKey.String()))
}

// BuyoutUC is the Buyout settlement trigger (FS-NXP1W §Req 4): a member buys
// the listing outright at its buyout price, then settlement starts the same way
// it does for AcceptBid and expiry.
//
// Unlike AcceptBid it writes before it starts. The buyout has to fix the
// winner under the row lock, or a bid confirming between the start and 0a's
// freeze could take the lead from the buyer who paid the buyout price.
type BuyoutUC struct {
	repo              listing.Repository
	wallet            WalletService
	settlementStarter SettlementStarter
	holdRelease       HoldReleaseStarter
}

func NewBuyoutUC(repo listing.Repository, wallet WalletService, settlementStarter SettlementStarter, holdRelease HoldReleaseStarter) *BuyoutUC {
	return &BuyoutUC{
		repo:              repo,
		wallet:            wallet,
		settlementStarter: settlementStarter,
		holdRelease:       holdRelease,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
//
// Amount is what the buyer agreed to pay, checked against the buyout price. It
// never prices the hold: a buyout always costs the listing's buyout price.
type BuyoutCommand struct {
	ListingID      uuid.UUID
	MemberID       uuid.UUID
	Amount         int
	IdempotencyKey uuid.UUID
	Now            time.Time
}

func (uc *BuyoutUC) Handle(ctx context.Context, cmd BuyoutCommand) error {
	// read-only, outside the lock: to price the hold and set when it lapses, and
	// to refuse a buyout that certainly cannot land before any gold is held for
	// it. Advisory — Buyout decides again under the lock.
	current, err := uc.repo.FindByID(ctx, cmd.ListingID)
	if err != nil {
		return fmt.Errorf("buyout usecase reading listing %v : %w", cmd.ListingID, err)
	}

	// without a key a resend cannot be told from a new intent by its ID, only by
	// the buyer's own buyout on the listing below
	bidID := uuid.New()
	if cmd.IdempotencyKey != uuid.Nil {
		bidID = BuyoutBidID(cmd.MemberID, cmd.ListingID, cmd.IdempotencyKey)
	}

	// A buyout that already landed is a replay, whatever the listing looks like
	// now: its own settlement may have frozen it. Skip straight to the start. The
	// buyer's own buyout counts whatever its ID, so a resend that lost its key, or
	// had none, holds no gold either (ADR-0026).
	if !current.HasBid(bidID) && !current.HasBuyoutBy(cmd.MemberID) {
		if err := uc.holdAndRecord(ctx, current, bidID, cmd); err != nil {
			return err
		}
	}

	// After the commit, never before: a settlement started for a buyout that was
	// then refused would settle the incumbent instead. Already started is
	// success (the starter's contract), so a replay lands here harmlessly. If
	// this fails, the buyout stays recorded with its gold held; the buyer's retry
	// replays into this start, and the expiry poller is the backstop.
	if err := uc.settlementStarter.StartSettlement(ctx, cmd.ListingID, TriggerBuyout); err != nil {
		return fmt.Errorf("buyout usecase starting settlement listing %v : %w", cmd.ListingID, err)
	}

	return nil
}

// holdAndRecord holds the buyout price against bidID and records the buyout. The
// gold goes back only once the write provably did not land; an ambiguous write is
// retried first, and one still unknown is left to the reconciler.
func (uc *BuyoutUC) holdAndRecord(ctx context.Context, current *listing.Listing, bidID uuid.UUID, cmd BuyoutCommand) error {
	if err := current.CanBuyout(cmd.MemberID, cmd.Amount, cmd.Now); err != nil {
		return fmt.Errorf("buyout usecase listing %v : %w", cmd.ListingID, err)
	}
	// CanBuyout has just refused a listing without one, so the price is set
	snapshot := current.Snapshot()
	price := *snapshot.BuyoutPrice
	expiresAt := snapshot.EndsAt.Add(settlementGrace)

	// wallet treats the bid ID as an idempotency key: an earlier attempt's hold
	// that is still RESERVED comes back as success, so a retry carries on with
	// it. A hold under this ID that was since released (by the reconciler, after
	// a lost write) comes back as ErrDuplicateResource and refuses the buyout —
	// carrying on would record a winning bid with no gold behind it.
	if err := uc.wallet.PlaceHold(ctx, cmd.MemberID, bidID, price, expiresAt); err != nil {
		return fmt.Errorf("buyout usecase placing hold for bid %v : %w", bidID, err)
	}

	// Set inside the closure, and reset on every attempt: whether this call's bid
	// is on the listing. The buyer's own buyout under another ID is a replay that
	// writes nothing, and the gold just held for this ID then backs no bid.
	var recorded bool
	write := func(ctx context.Context) error {
		recorded = false
		return uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
			if err := l.Buyout(bidID, cmd.MemberID, cmd.Amount, cmd.Now); err != nil {
				return err
			}
			recorded = l.HasBid(bidID)
			return nil
		})
	}

	// TCC, as in PlaceBid: the hold is the Try, this write the Confirm, the release
	// the Cancel, which runs only once the write provably did not land. An error
	// that is neither a definitive refusal nor a failure before the read may be an
	// ambiguous COMMIT, so the write is retried rather than compensated. Retrying
	// is safe because a retry finding this bid, or the buyer's own buyout, under
	// the lock is a replay.
	err := write(ctx)
	if err != nil && !isDefinitiveBuyoutRefusal(err) && !failedBeforeRead(err) {
		// On the request's values but not its cancellation: a cancelled request is
		// among the likeliest causes of an ambiguous COMMIT.
		retryCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeRetryDeadline)
		defer cancel()

		// Only a definitive refusal settles a retry. Failing before the read proves
		// this attempt wrote nothing, and says nothing about the one before it.
		err = withBackoff(retryCtx, maxWriteAttempts-1, writeRetryBackoff,
			func(err error) bool { return !isDefinitiveBuyoutRefusal(err) },
			write)

		if err != nil && !isDefinitiveBuyoutRefusal(err) {
			// Still unknown. Releasing could pull the gold out from under a buyout
			// that did land, so it is left to the reconciler, which releases only what
			// no recorded bid claims. Transient to the caller: resending with the same
			// key is safe, and settles it.
			slog.ErrorContext(ctx, "buyout write outcome unknown after retries, hold left for the reconciler",
				"bid_id", bidID, "listing_id", cmd.ListingID, "err", err)

			return fmt.Errorf("buyout usecase recording bid %v : %w: %w", bidID, commonconstants.ErrTransient, err)
		}
	}

	// Nothing written, but not proof the ID is spent: a keyed buyout's busy listing.
	// The hold waits for the same key's retry, or else the reconciler.
	if err != nil && failedBeforeRead(err) && !releasableBeforeRead(err, cmd.IdempotencyKey != uuid.Nil) {
		return fmt.Errorf("buyout usecase recording bid %v : %w", bidID, err)
	}

	if err != nil {
		// a definitive refusal, or nothing read on the first attempt in a way that
		// spends the ID: this gold will never back a bid
		uc.releaseHold(ctx, bidID, cmd.ListingID, err)
		return fmt.Errorf("buyout usecase recording bid %v : %w", bidID, err)
	}

	if !recorded {
		uc.releaseHold(ctx, bidID, cmd.ListingID, errBuyoutAlreadyRecorded)
	}

	return nil
}

// releaseHold starts giving back gold held for a buyout that backs no bid: the
// listing refused it, or the buyer's buyout was already there under another ID. The run
// retries the release until it lands, so this only starts it, once. Detached from
// the request's cancellation for the same reason PlaceBid's compensation is: a
// dropped request must not strand the gold.
func (uc *BuyoutUC) releaseHold(ctx context.Context, bidID, listingID uuid.UUID, cause error) {
	startCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), compensationTimeout)
	defer cancel()

	if err := uc.holdRelease.StartReleaseHold(startCtx, listingID, bidID); err != nil {
		// deliberately not returned: the buyer needs to hear how the buyout went,
		// not how the cleanup did
		slog.ErrorContext(ctx, "buyout hold backs no bid and starting its release failed, hold is stranded until reconciled",
			"bid_id", bidID, "listing_id", listingID, "release_err", err, "cause", cause)
	}
}

// isDefinitiveBuyoutRefusal reports whether the listing refused the buyout for
// a reason no retry can change, so its gold will never back a bid.
func isDefinitiveBuyoutRefusal(err error) bool {
	return errors.Is(err, listing.ErrListingNotAcceptingBids) ||
		errors.Is(err, listing.ErrListingExpired) ||
		errors.Is(err, listing.ErrSellerCannotBuyout) ||
		errors.Is(err, listing.ErrNoBuyoutPrice) ||
		errors.Is(err, listing.ErrBuyoutAmountMismatch)
}
