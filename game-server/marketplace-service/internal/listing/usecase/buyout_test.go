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

// testBuyoutKey is the key buyoutCmd sends unless a test overrides it.
var testBuyoutKey = uuid.MustParse("6a1f2c3d-0000-4000-8000-000000000001")

func buyoutListing(t *testing.T) *listing.Listing {
	t.Helper()

	now := time.Now()
	buyout := testBuyoutPrice
	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, &buyout, now, now.Add(time.Hour))
	require.NoError(t, err)

	return l
}

func buyoutCmd(l *listing.Listing, memberID uuid.UUID) BuyoutCommand {
	return BuyoutCommand{ListingID: l.Snapshot().ID, MemberID: memberID, Amount: testBuyoutPrice, IdempotencyKey: testBuyoutKey, Now: time.Now()}
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
	wallet, starter, release := &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, starter, release).Handle(context.Background(), buyoutCmd(l, member))

	require.NoError(t, err)
	wantID := BuyoutBidID(member, l.Snapshot().ID, testBuyoutKey)
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
	assert.Zero(t, release.calls)
}

// Refusals the unlocked read can already see cost the buyer nothing: no gold
// is held, nothing is written, nothing starts.
func TestBuyout_RefusedBeforeAnyGoldIsHeld(t *testing.T) {
	tests := []struct {
		name    string
		listing func(t *testing.T) *listing.Listing
		member  func(l *listing.Listing) uuid.UUID
		amount  int // zero means the buyout price
		wantErr error
	}{
		{"seller", buyoutListing, func(l *listing.Listing) uuid.UUID { return l.Snapshot().SellerID }, 0, listing.ErrSellerCannotBuyout},
		{"no buyout price", func(t *testing.T) *listing.Listing { return activeListing(t, 100) }, func(*listing.Listing) uuid.UUID { return uuid.New() }, 0, listing.ErrNoBuyoutPrice},
		// a wrong amount is refused before PlaceHold, so it never holds gold
		{"amount not the buyout price", buyoutListing, func(*listing.Listing) uuid.UUID { return uuid.New() }, testBuyoutPrice - 1, listing.ErrBuyoutAmountMismatch},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := tt.listing(t)
			repo, wallet, starter := &fakeRepo{listing: l}, &fakeWallet{}, &fakeStarter{}

			cmd := buyoutCmd(l, tt.member(l))
			if tt.amount != 0 {
				cmd.Amount = tt.amount
			}

			err := NewBuyoutUC(repo, wallet, starter, &fakeReleaser{}).Handle(context.Background(), cmd)

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

	release := &fakeReleaser{}

	err := NewBuyoutUC(repo, wallet, starter, release).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, commonconstants.ErrInsufficientGold)
	assert.Zero(t, repo.updateCall)
	assert.Zero(t, release.calls)
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

	release := &fakeReleaser{}

	err := NewBuyoutUC(repo, wallet, starter, release).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
	assert.Zero(t, repo.updateCall, "no bid may be recorded without live gold")
	assert.Zero(t, release.calls)
	assert.Zero(t, starter.calls)
	assert.Empty(t, l.Snapshot().Bids)
}

// unknownOnEveryAttempt scripts a write whose outcome stays unknown through every
// retry, nothing landing: the attempt is abandoned with its hold kept.
func unknownOnEveryAttempt() []updateOutcome {
	script := make([]updateOutcome, maxWriteAttempts)
	for i := range script {
		script[i] = updateOutcome{err: commonconstants.ErrTransient}
	}
	return script
}

