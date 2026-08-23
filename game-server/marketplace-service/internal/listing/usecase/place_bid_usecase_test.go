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

// fakeRepo drives the use cases without a database. Modify is the only method
// the bid use cases touch, and it stands in for the real one by running fn
// against a listing the test set up — the same contract, minus the transaction
// and the row lock.
type fakeRepo struct {
	listing    *listing.Listing
	modifyErr  error
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
	if f.modifyErr != nil {
		return f.modifyErr
	}
	return fn(f.listing)
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

			err := NewPlaceBidUC(repo).Handle(context.Background(), PlaceBidCommand{
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

// TestPlaceBidUCStartsPending pins the saga's entry state at the use case
// boundary: placement alone never takes the lead, because no gold is held yet.
func TestPlaceBidUCStartsPending(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	err := NewPlaceBidUC(repo).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	assert.Equal(t, listing.BidStatusPending, l.Snapshot().Bids[0].Status)
}

// TestPlaceBidUCForwardsTheIdempotencyKey guards the wiring that makes retries
// safe. Dropping the key here compiles and passes every other test, but silently
// turns a replayed request into a member bidding against themselves.
func TestPlaceBidUCForwardsTheIdempotencyKey(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}
	uc := NewPlaceBidUC(repo)
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

	require.NoError(t, NewPlaceBidUC(repo).Handle(context.Background(), PlaceBidCommand{
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

// TestFailBidUC covers the compensating outcome: wallet could not hold the gold.
func TestFailBidUC(t *testing.T) {
	l := activeListing(t, 100)
	repo := &fakeRepo{listing: l}

	require.NoError(t, NewPlaceBidUC(repo).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	}))

	bidID := l.Snapshot().Bids[0].ID

	require.NoError(t, NewFailBidUC(repo).Handle(context.Background(), FailBidCommand{
		ListingID: uuid.New(),
		BidID:     bidID,
		Now:       time.Now(),
	}))

	assert.Equal(t, listing.BidStatusFailed, l.Snapshot().Bids[0].Status)
}
