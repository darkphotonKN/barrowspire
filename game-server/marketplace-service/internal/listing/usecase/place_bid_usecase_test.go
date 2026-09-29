package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var errListingGone = errors.New("listing gone")

// fakeRepo drives the use cases without a database. Update is the only method
// the bid use cases touch, and it stands in for the real one by running fn
// against a listing the test set up — the same contract, minus the transaction
// and the row lock.
type fakeRepo struct {
	listing    *listing.Listing
	findErr    error
	updateErr  error
	updateCall int
}

// FindByID is a read: PlaceBid uses it only to learn when the listing ends, to
// set the hold's expiry. Writes are still refused below — they go through Update.
func (f *fakeRepo) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	if f.findErr != nil {
		return nil, f.findErr
	}
	return f.listing, nil
}

func (f *fakeRepo) Insert(ctx context.Context, l *listing.Listing) error {
	return errors.New("Insert must not be called on a bid path")
}

func (f *fakeRepo) Save(ctx context.Context, l *listing.Listing, before listing.ListingSnapshot) error {
	return errors.New("Save must not be used on a locked write path")
}

func (f *fakeRepo) Update(ctx context.Context, id uuid.UUID, fn func(*listing.Listing) error) error {
	f.updateCall++
	if f.updateErr != nil {
		return f.updateErr
	}
	return fn(f.listing)
}

// fakeWallet stands in for wallet-service. It records what it was asked to hold
// so tests can prove the bid's own amount and member reach the hold, and can be
// scripted to fail.
type fakeWallet struct {
	err   error
	calls int

	gotBidID     uuid.UUID
	gotMemberID  uuid.UUID
	gotGold      int
	gotExpiresAt time.Time

	releaseErr       error
	releaseCalls     int
	gotReleasedBidID uuid.UUID
}

func (f *fakeWallet) ReleaseHold(ctx context.Context, bidID uuid.UUID) error {
	f.releaseCalls++
	f.gotReleasedBidID = bidID
	return f.releaseErr
}

func (f *fakeWallet) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int, expiresAt time.Time) error {
	f.calls++
	f.gotBidID = bidID
	f.gotMemberID = memberID
	f.gotGold = gold
	f.gotExpiresAt = expiresAt
	return f.err
}

// activeListing builds a published listing ready to receive bids.
func activeListing(t *testing.T, startPrice int) *listing.Listing {
	t.Helper()

	now := time.Now()
	l, err := listing.NewListing(uuid.New(), uuid.New(), startPrice, now, now.Add(time.Hour))
	require.NoError(t, err)

	return l
}

// TestPlaceBidUC pins the use case's own contract: it delegates to Update and
// surfaces whatever the domain decides. The bidding rules themselves are covered
// by the domain tests and are not re-asserted here.
func TestPlaceBidUC(t *testing.T) {
	tests := []struct {
		name      string
		amount    int
		updateErr error
		wantErr   error
		wantBids  int
	}{
		{
			name:     "a valid bid is placed as pending",
			amount:   150,
			wantErr:  nil,
			wantBids: 1,
		},
		{
			// below the 100 reserve, so the domain refuses before a bid exists
			name:     "a bid below the reserve is rejected",
			amount:   50,
			wantErr:  listing.ErrBidTooLow,
			wantBids: 0,
		},
		{
			name:      "a repository failure surfaces to the caller",
			amount:    150,
			updateErr: errListingGone,
			wantErr:   errListingGone,
			wantBids:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := activeListing(t, 100)
			repo := &fakeRepo{listing: l, updateErr: tt.updateErr}

			err := NewPlaceBidUC(repo, &fakeWallet{}).Handle(context.Background(), PlaceBidCommand{
				ListingID: uuid.New(),
				MemberID:  uuid.New(),
				Amount:    tt.amount,
				Now:       time.Now(),
			})

			if tt.wantErr == nil {
				assert.NoError(t, err)
			} else {
				// errors.Is so the sentinel survives the use case's wrapping
				assert.ErrorIs(t, err, tt.wantErr)
			}

			assert.Equal(t, 1, repo.updateCall, "the write must go through Update")
			assert.Len(t, l.Snapshot().Bids, tt.wantBids)
		})
	}
}

// TestPlaceBidUCForwardsTheIdempotencyKey guards the wiring that makes retries
// safe. Dropping the key here compiles and passes every other test, but silently
// turns a replayed request into a member bidding against themselves.
func TestPlaceBidUCForwardsTheIdempotencyKey(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	uc := NewPlaceBidUC(repo, &fakeWallet{})
	key := uuid.New()
	member := uuid.New()

	cmd := PlaceBidCommand{
		ListingID:      uuid.New(),
		MemberID:       member,
		Amount:         150,
		IdempotencyKey: key,
		Now:            time.Now(),
	}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	require.NoError(t, uc.Handle(context.Background(), cmd), "a replay must be accepted")

	assert.Len(t, l.Snapshot().Bids, 1, "a replay must not create a second bid")
}

// TestConfirmBidUC covers the promotion step that runs after wallet holds the
// gold, including redelivery of the same confirmation.
func TestConfirmBidUC(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	require.NoError(t, NewPlaceBidUC(repo, &fakeWallet{}).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	}))

	bidID := l.Snapshot().Bids[0].ID
	uc := NewConfirmBidUC(repo)
	cmd := ConfirmBidCommand{ListingID: uuid.New(), BidID: bidID, Now: time.Now()}

	require.NoError(t, uc.Handle(context.Background(), cmd))
	assert.Equal(t, listing.BidStatusWinning, l.Snapshot().Bids[0].Status)

	assert.NoError(t, uc.Handle(context.Background(), cmd), "redelivery must not error")
}