// The bug ADR-0026 exists for. An attempt's hold lands, its bid write fails
// with the outcome unknown so the hold is kept, and the reconciler later finds
// no bid and releases it. The buyer's next intent, under a new key, must be able
// to buy the listing out: with one bid ID per buyer and listing it never could.
func TestBuyout_AfterAnAbandonedAttemptsHoldIsReleased_ANewKeyBuysOut(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	wallet, starter, release := &fakeWallet{released: map[uuid.UUID]bool{}}, &fakeStarter{}, &fakeReleaser{}
	repo := &fakeRepo{listing: l, updateScript: unknownOnEveryAttempt()}
	uc := NewBuyoutUC(repo, wallet, starter, release)

	first := buyoutCmd(l, member)
	first.IdempotencyKey = uuid.New()
	require.Error(t, uc.Handle(context.Background(), first))
	require.Zero(t, release.calls, "an unknown outcome keeps its hold")
	require.False(t, l.HasBuyoutBy(member))
	wallet.released[wallet.gotBidID] = true // the reconciler's sweep

	again := buyoutCmd(l, member)
	again.IdempotencyKey = uuid.New()
	err := uc.Handle(context.Background(), again)

	require.NoError(t, err)
	assert.True(t, l.HasBuyoutBy(member))
	assert.Equal(t, 1, starter.calls)
}

// The key is optional: without one the buyout still holds, records and starts,
// under a fresh random ID.
func TestBuyout_WithoutAKey_BuysOut(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	wallet, starter := &fakeWallet{}, &fakeStarter{}
	cmd := buyoutCmd(l, member)
	cmd.IdempotencyKey = uuid.Nil

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, starter, &fakeReleaser{}).Handle(context.Background(), cmd)

	require.NoError(t, err)
	assert.Equal(t, 1, wallet.calls)
	assert.Equal(t, uuid.Version(4), wallet.gotBidID.Version(), "no key, no derivation")
	assert.True(t, l.HasBid(wallet.gotBidID))
	assert.Equal(t, 1, starter.calls)
}

// A buyer whose buyout landed, resending with another key or none (a client that
// lost its key), is recognised by their own buyout before any gold is held.
func TestBuyout_BuyerAlreadyBoughtOut_UnderAnotherKey_IsAReplayWithNoHold(t *testing.T) {
	for name, key := range map[string]uuid.UUID{"another key": uuid.New(), "no key": uuid.Nil} {
		t.Run(name, func(t *testing.T) {
			l := buyoutListing(t)
			member := uuid.New()
			require.NoError(t, l.Buyout(uuid.New(), member, testBuyoutPrice, time.Now()))
			repo, wallet, starter, release := &fakeRepo{listing: l}, &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}

			cmd := buyoutCmd(l, member)
			cmd.IdempotencyKey = key
			err := NewBuyoutUC(repo, wallet, starter, release).Handle(context.Background(), cmd)

			require.NoError(t, err)
			assert.Zero(t, wallet.calls, "a replay holds no gold")
			assert.Zero(t, repo.updateCall)
			assert.Len(t, l.Snapshot().Bids, 1)
			assert.Equal(t, 1, starter.calls, "settlement is asked to start again, which it answers as already started")
		})
	}
}

// Two of the buyer's requests race under different keys. This one's unlocked read
// saw no buyout, so it held gold; under the lock the other's buyout is there, so
// this one recorded nothing. Its hold backs no bid and is given back at once,
// not left for the reconciler's grace. Still success: the buyer did buy it out.
func TestBuyout_BuyerBoughtOutBetweenReadAndLock_ReleasesItsOwnHold(t *testing.T) {
	stale := buyoutListing(t)
	locked := buyoutListing(t)
	member := uuid.New()
	require.NoError(t, locked.Buyout(uuid.New(), member, testBuyoutPrice, time.Now()))
	repo := &fakeRepo{listing: locked, found: stale}
	wallet, starter, release := &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}

	cmd := buyoutCmd(stale, member)
	cmd.IdempotencyKey = uuid.New()
	err := NewBuyoutUC(repo, wallet, starter, release).Handle(context.Background(), cmd)

	require.NoError(t, err)
	require.Equal(t, 1, wallet.calls)
	assert.Equal(t, 1, release.calls, "the hold that backs nothing goes back at once")
	assert.Equal(t, wallet.gotBidID, release.gotBidID)
	assert.Len(t, locked.Snapshot().Bids, 1, "nothing recorded under this call's ID")
	assert.Equal(t, 1, starter.calls)
}

