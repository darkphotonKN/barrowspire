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

// errListingGone stands in for a repository failure unrelated to concurrency —
// the usecase must pass it straight back without retrying.
var errListingGone = errors.New("listing gone")

// fakeRepo scripts what the repository returns so the usecase's coordination can
// be driven without a database. The bidding rules themselves are already covered
// by the domain tests; these only assert the usecase wiring — what gets called,
// how many times, and what is passed along.
type fakeRepo struct {
	// findListing is called afresh on every FindByID, because a retry must reload
	// the aggregate rather than reuse the one it already mutated.
	findListing func() (*listing.Listing, error)

	// saveResults[i] is what Save returns on its i-th call. Indexing past the end
	// panics the test loudly rather than letting an over-eager retry loop pass.
	saveResults []error

	findCalls int
	saveCalls int

	// beforeSeen records each snapshot handed to Save, so a test can prove the
	// OCC baseline was taken before the domain mutated the aggregate.
	beforeSeen []listing.ListingSnapshot
}

func (f *fakeRepo) FindByID(ctx context.Context, id uuid.UUID) (*listing.Listing, error) {
	f.findCalls++
	return f.findListing()
}

func (f *fakeRepo) Insert(ctx context.Context, l *listing.Listing) error {
	return errors.New("Insert must not be called on a bid path")
}

func (f *fakeRepo) Save(ctx context.Context, l *listing.Listing, before listing.ListingSnapshot) error {
	f.beforeSeen = append(f.beforeSeen, before)
	result := f.saveResults[f.saveCalls]
	f.saveCalls++
	return result
}

// activeListingFn returns a factory building a fresh ACTIVE listing per call, so
// each retry gets its own aggregate the way a real reload would.
func activeListingFn(startPrice int) func() (*listing.Listing, error) {
	return func() (*listing.Listing, error) {
		now := time.Now()
		l, err := listing.NewListing(uuid.New(), uuid.New(), startPrice, now, now.Add(time.Hour))
		if err != nil {
			return nil, err
		}
		if err := l.Publish(now); err != nil {
			return nil, err
		}
		return l, nil
	}
}

// failingListingFn returns a factory that always fails to load.
func failingListingFn(err error) func() (*listing.Listing, error) {
	return func() (*listing.Listing, error) { return nil, err }
}

// TestPlaceBidUC drives the usecase by scripting the repository. It asserts on the
// usecase's own contract — that a valid bid is persisted, a rejected one is not,
// and a lost OCC race is retried against a freshly loaded aggregate.
//
// Note on asserting call counts: for a load-modify-save coordinator the number of
// saves and reloads *is* the promised behaviour, which is why counting is
// legitimate here where it normally wouldn't be.
func TestPlaceBidUC(t *testing.T) {
	tests := []struct {
		name        string
		findListing func() (*listing.Listing, error)
		// saveResults[i] is what Save returns on its i-th call
		saveResults   []error
		amount        int
		wantErr       error // errors.Is target; nil means expect success
		wantSaveCalls int
		wantFindCalls int
	}{
		{
			name:          "a valid bid is persisted",
			findListing:   activeListingFn(100),
			saveResults:   []error{nil},
			amount:        150,
			wantErr:       nil,
			wantSaveCalls: 1,
			wantFindCalls: 1,
		},
		{
			// 50 is below the 100 reserve, so the domain refuses before any bid
			// object exists. The sentinel must survive the usecase's wrapping so
			// the gRPC layer can still map it to InvalidArgument.
			name:          "a bid below the reserve is rejected and never saved",
			findListing:   activeListingFn(100),
			saveResults:   []error{nil},
			amount:        50,
			wantErr:       listing.ErrBidTooLow,
			wantSaveCalls: 0,
			wantFindCalls: 1,
		},
		{
			// Losing the race is expected under contention, not exceptional.
			name:          "a lost OCC race is retried against a reloaded aggregate",
			findListing:   activeListingFn(100),
			saveResults:   []error{listing.ErrConcurrentModification, nil},
			amount:        150,
			wantErr:       nil,
			wantSaveCalls: 2,
			wantFindCalls: 2,
		},
		{
			name:          "a non-retriable load failure stops immediately",
			findListing:   failingListingFn(errListingGone),
			saveResults:   []error{nil},
			amount:        150,
			wantErr:       errListingGone,
			wantSaveCalls: 0,
			wantFindCalls: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{findListing: tt.findListing, saveResults: tt.saveResults}

			err := NewPlaceBidUC(repo).Handle(context.Background(), PlaceBidCommand{
				ListingID: uuid.New(),
				MemberID:  uuid.New(),
				Amount:    tt.amount,
				Now:       time.Now(),
			})

			if tt.wantErr == nil {
				assert.NoError(t, err)
			} else {
				// errors.Is so the sentinel still matches through the wrapping
				assert.ErrorIs(t, err, tt.wantErr)
			}

			assert.Equal(t, tt.wantSaveCalls, repo.saveCalls, "number of saves")
			assert.Equal(t, tt.wantFindCalls, repo.findCalls, "number of reloads")
		})
	}
}

