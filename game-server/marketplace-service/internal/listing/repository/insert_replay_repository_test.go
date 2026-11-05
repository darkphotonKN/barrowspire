package repository

import (
	"context"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Inserting a listing whose id already exists is a replay of the same event, and
// says so (FS-04ZB6 Req 8, ADR-0050 rule 3). The table still holds one listing.
func TestListingRepository_InsertSameIDIsAReplay(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()

	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)
	require.NoError(t, repo.Insert(ctx, l))

	err = repo.Insert(ctx, l)

	require.ErrorIs(t, err, listing.ErrListingAlreadyExists)
	var count int
	require.NoError(t, db.Get(&count, `SELECT count(*) FROM listings WHERE id = $1`, l.Snapshot().ID))
	assert.Equal(t, 1, count)
}

// A different listing colliding on the same item breaks
// idx_one_active_listing_per_item. That is not a replay: it stays a duplicate,
// and never reads as the listing already existing.
func TestListingRepository_InsertOtherListingOnSameActiveItemIsNotAReplay(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()
	itemID := uuid.New()

	first, err := listing.NewListing(uuid.New(), uuid.New(), itemID, 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)
	require.NoError(t, repo.Insert(ctx, first))
	second, err := listing.NewListing(uuid.New(), uuid.New(), itemID, 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)

	err = repo.Insert(ctx, second)

	require.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
	assert.NotErrorIs(t, err, listing.ErrListingAlreadyExists)
}

// Postgres reports only the first unique index a row breaks, checked in index
// OID order. A replayed listing that is still ACTIVE breaks both listings_pkey
// and idx_one_active_listing_per_item, so once the primary key is rebuilt
// (REINDEX CONCURRENTLY gives it a new, higher OID) the partial index is the one
// reported. The insert must still read as a replay, never as a refusal, and a
// different listing on the same ACTIVE item must still be a duplicate.
func TestListingRepository_InsertAfterPrimaryKeyReindex(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()
	itemID := uuid.New()

	l, err := listing.NewListing(uuid.New(), uuid.New(), itemID, 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)
	require.NoError(t, repo.Insert(ctx, l))

	_, err = db.Exec(`REINDEX INDEX CONCURRENTLY listings_pkey`)
	require.NoError(t, err)
	var pkeyFirst bool
	require.NoError(t, db.Get(&pkeyFirst, `SELECT 'listings_pkey'::regclass::oid < 'idx_one_active_listing_per_item'::regclass::oid`))
	require.False(t, pkeyFirst, "the partial index must now be checked before the primary key")

	t.Run("same listing is still a replay", func(t *testing.T) {
		err := repo.Insert(ctx, l)

		require.ErrorIs(t, err, listing.ErrListingAlreadyExists)
		assert.NotErrorIs(t, err, commonconstants.ErrDuplicateResource)
		var count int
		require.NoError(t, db.Get(&count, `SELECT count(*) FROM listings WHERE id = $1`, l.Snapshot().ID))
		assert.Equal(t, 1, count)
	})

	t.Run("other listing on the same active item is still a duplicate", func(t *testing.T) {
		other, err := listing.NewListing(uuid.New(), uuid.New(), itemID, 100, nil, now, now.Add(time.Hour))
		require.NoError(t, err)

		err = repo.Insert(ctx, other)

		require.ErrorIs(t, err, commonconstants.ErrDuplicateResource)
		assert.NotErrorIs(t, err, listing.ErrListingAlreadyExists)
	})
}