// Resending the abandoned attempt's own key is refused: its hold is gone, and
// wallet will not hold again under it. The remedy is a new key.
func TestBuyout_ReusingAKeyWhoseHoldWasReleased_IsRefused(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	wallet := &fakeWallet{released: map[uuid.UUID]bool{}}
	repo := &fakeRepo{listing: l, updateScript: unknownOnEveryAttempt()}
	uc := NewBuyoutUC(repo, wallet, &fakeStarter{}, &fakeReleaser{})

	cmd := buyoutCmd(l, member)
	cmd.IdempotencyKey = uuid.New()
	require.Error(t, uc.Handle(context.Background(), cmd))
	wallet.released[wallet.gotBidID] = true

	err := uc.Handle(context.Background(), cmd)

	assert.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
	assert.False(t, l.HasBuyoutBy(member))
}

// A buyout that already landed is a replay: success, and the start is asked
// again, which the starter answers as already started.
func TestBuyout_AlreadyRecorded_IsSuccessAndStartsAgain(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	require.NoError(t, l.Buyout(BuyoutBidID(member, l.Snapshot().ID, testBuyoutKey), member, 500, time.Now()))
	require.NoError(t, l.Freeze(time.Now()))
	starter, wallet, release := &fakeStarter{}, &fakeWallet{}, &fakeReleaser{}

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, starter, release).Handle(context.Background(), buyoutCmd(l, member))

	require.NoError(t, err)
	assert.Len(t, l.Snapshot().Bids, 1)
	assert.Zero(t, wallet.calls, "a recorded buyout needs no new hold")
	assert.Zero(t, release.calls)
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
		listing.ErrBuyoutAmountMismatch,
	} {
		t.Run(refusal.Error(), func(t *testing.T) {
			l := buyoutListing(t)
			member := uuid.New()
			wallet, starter, release := &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}
			repo := &fakeRepo{listing: l, updateErr: fmt.Errorf("update: %w", refusal)}
			ctx, cancel := context.WithCancel(context.Background())
			cancel()

			err := NewBuyoutUC(repo, wallet, starter, release).Handle(ctx, buyoutCmd(l, member))

			assert.ErrorIs(t, err, refusal)
			assert.Equal(t, 1, release.calls)
			assert.Equal(t, BuyoutBidID(member, l.Snapshot().ID, testBuyoutKey), release.gotBidID)
			assert.Equal(t, l.Snapshot().ID, release.gotListingID)
			assert.NoError(t, release.gotCtxErr, "the release must not inherit the request's cancellation")
			assert.Zero(t, starter.calls)
		})
	}
}

// Any other failure may have committed after all (an ambiguous COMMIT, a
// timeout). Releasing then could free gold backing a real buyout, so the hold
// is kept and the buyer's retry, a replay, settles it either way.
// An ambiguous write is retried before the hold is left to the reconciler, as
// PlaceBid does: one retry usually settles it, and the buyer is told it worked.
func TestBuyout_AmbiguousWriteThenSuccess_RecordsAndKeepsTheHold(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	wallet, starter, release := &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}
	repo := &fakeRepo{listing: l, updateScript: []updateOutcome{{err: errors.New("connection reset")}}}

	err := NewBuyoutUC(repo, wallet, starter, release).Handle(context.Background(), buyoutCmd(l, member))

	require.NoError(t, err)
	assert.Equal(t, 2, repo.updateCall, "the write is retried")
	assert.True(t, l.HasBuyoutBy(member))
	assert.Zero(t, release.calls)
	assert.Equal(t, 1, starter.calls)
}