// TestPlaceBidUCSnapshotsBeforeMutating pins the OCC baseline, which the table
// above cannot express: Snapshot() has to be taken *before* Listing.PlaceBid
// runs. Snapshotting afterwards would hand Save a "before" that already contains
// the new bid, so diffListing would compute an empty changeset and silently
// persist nothing while still reporting success.
func TestPlaceBidUCSnapshotsBeforeMutating(t *testing.T) {
	repo := &fakeRepo{findListing: activeListingFn(100), saveResults: []error{nil}}

	err := NewPlaceBidUC(repo).Handle(context.Background(), PlaceBidCommand{
		ListingID: uuid.New(),
		MemberID:  uuid.New(),
		Amount:    150,
		Now:       time.Now(),
	})

	require.NoError(t, err)
	require.Len(t, repo.beforeSeen, 1)
	assert.Empty(t, repo.beforeSeen[0].Bids, "the OCC baseline must predate the new bid")
}

// TestWithdrawBidUC covers the ownership guard and the happy path. Bid IDs are
// minted inside the domain, so the listing is built once up front and its real
// bid ID read back — rebuilding per call would mint a new ID and every case would
// fail as not-found instead of exercising the branch under test.
func TestWithdrawBidUC(t *testing.T) {
	tests := []struct {
		name string
		// withdrawAsOwner picks whose identity is sent: the bid's owner or a stranger
		withdrawAsOwner bool
		wantErr         error
		wantSaveCalls   int
	}{
		{
			name:            "the owner may cancel their own bid",
			withdrawAsOwner: true,
			wantErr:         nil,
			wantSaveCalls:   1,
		},
		{
			name:            "another member may not cancel someone else's bid",
			withdrawAsOwner: false,
			wantErr:         listing.ErrNotBidOwner,
			wantSaveCalls:   0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			owner := uuid.New()

			now := time.Now()
			built, err := listing.NewListing(uuid.New(), uuid.New(), 100, now, now.Add(time.Hour))
			require.NoError(t, err)
			require.NoError(t, built.Publish(now))
			require.NoError(t, built.PlaceBid(owner, 150, now))

			placedBidID := built.Snapshot().Bids[0].ID
			repo := &fakeRepo{
				findListing: func() (*listing.Listing, error) { return built, nil },
				saveResults: []error{nil},
			}

			caller := owner
			if !tt.withdrawAsOwner {
				caller = uuid.New()
			}

			err = NewWithdrawBidUC(repo).Handle(context.Background(), WithdrawBidCommand{
				ListingID: uuid.New(),
				BidID:     placedBidID,
				MemberID:  caller,
				Now:       time.Now(),
			})

			if tt.wantErr == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tt.wantErr)
			}

			assert.Equal(t, tt.wantSaveCalls, repo.saveCalls, "number of saves")
		})
	}
}