// TestFailBidUC covers the compensating outcome: a bid whose hold could not be
// placed is marked FAILED.
//
// The bid is built through the domain rather than through PlaceBidUC, because on
// the synchronous path a placed bid is already WINNING — FailBid only ever runs
// against a PENDING bid, which is the shape the event-driven flow produces.
func TestFailBidUC(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	bidID := uuid.New()
	require.NoError(t, l.PlaceBidWithID(bidID, uuid.New(), 150, uuid.Nil, time.Now()))

	require.NoError(t, NewFailBidUC(repo).Handle(context.Background(), FailBidCommand{
		ListingID: uuid.New(),
		BidID:     bidID,
		Now:       time.Now(),
	}))

	assert.Equal(t, listing.BidStatusFailed, l.Snapshot().Bids[0].Status)
}

// TestPlaceBidHoldsGoldBeforeRecordingTheBid pins the ordering that makes this
// use case an orchestrator rather than a single write. The hold comes first: a
// bid recorded before the gold is secured is a claim with nothing behind it, and
// the listing would show a leader who may not be able to pay.
func TestPlaceBidHoldsGoldBeforeRecordingTheBid(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	wallet := &fakeWallet{}
	member := uuid.New()

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  member,
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 1, wallet.calls, "gold must be held")
	assert.Equal(t, member, wallet.gotMemberID)
	assert.Equal(t, 150, wallet.gotGold, "the hold must match the bid")

	bids := l.Snapshot().Bids
	require.Len(t, bids, 1)
	assert.Equal(t, bids[0].ID, wallet.gotBidID, "the hold must be keyed by this bid")
	assert.Equal(t, listing.BidStatusWinning, bids[0].Status, "a held bid takes the lead immediately")
}

// TestPlaceBidRecordsNothingWhenTheHoldFails covers the cheap failure: the buyer
// could not cover the bid, so nothing was reserved and nothing should be written.
func TestPlaceBidRecordsNothingWhenTheHoldFails(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	wallet := &fakeWallet{err: errors.New("insufficient available gold")}

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	assert.Error(t, err)
	assert.Zero(t, repo.updateCall, "no hold means no bid")
	assert.Empty(t, l.Snapshot().Bids)
}

// Once PlaceHold succeeds the bidder's gold is frozen, so a write that then fails
// leaves it frozen behind a bid nobody recorded. Nothing in settlement will ever
// release it either: settlement works from the listing's bids, and this one is not
// there. So the use case that reserved the gold is the one that has to give it back.
func TestPlaceBidReleasesTheHoldWhenTheWriteFails(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l, updateErr: errListingGone}
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.Error(t, err)
	assert.ErrorIs(t, err, errListingGone, "the caller still learns why the bid failed")
	assert.Equal(t, 1, wallet.calls, "the gold was held")
	assert.Equal(t, 1, wallet.releaseCalls, "and given straight back")
	assert.Equal(t, wallet.gotBidID, wallet.gotReleasedBidID, "the hold released is the one placed")
	assert.Empty(t, l.Snapshot().Bids, "no bid was recorded")
}

// The compensation is best effort: it runs on a bidder's request path, so it gets one
// attempt and the reconciler sweeps up what it misses. What it must not do is replace
// the real failure — a caller told "release failed" learns nothing about why their bid
// did not land.
func TestPlaceBidCompensationFailure_StillReportsTheOriginalError(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l, updateErr: errListingGone}
	wallet := &fakeWallet{releaseErr: errors.New("wallet unreachable")}

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.Error(t, err)
	assert.ErrorIs(t, err, errListingGone, "the write failure is what the bidder needs to hear")
}

// The hold must outlive settlement, not an arbitrary hour: it lapses at the
// listing's end plus settlement grace (FS-NXP1W §Req 19), so the sweeper cannot
// release it while settlement is still working towards the commit.
func TestPlaceBidUC_HoldExpiresAtListingEndPlusGrace(t *testing.T) {
	l := activeListing(t, 100)
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(&fakeRepo{listing: l}, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID,
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, l.Snapshot().EndsAt.Add(settlementGrace), wallet.gotExpiresAt)
}

// Reading the listing's end time now comes before the hold, so a listing that
// cannot be read — missing, or the read failed — stops the bid before any gold
// is frozen for it.
func TestPlaceBidUC_UnreadableListing_HoldsNoGold(t *testing.T) {
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(&fakeRepo{findErr: errors.New("listing not found")}, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	assert.Error(t, err)
	assert.Zero(t, wallet.calls)
}

// A listing past its end can never take this bid, so no gold may be held for
// it: the hold would be stranded the moment Update refused the bid. Asked of the
// aggregate before the hold — the same rule Update applies again under the lock.
func TestPlaceBidUC_ExpiredListing_HoldsNoGold(t *testing.T) {
	l := activeListing(t, 100) // ends an hour from now
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(&fakeRepo{listing: l}, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: l.Snapshot().ID,
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now().Add(2 * time.Hour),
	})

	assert.ErrorIs(t, err, listing.ErrListingExpired)
	assert.Zero(t, wallet.calls, "no gold may be held for a bid that cannot land")
}
