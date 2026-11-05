package usecase

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/query"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// backstopDB builds a throwaway schema from every up migration, like the query
// and repository packages' helpers, under its own schema name so the packages
// can run in parallel against one database. The withdraw backstop's guarantee
// lives in the SQL (the marker and its fence), so these tests run the real query
// and repository.
func backstopDB(t *testing.T) *sqlx.DB {
	t.Helper()

	const schema = "withdraw_backstop_test"

	if testing.Short() {
		t.Skip("needs a database; skipped under -short")
	}
	dsn := os.Getenv("MARKETPLACE_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("set MARKETPLACE_TEST_DB_DSN to a postgres the test may create a throwaway schema in")
	}
	admin, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("no database reachable: %v", err)
	}
	defer func() { _ = admin.Close() }()

	_, err = admin.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE; CREATE SCHEMA ` + schema)
	require.NoError(t, err)

	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	db, err := sqlx.Connect("postgres", dsn+separator+"search_path="+schema)
	require.NoError(t, err)

	migrations, err := filepath.Glob("../../../migrations/*.up.sql")
	require.NoError(t, err)
	require.NotEmpty(t, migrations)
	sort.Strings(migrations)
	for _, m := range migrations {
		ddl, err := os.ReadFile(m)
		require.NoError(t, err)
		_, err = db.Exec(string(ddl))
		require.NoError(t, err, "applying %s", filepath.Base(m))
	}

	t.Cleanup(func() {
		_ = db.Close()
		if cleanup, err := sqlx.Connect("postgres", dsn); err == nil {
			_, _ = cleanup.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`)
			_ = cleanup.Close()
		}
	})

	return db
}

// activeListingIn inserts an ACTIVE listing ending in an hour and returns it.
func activeListingIn(t *testing.T, repo *repository.ListingRepository, now time.Time) *listing.Listing {
	t.Helper()

	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, nil, now, now.Add(time.Hour))
	require.NoError(t, err)
	require.NoError(t, repo.Insert(context.Background(), l))
	return l
}

// FS-V7A5S Req 8 (amended 2026-11-05), the crash shape: the CANCELLED write
// committed but the start never ran, and the withdrawal is far older than any
// window would have reached. The backstop starts it and marks it; the next pass
// starts nothing.
func TestRestartListingWithdrawals_DB_StartsANeverStartedWithdrawalOfAnyAge(t *testing.T) {
	db := backstopDB(t)
	repo := repository.NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()

	l := activeListingIn(t, repo, now)
	id := l.Snapshot().ID
	require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
		return l.Withdraw(l.Snapshot().SellerID, now.Add(time.Minute))
	}))
	// the process died here: no start, no mark. Age the withdrawal past a month.
	_, err := db.Exec(`UPDATE listings SET updated_at = $2 WHERE id = $1`, id, now.Add(-30*24*time.Hour))
	require.NoError(t, err)

	starter := &recordingWithdrawalStarter{}
	backstop := NewRestartListingWithdrawalsUC(query.NewCancelledListingsQuery(db), starter, repo)

	require.NoError(t, backstop.Handle(ctx))
	assert.Equal(t, []uuid.UUID{id}, startedIDs(starter.started))
	assert.Equal(t, l.Snapshot().ItemID, starter.started[0].ItemID)

	require.NoError(t, backstop.Handle(ctx))
	assert.Len(t, starter.started, 1, "once marked, the next pass does not start it again")
}

// A withdrawal whose own start landed is marked by the use case, so the backstop
// never starts it; one whose start failed is left for the backstop, which starts
// it once.
func TestRestartListingWithdrawals_DB_AStartedWithdrawalIsNeverRestarted(t *testing.T) {
	db := backstopDB(t)
	repo := repository.NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()

	started := activeListingIn(t, repo, now)
	unstarted := activeListingIn(t, repo, now)
	withdraw := func(l *listing.Listing, starter ListingWithdrawalStarter) error {
		return NewWithdrawListingUC(repo, starter, repo).Handle(ctx, WithdrawListingCommand{
			ListingID: l.Snapshot().ID,
			MemberID:  l.Snapshot().SellerID,
			Now:       now.Add(time.Minute),
		})
	}
	require.NoError(t, withdraw(started, &recordingWithdrawalStarter{}))
	require.Error(t, withdraw(unstarted, &recordingWithdrawalStarter{failFor: map[uuid.UUID]error{
		unstarted.Snapshot().ID: assert.AnError,
	}}), "a failed start is transient")

	starter := &recordingWithdrawalStarter{}
	backstop := NewRestartListingWithdrawalsUC(query.NewCancelledListingsQuery(db), starter, repo)
	for range 3 {
		require.NoError(t, backstop.Handle(ctx))
	}

	assert.Equal(t, []uuid.UUID{unstarted.Snapshot().ID}, startedIDs(starter.started),
		"only the unstarted withdrawal, and only once across every pass")
}
