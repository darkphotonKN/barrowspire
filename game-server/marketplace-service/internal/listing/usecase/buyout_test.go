package usecase

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testBuyoutPrice = 500

func buyoutListing(t *testing.T) *listing.Listing {
	t.Helper()

	now := time.Now()
	buyout := testBuyoutPrice
	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, &buyout, now, now.Add(time.Hour))
	require.NoError(t, err)

	return l
}

func buyoutCmd(l *listing.Listing, memberID uuid.UUID) BuyoutCommand {
	return BuyoutCommand{ListingID: l.Snapshot().ID, MemberID: memberID, Now: time.Now()}
}

func bidSnapshot(l *listing.Listing, bidID uuid.UUID) (listing.BidSnapshot, bool) {
	for _, b := range l.Snapshot().Bids {
		if b.ID == bidID {
			return b, true
		}
	}
	return listing.BidSnapshot{}, false
}

// The happy path: gold for exactly the buyout price is held against the
// deterministic bid ID, the bid is recorded WINNING, and settlement starts once
// under the BUYOUT trigger.
func TestBuyout_HoldsRecordsAndStartsSettlementOnce(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	wallet, starter := &fakeWallet{}, &fakeStarter{}

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, starter).Handle(context.Background(), buyoutCmd(l, member))

	require.NoError(t, err)
	wantID := BuyoutBidID(member, l.Snapshot().ID)
	assert.Equal(t, 1, wallet.calls)
	assert.Equal(t, wantID, wallet.gotBidID)
	assert.Equal(t, member, wallet.gotMemberID)
	assert.Equal(t, testBuyoutPrice, wallet.gotGold)
	assert.True(t, l.Snapshot().EndsAt.Add(settlementGrace).Equal(wallet.gotExpiresAt), "hold must outlive the listing by the settlement grace")

	bid, ok := bidSnapshot(l, wantID)
	require.True(t, ok, "the buyout bid must be recorded")
	assert.Equal(t, listing.BidStatusWinning, bid.Status)

	assert.Equal(t, 1, starter.calls)
	assert.Equal(t, l.Snapshot().ID, starter.gotListing)
	assert.Equal(t, TriggerBuyout, starter.gotTrigger)
	assert.Zero(t, wallet.releaseCalls)
}

// Refusals the unlocked read can already see cost the buyer nothing: no gold
// is held, nothing is written, nothing starts.
func TestBuyout_RefusedBeforeAnyGoldIsHeld(t *testing.T) {
	tests := []struct {
		name    string
		listing func(t *testing.T) *listing.Listing
		member  func(l *listing.Listing) uuid.UUID
		wantErr error
	}{
		{"seller", buyoutListing, func(l *listing.Listing) uuid.UUID { return l.Snapshot().SellerID }, listing.ErrSellerCannotBuyout},
		{"no buyout price", func(t *testing.T) *listing.Listing { return activeListing(t, 100) }, func(*listing.Listing) uuid.UUID { return uuid.New() }, listing.ErrNoBuyoutPrice},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := tt.listing(t)
			repo, wallet, starter := &fakeRepo{listing: l}, &fakeWallet{}, &fakeStarter{}

			err := NewBuyoutUC(repo, wallet, starter).Handle(context.Background(), buyoutCmd(l, tt.member(l)))

			assert.ErrorIs(t, err, tt.wantErr)
			assert.Zero(t, wallet.calls)
			assert.Zero(t, repo.updateCall)
			assert.Zero(t, starter.calls)
		})
	}
}

// No hold, nothing to give back and nothing to record.
func TestBuyout_HoldRefused_NothingWrittenOrReleased(t *testing.T) {
	l := buyoutListing(t)
	repo, starter := &fakeRepo{listing: l}, &fakeStarter{}
	wallet := &fakeWallet{err: fmt.Errorf("wallet: %w", commonconstants.ErrInsufficientGold)}

	err := NewBuyoutUC(repo, wallet, starter).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, commonconstants.ErrInsufficientGold)
	assert.Zero(t, repo.updateCall)
	assert.Zero(t, wallet.releaseCalls)
	assert.Zero(t, starter.calls)
}

// A retry whose earlier hold was since released (the reconciler swept it after
// a lost write) gets ErrDuplicateResource from wallet. Nothing backs the bid
// any more, so the buyout is refused: recording it would settle a winner whose
// gold is gone. (A still-RESERVED earlier hold comes back from wallet as plain
// success, which the happy path covers.)
func TestBuyout_EarlierHoldSinceReleased_IsRefused(t *testing.T) {
	l := buyoutListing(t)
	repo, starter := &fakeRepo{listing: l}, &fakeStarter{}
	wallet := &fakeWallet{err: fmt.Errorf("wallet: %w", commonconstants.ErrDuplicateResource)}

	err := NewBuyoutUC(repo, wallet, starter).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
	assert.Zero(t, repo.updateCall, "no bid may be recorded without live gold")
	assert.Zero(t, wallet.releaseCalls)
	assert.Zero(t, starter.calls)
	assert.Empty(t, l.Snapshot().Bids)
}