// Failing before the listing was read proves the first attempt wrote nothing.
// Unkeyed, its random ID is never retried under, so the gold goes back at once.
// Keyed, a lock timeout leaves the ID live: the buyer is told the listing is busy
// and retries with the same key onto the same hold, so releasing would race that
// retry and could leave the retried buyout with no gold (ADR-0027). A missing
// listing can never take the buyout, keyed or not.
func TestBuyout_FailedBeforeReadOnTheFirstAttempt(t *testing.T) {
	tests := []struct {
		name         string
		key          uuid.UUID
		failure      error
		wantReleases int
	}{
		{"unkeyed lock timeout releases", uuid.Nil, commonconstants.ErrLockUnavailable, 1},
		{"keyed lock timeout keeps the hold for the same key's retry", testBuyoutKey, commonconstants.ErrLockUnavailable, 0},
		{"keyed missing listing releases", testBuyoutKey, commonconstants.ErrNotFound, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := buyoutListing(t)
			release := &fakeReleaser{}
			repo := &fakeRepo{listing: l, updateErr: fmt.Errorf("update: %w", tt.failure)}
			cmd := buyoutCmd(l, uuid.New())
			cmd.IdempotencyKey = tt.key

			err := NewBuyoutUC(repo, &fakeWallet{}, &fakeStarter{}, release).Handle(context.Background(), cmd)

			assert.ErrorIs(t, err, tt.failure)
			assert.Equal(t, 1, repo.updateCall, "not retried")
			assert.Equal(t, tt.wantReleases, release.calls)
		})
	}
}

// A keyed buyout that met a busy listing kept its hold; the same key's retry lands
// on it and buys out, with nothing released along the way.
func TestBuyout_KeyedLockTimeoutThenSameKeyRetry_BuysOutOnTheSameHold(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	repo := &fakeRepo{listing: l, updateScript: []updateOutcome{{err: commonconstants.ErrLockUnavailable}}}
	wallet, starter, release := &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}
	uc := NewBuyoutUC(repo, wallet, starter, release)
	cmd := buyoutCmd(l, member)

	require.ErrorIs(t, uc.Handle(context.Background(), cmd), commonconstants.ErrLockUnavailable)
	held := wallet.gotBidID

	require.NoError(t, uc.Handle(context.Background(), cmd))
	assert.Equal(t, held, wallet.gotBidID)
	assert.True(t, l.HasBid(held))
	assert.Zero(t, release.calls)
	assert.Equal(t, 1, starter.calls)
}

// The first COMMIT landed but its acknowledgement was lost. The retry finds this
// call's bid under the lock: recorded, so nothing is released.
func TestBuyout_CommitLandedButUnacknowledged_RetryFindsIt(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	release, starter := &fakeReleaser{}, &fakeStarter{}
	repo := &fakeRepo{listing: l, updateScript: []updateOutcome{{committed: true, err: errors.New("connection reset")}}}

	err := NewBuyoutUC(repo, &fakeWallet{}, starter, release).Handle(context.Background(), buyoutCmd(l, member))

	require.NoError(t, err)
	assert.Equal(t, 2, repo.updateCall)
	assert.Len(t, l.Snapshot().Bids, 1)
	assert.Zero(t, release.calls)
	assert.Equal(t, 1, starter.calls)
}

// A retry that fails before reading proves nothing about the attempt before it,
// which may have committed: the hold is kept.
func TestBuyout_FailedBeforeReadOnARetry_KeepsTheHold(t *testing.T) {
	l := buyoutListing(t)
	release := &fakeReleaser{}
	script := []updateOutcome{{err: errors.New("connection reset")}}
	for range maxWriteAttempts - 1 {
		script = append(script, updateOutcome{err: commonconstants.ErrLockUnavailable})
	}
	repo := &fakeRepo{listing: l, updateScript: script}

	err := NewBuyoutUC(repo, &fakeWallet{}, &fakeStarter{}, release).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Zero(t, release.calls)
}

// A cancelled request is among the likeliest causes of an ambiguous COMMIT, so
// the retries must not inherit its cancellation.
func TestBuyout_RetriesTheWriteEvenWhenTheRequestIsCancelled(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	repo := &fakeRepo{listing: l, updateScript: []updateOutcome{{err: errors.New("connection reset")}}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := NewBuyoutUC(repo, &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}).Handle(ctx, buyoutCmd(l, member))

	require.NoError(t, err)
	require.Len(t, repo.gotUpdateCtxErrs, 2)
	assert.NoError(t, repo.gotUpdateCtxErrs[1], "the retry runs on a context the request cannot cancel")
	assert.True(t, l.HasBuyoutBy(member))
}

