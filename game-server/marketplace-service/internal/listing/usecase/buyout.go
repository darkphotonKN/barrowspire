package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
)

// buyoutBidNamespace scopes BuyoutBidID. Fixed forever: changing it would give
// a retry a different bid ID than its first attempt, and a second hold.
var buyoutBidNamespace = uuid.MustParse("d3f7b4f4-0d3e-438a-820b-58aa5b87c594")

// releaseAttempts bounds the inline release after a definitive refusal. A
// handful of tries inside compensationTimeout; whatever still fails is left to
// the hold reconciler.
const releaseAttempts = 3

// BuyoutBidID is the bid a member's buyout of a listing is recorded and held
// under. Deterministic, so a retry finds the hold and the bid its first attempt
// made instead of making new ones. A member can buy a given listing out once,
// which is all a listing allows anyway.
func BuyoutBidID(memberID, listingID uuid.UUID) uuid.UUID {
	return uuid.NewSHA1(buyoutBidNamespace, []byte(memberID.String()+":"+listingID.String()))
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
}

func NewBuyoutUC(repo listing.Repository, wallet WalletService, settlementStarter SettlementStarter) *BuyoutUC {
	return &BuyoutUC{
		repo:              repo,
		wallet:            wallet,
		settlementStarter: settlementStarter,
	}
}

// NOTE: named {Action}{Resource}Command because its an INBOUND application WRITE intent
//
// No amount: a buyout always costs the listing's buyout price.
type BuyoutCommand struct {
	ListingID uuid.UUID
	MemberID  uuid.UUID
	Now       time.Time
}

func (uc *BuyoutUC) Handle(ctx context.Context, cmd BuyoutCommand) error {
	// read-only, outside the lock: to price the hold and set when it lapses, and
	// to refuse a buyout that certainly cannot land before any gold is held for
	// it. Advisory — Buyout decides again under the lock.
	current, err := uc.repo.FindByID(ctx, cmd.ListingID)
	if err != nil {
		return fmt.Errorf("buyout usecase reading listing %v : %w", cmd.ListingID, err)
	}

	bidID := BuyoutBidID(cmd.MemberID, cmd.ListingID)

	// A buyout that already landed is a replay, whatever the listing looks like
	// now: its own settlement may have frozen it. Skip straight to the start.
	if !current.HasBid(bidID) {
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

// holdAndRecord holds the buyout price against bidID and records the buyout,
// giving the gold back when the listing definitively refused it.
func (uc *BuyoutUC) holdAndRecord(ctx context.Context, current *listing.Listing, bidID uuid.UUID, cmd BuyoutCommand) error {
	if err := current.CanBuyout(cmd.MemberID, cmd.Now); err != nil {
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

	err := uc.repo.Update(ctx, cmd.ListingID, func(l *listing.Listing) error {
		return l.Buyout(bidID, cmd.MemberID, cmd.Now)
	})
	if err == nil {
		return nil
	}

	// Only a definitive refusal frees the gold. Anything else — a timeout, an
	// ambiguous COMMIT — may have recorded the buyout after all, and releasing
	// would leave a winning bid with no gold behind it. That hold is kept; the
	// buyer's retry replays onto it, and the reconciler sweeps it if they never do.
	if isDefinitiveBuyoutRefusal(err) {
		uc.releaseHold(ctx, bidID, cmd.ListingID, err)
	}

	return fmt.Errorf("buyout usecase recording bid %v : %w", bidID, err)
}

// releaseHold gives back the gold of a buyout the listing refused, retrying a
// few times. Detached from the request's cancellation for the same reason
// PlaceBid's compensation is: a dropped request must not strand the gold.
func (uc *BuyoutUC) releaseHold(ctx context.Context, bidID, listingID uuid.UUID, refusal error) {
	releaseCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), compensationTimeout)
	defer cancel()

	var releaseErr error
retry:
	for attempt := 1; attempt <= releaseAttempts; attempt++ {
		if releaseErr = uc.wallet.ReleaseHold(releaseCtx, bidID); releaseErr == nil {
			return
		}
		if attempt == releaseAttempts {
			break
		}

		select {
		case <-releaseCtx.Done():
			break retry
		case <-time.After(time.Duration(attempt) * 50 * time.Millisecond):
		}
	}

	// deliberately not returned: the buyer needs to hear why the buyout failed,
	// not why the cleanup did
	slog.ErrorContext(ctx, "buyout refused and releasing its hold failed, hold is stranded until reconciled",
		"bid_id", bidID, "listing_id", listingID, "release_err", releaseErr, "err", refusal)
}

// isDefinitiveBuyoutRefusal reports whether the listing refused the buyout for
// a reason no retry can change, so its gold will never back a bid.
func isDefinitiveBuyoutRefusal(err error) bool {
	return errors.Is(err, listing.ErrListingNotAcceptingBids) ||
		errors.Is(err, listing.ErrListingExpired) ||
		errors.Is(err, listing.ErrSellerCannotBuyout) ||
		errors.Is(err, listing.ErrNoBuyoutPrice)
}
