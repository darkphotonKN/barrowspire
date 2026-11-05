package repository

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-V7A5S Req 5: a seller's withdrawal is one locked write — the listing
// CANCELLED and every live bid LOST — with no migration: both statuses are
// already allowed by the schema. A bidder's own CANCELLED bid is left as it was.
func TestListingRepository_WithdrawalPersistsInOneLockedWrite(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()

	sellerID := uuid.New()
	l, err := listing.NewListing(uuid.New(), sellerID, uuid.New(), 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)
	require.NoError(t, repo.Insert(ctx, l))
	id := l.Snapshot().ID

	outbid, leader, pending, withdrawn, withdrawer := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
		steps := []func() error{
			func() error { return l.PlaceBidWithID(outbid, uuid.New(), 150, uuid.New(), now) },
			func() error { return l.ConfirmBid(outbid, now) },
			func() error { return l.PlaceBidWithID(leader, uuid.New(), 200, uuid.New(), now) },
			func() error { return l.ConfirmBid(leader, now) },
			func() error { return l.PlaceBidWithID(withdrawn, withdrawer, 250, uuid.New(), now) },
			func() error { return l.WithdrawBid(withdrawn, withdrawer, now) },
			func() error { return l.PlaceBidWithID(pending, uuid.New(), 300, uuid.New(), now) },
		}
		for _, step := range steps {
			if err := step(); err != nil {
				return err
			}
		}
		return nil
	}))

	require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
		return l.Withdraw(sellerID, now.Add(time.Minute))
	}))

	got, err := repo.FindByID(ctx, id)
	require.NoError(t, err)
	snap := got.Snapshot()
	assert.Equal(t, listing.StatusCancelled, snap.Status)
	statuses := map[uuid.UUID]listing.BidStatus{}
	for _, b := range snap.Bids {
		statuses[b.ID] = b.Status
	}
	assert.Equal(t, map[uuid.UUID]listing.BidStatus{
		outbid:    listing.BidStatusLost,
		leader:    listing.BidStatusLost,
		pending:   listing.BidStatusLost,
		withdrawn: listing.BidStatusCancelled,
	}, statuses)

	// Req 4: the repeat is a no-op write
	require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
		return l.Withdraw(sellerID, now.Add(2*time.Minute))
	}))
	again, err := repo.FindByID(ctx, id)
	require.NoError(t, err)
	assert.Equal(t, snap.Version, again.Snapshot().Version, "nothing changed, nothing written")
}

// withdrawalMarkRow is what the mark may and may not touch.
type withdrawalMarkRow struct {
	StartedAt *time.Time `db:"withdrawal_started_at"`
	UpdatedAt time.Time  `db:"updated_at"`
	Version   int        `db:"version"`
}

func withdrawalMark(t *testing.T, repo *ListingRepository, id uuid.UUID) withdrawalMarkRow {
	t.Helper()

	var row withdrawalMarkRow
	require.NoError(t, repo.db.Get(&row, `SELECT withdrawal_started_at, updated_at, version FROM listings WHERE id = $1`, id))
	return row
}

// FS-V7A5S Req 8 (amended 2026-11-05): the withdrawal leaves the listing
// unmarked, and the mark is fenced: it sets withdrawal_started_at only on a
// CANCELLED listing not yet marked, never moves the backstop's cursor
// (updated_at) or the aggregate's version, and is a no-op on an ACTIVE listing,
// an already-marked one, or an unknown id.
func TestListingRepository_MarkWithdrawalStarted_IsFenced(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()

	newListing := func() (uuid.UUID, uuid.UUID) {
		sellerID := uuid.New()
		l, err := listing.NewListing(uuid.New(), sellerID, uuid.New(), 100, nil, now, now.Add(time.Hour))
		require.NoError(t, err)
		require.NoError(t, repo.Insert(ctx, l))
		return l.Snapshot().ID, sellerID
	}
	withdraw := func(id, sellerID uuid.UUID) {
		require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
			return l.Withdraw(sellerID, now.Add(time.Minute))
		}))
	}

	cancelled, seller := newListing()
	withdraw(cancelled, seller)
	active, _ := newListing()
	marked, markedSeller := newListing()
	withdraw(marked, markedSeller)
	earlier := now.Add(-time.Hour).Truncate(time.Microsecond)
	_, err := db.Exec(`UPDATE listings SET withdrawal_started_at = $2 WHERE id = $1`, marked, earlier)
	require.NoError(t, err)

	before := map[uuid.UUID]withdrawalMarkRow{}
	for _, id := range []uuid.UUID{cancelled, active, marked} {
		before[id] = withdrawalMark(t, repo, id)
	}
	assert.Nil(t, before[cancelled].StartedAt, "the withdrawal's own write leaves it unmarked")

	for _, id := range []uuid.UUID{cancelled, active, marked, uuid.New()} {
		require.NoError(t, repo.MarkWithdrawalStarted(ctx, id), "a fenced-out mark is not an error")
	}

	got := withdrawalMark(t, repo, cancelled)
	require.NotNil(t, got.StartedAt, "an unmarked CANCELLED listing is marked")
	assert.WithinDuration(t, time.Now(), *got.StartedAt, time.Minute)
	assert.True(t, before[cancelled].UpdatedAt.Equal(got.UpdatedAt), "updated_at is the backstop's cursor and does not move")
	assert.Equal(t, before[cancelled].Version, got.Version, "the mark is not an aggregate change")

	assert.Nil(t, withdrawalMark(t, repo, active).StartedAt, "an ACTIVE listing is never marked")
	gotMarked := withdrawalMark(t, repo, marked)
	require.NotNil(t, gotMarked.StartedAt)
	assert.True(t, earlier.Equal(*gotMarked.StartedAt), "an already-marked listing keeps its first mark")
}
