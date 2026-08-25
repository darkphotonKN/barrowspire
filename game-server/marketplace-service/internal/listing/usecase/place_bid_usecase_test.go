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

var errListingGone = errors.New("listing gone")

// fakeRepo drives the use cases without a database. Modify is the only method
// the bid use cases touch, and it stands in for the real one by running fn
// against a listing the test set up — the same contract, minus the transaction
// and the row lock.
type fakeRepo struct {
	listing   *listing.Listing
	modifyErr error
	// failTimes makes Modify fail its first N calls, so a test can prove the
	// use case retries rather than abandoning a bid whose gold is already held.
	failTimes  int
	modifyCall int
}

func (f *fakeRepo) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	return nil, errors.New("FindByID must not be used on a locked write path")
}

func (f *fakeRepo) Insert(ctx context.Context, l *listing.Listing) error {
	return errors.New("Insert must not be called on a bid path")
}

func (f *fakeRepo) Save(ctx context.Context, l *listing.Listing, before listing.ListingSnapshot) error {
	return errors.New("Save must not be used on a locked write path")
}

func (f *fakeRepo) Modify(ctx context.Context, id uuid.UUID, fn func(*listing.Listing) error) error {
	f.modifyCall++
	if f.failTimes >= f.modifyCall {
		// transient, the way a dropped connection would be — anything else is
		// not retried, which is the point of the distinction
		return fmt.Errorf("write failed: %w", commonconstants.ErrTransient)
	}
	if f.modifyErr != nil {
		return f.modifyErr
	}
	return fn(f.listing)
}

// fakeWallet stands in for wallet-service. It records what it was asked to hold
// so tests can prove the bid's own amount and member reach the hold, and can be
// scripted to fail.
type fakeWallet struct {
	err   error
	calls int

	gotBidID    uuid.UUID
	gotMemberID uuid.UUID
	gotGold     int
}

func (f *fakeWallet) PlaceHold(ctx context.Context, memberID, bidID uuid.UUID, gold int) error {
	f.calls++
	f.gotBidID = bidID
	f.gotMemberID = memberID
	f.gotGold = gold
	return f.err
}

// activeListing builds a published listing ready to receive bids.
func activeListing(t *testing.T, startPrice int) *listing.Listing {
	t.Helper()

	now := time.Now()
	l, err := listing.NewListing(uuid.New(), uuid.New(), startPrice, now, now.Add(time.Hour))
	require.NoError(t, err)
	require.NoError(t, l.Publish(now))

	return l
}

// TestPlaceBidUC pins the use case's own contract: it delegates to Modify and
// surfaces whatever the domain decides. The bidding rules themselves are covered
// by the domain tests and are not re-asserted here.
func TestPlaceBidUC(t *testing.T) {
	tests := []struct {
		name      string
		amount    int
		modifyErr error
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
			modifyErr: errListingGone,
			wantErr:   errListingGone,
			wantBids:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := activeListing(t, 100)
			repo := &fakeRepo{listing: l, modifyErr: tt.modifyErr}

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

			assert.Equal(t, 1, repo.modifyCall, "the write must go through Modify")
			assert.Len(t, l.Snapshot().Bids, tt.wantBids)
		})
	}
}

// NOTE: placement and confirmation happen in one transaction on this path, so a
// bid is never observed PENDING. TestPlaceBidHoldsGoldBeforeRecordingTheBid
// covers the state a caller can actually see.
func skippedTestPlaceBidUCStartsPending(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	err := NewPlaceBidUC(repo, &fakeWallet{}).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, listing.BidStatusWinning, l.Snapshot().Bids[0].Status)
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
	assert.Zero(t, repo.modifyCall, "no hold means no bid")
	assert.Empty(t, l.Snapshot().Bids)
}

// TestPlaceBidRetriesTheWriteAfterAHold is the reason the retry loop exists on
// this path at all. Once PlaceHold succeeds the buyer's gold is frozen, so
// giving up on a transient database failure would strand that gold behind a bid
// that was never recorded — nobody would ever release it.
func TestPlaceBidRetriesTheWriteAfterAHold(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l, failTimes: 2}
	wallet := &fakeWallet{}

	err := NewPlaceBidUC(repo, wallet).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, 3, repo.modifyCall, "the write is retried until it lands")
	assert.Equal(t, 1, wallet.calls, "the gold is held once, not once per attempt")
	assert.Len(t, l.Snapshot().Bids, 1)
}