// Still unknown after every retry: the hold is kept for the reconciler, and the
// buyer is told to resend.
func TestBuyout_NonDefinitiveFailure_KeepsTheHold(t *testing.T) {
	for _, failure := range []error{
		commonconstants.ErrTransient,
		errors.New("connection reset"),
	} {
		t.Run(failure.Error(), func(t *testing.T) {
			l := buyoutListing(t)
			wallet, starter, release := &fakeWallet{}, &fakeStarter{}, &fakeReleaser{}
			repo := &fakeRepo{listing: l, updateErr: fmt.Errorf("update: %w", failure)}

			err := NewBuyoutUC(repo, wallet, starter, release).Handle(context.Background(), buyoutCmd(l, uuid.New()))

			assert.ErrorIs(t, err, failure)
			assert.ErrorIs(t, err, commonconstants.ErrTransient, "the buyer is told to resend")
			assert.Equal(t, maxWriteAttempts, repo.updateCall)
			assert.Zero(t, release.calls)
			assert.Zero(t, starter.calls)
		})
	}
}

// Starting the release is asked once — the run retries the release itself — and a
// start that fails never replaces the refusal the buyer needs to hear.
func TestBuyout_ReleaseStartFails_KeepsTheRefusal(t *testing.T) {
	l := buyoutListing(t)
	release := &fakeReleaser{err: errors.New("temporal down")}
	repo := &fakeRepo{listing: l, updateErr: listing.ErrListingNotAcceptingBids}

	err := NewBuyoutUC(repo, &fakeWallet{}, &fakeStarter{}, release).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, listing.ErrListingNotAcceptingBids)
	assert.Equal(t, 1, release.calls)
}

// The buyout committed; only the start failed. The bid stays and so does the
// gold; the buyer's retry is a replay that starts settlement.
func TestBuyout_StartFails_BuyoutStaysRecorded(t *testing.T) {
	l := buyoutListing(t)
	member := uuid.New()
	release := &fakeReleaser{}
	starter := &fakeStarter{err: errors.New("temporal down")}

	err := NewBuyoutUC(&fakeRepo{listing: l}, &fakeWallet{}, starter, release).Handle(context.Background(), buyoutCmd(l, member))

	assert.Error(t, err)
	_, ok := bidSnapshot(l, BuyoutBidID(member, l.Snapshot().ID, testBuyoutKey))
	assert.True(t, ok)
	assert.Zero(t, release.calls)
}

// One intent, one bid ID: every resend with the same key lands on the same hold
// and the same bid, and changing any of the three gives a different one.
func TestBuyoutBidID_IsDeterministicPerMemberListingAndKey(t *testing.T) {
	member, listingID, key := uuid.New(), uuid.New(), uuid.New()
	id := BuyoutBidID(member, listingID, key)

	assert.Equal(t, id, BuyoutBidID(member, listingID, key))
	assert.NotEqual(t, id, BuyoutBidID(uuid.New(), listingID, key))
	assert.NotEqual(t, id, BuyoutBidID(member, uuid.New(), key))
	assert.NotEqual(t, id, BuyoutBidID(member, listingID, uuid.New()), "a new key is a new intent")
	assert.Equal(t, uuid.Version(5), id.Version())
}

// Refused by the unlocked read, before any hold: nothing is released, even
// though an earlier ambiguous attempt may have kept one. The read is unlocked,
// so that attempt could still be committing a funded buyout; freeing its gold
// here would leave a winning bid unbacked. The reconciler owns a hold that
// truly backs nothing.
func TestBuyout_RefusedBeforeHold_NeverReleases(t *testing.T) {
	l := buyoutListing(t)
	require.NoError(t, l.Buyout(uuid.New(), uuid.New(), 500, time.Now()))
	wallet, release := &fakeWallet{}, &fakeReleaser{}

	err := NewBuyoutUC(&fakeRepo{listing: l}, wallet, &fakeStarter{}, release).Handle(context.Background(), buyoutCmd(l, uuid.New()))

	assert.ErrorIs(t, err, listing.ErrListingNotAcceptingBids)
	assert.Zero(t, wallet.calls)
	assert.Zero(t, release.calls)
}