// A buyout that already landed is a replay: success, and the start is asked
// again, which the starter answers as already started.
func TestBuyout_AlreadyRecorded_IsSuccessAndStartsAgain(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	require.NoError(t, l.Buyout(BuyoutBidID(member, l.Snapshot().ID), member, time.Now()))
	require.NoError(t, l.Freeze(time.Now()))
	starter, wallet := &fakeStarter{}, &fakeWallet{}

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, starter).Handle(context.Background(), buyoutCmd(l, member))

	require.NoError(t, err)
	assert.Len(t, l.Snapshot().Bids, 1)
	assert.Zero(t, wallet.calls, "a recorded buyout needs no new hold")
	assert.Zero(t, wallet.releaseCalls)
	assert.Equal(t, 1, starter.calls)
}

// The listing changed between the unlocked read and the lock: the domain's
// definitive refusal means the gold will never back a bid, so it is given back
// at once, on a context the request's cancellation cannot kill.
func TestBuyout_DefinitiveRefusalUnderLock_ReleasesTheHold(t *testing.T) {
	for _, refusal := range []error{
		listing.ErrListingNotAcceptingBids,
		listing.ErrListingExpired,
		listing.ErrSellerCannotBuyout,
		listing.ErrNoBuyoutPrice,
	} {
		t.Run(refusal.Error(), func(t *testing.T) {
			l := buyoutListing(t)
			member := uuid.New()
			wallet, starter := &fakeWallet{}, &fakeStarter{}
			repo := &fakeRepo{listing: l, updateErr: fmt.Errorf("update: %w", refusal)}
			ctx, cancel := context.WithCancel(context.Background())
			cancel()

			err := NewBuyoutUC(repo, wallet, starter).Handle(ctx, buyoutCmd(l, member))

			assert.ErrorIs(t, err, refusal)
			assert.Equal(t, 1, wallet.releaseCalls)
			assert.Equal(t, BuyoutBidID(member, l.Snapshot().ID), wallet.gotReleasedBidID)
			assert.NoError(t, wallet.gotReleaseCtxErr, "the release must not inherit the request's cancellation")
			assert.Zero(t, starter.calls)
		})
	}
}

// Any other failure may have committed after all (an ambiguous COMMIT, a
// timeout). Releasing then could free gold backing a real buyout, so the hold
// is kept and the buyer's retry, a replay, settles it either way.
func TestBuyout_NonDefinitiveFailure_KeepsTheHold(t *testing.T) {
	for _, failure := range []error{
		commonconstants.ErrTransient,
		commonconstants.ErrLockUnavailable,
		errors.New("connection reset"),
	} {
		t.Run(failure.Error(), func(t *testing.T) {
			l := buyoutListing(t)
			wallet, starter := &fakeWallet{}, &fakeStarter{}
			repo := &fakeRepo{listing: l, updateErr: fmt.Errorf("update: %w", failure)}

			err := NewBuyoutUC(repo, wallet, starter).Handle(context.Background(), buyoutCmd(l, uuid.New()))

			assert.ErrorIs(t, err, failure)
			assert.Zero(t, wallet.releaseCalls)
			assert.Zero(t, starter.calls)
		})
	}
}

// The release is retried a bounded number of times, and its failure never
// replaces the refusal the buyer needs to hear.
func TestBuyout_ReleaseRetriesBoundedAndKeepsTheRefusal(t *testing.T) {
	l := buyoutListing(t)
	wallet := &fakeWallet{releaseErr: errors.New("wallet down")}
	repo := &fakeRepo{listing: l, updateErr: listing.ErrListingNotAcceptingBids}

	err := NewBuyoutUC(repo, wallet, &fakeStarter{}).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, listing.ErrListingNotAcceptingBids)
	assert.Equal(t, releaseAttempts, wallet.releaseCalls)
}

// The buyout committed; only the start failed. The bid stays and so does the
// gold; the buyer's retry is a replay that starts settlement.
func TestBuyout_StartFails_BuyoutStaysRecorded(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	wallet := &fakeWallet{}
	starter := &fakeStarter{err: errors.New("temporal down")}

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, starter).Handle(context.Background(), buyoutCmd(l, member))

	assert.Error(t, err)
	_, ok := bidSnapshot(l, BuyoutBidID(member, l.Snapshot().ID))
	assert.True(t, ok)
	assert.Zero(t, wallet.releaseCalls)
}

// One member buying one listing always gets the same bid ID, so every retry
// lands on the same hold and the same bid.
func TestBuyoutBidID_IsDeterministicPerMemberAndListing(t *testing.T) {
	member, listingID := uuid.New(), uuid.New()

	assert.Equal(t, BuyoutBidID(member, listingID), BuyoutBidID(member, listingID))
	assert.NotEqual(t, BuyoutBidID(member, listingID), BuyoutBidID(uuid.New(), listingID))
	assert.NotEqual(t, BuyoutBidID(member, listingID), BuyoutBidID(member, uuid.New()))
	assert.Equal(t, uuid.Version(5), BuyoutBidID(member, listingID).Version())
}

// Refused by the unlocked read, before any hold: nothing is released, even
// though an earlier ambiguous attempt may have kept one. The read is unlocked,
// so that attempt could still be committing a funded buyout; freeing its gold
// here would leave a winning bid unbacked. The reconciler owns a hold that
// truly backs nothing.
func TestBuyout_RefusedBeforeHold_NeverReleases(t *testing.T) {
	l := buyoutListing(t)
	require.NoError(t, l.Buyout(uuid.New(), uuid.New(), time.Now()))
	wallet := &fakeWallet{}

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, &fakeStarter{}).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, listing.ErrListingNotAcceptingBids)
	assert.Zero(t, wallet.calls)
	assert.Zero(t, wallet.releaseCalls)
}
