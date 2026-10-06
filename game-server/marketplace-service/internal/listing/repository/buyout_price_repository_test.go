package repository

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// repositoryDB builds a throwaway schema from every up migration, the same way
// the query package's listingsDB does, under its own schema name so the two
// packages can run in parallel against one database.
func repositoryDB(t *testing.T) *sqlx.DB {
	t.Helper()

	const schema = "listing_repository_test"

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

// A listing keeps its buyout price, or its lack of one, across Insert and
// FindByID (FS-9XKS6 Req 8).
func TestListingRepository_RoundTripsTheBuyoutPrice(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	buyout := 500

	tests := []struct {
		name   string
		buyout *int
	}{
		{"set", &buyout},
		{"none", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, tt.buyout, now, now.Add(time.Hour))
			require.NoError(t, err)
			require.NoError(t, repo.Insert(context.Background(), l))

			got, err := repo.FindByID(context.Background(), l.Snapshot().ID)

			require.NoError(t, err)
			assert.Equal(t, tt.buyout, got.Snapshot().BuyoutPrice)
		})
	}
}

// A buyout demotes the incumbent and inserts a WINNING bid in one write. The
// demotion has to reach the table before the insert, or idx_bids_single_winner
// refuses the buyout (FS-NXP1W Req 4, 21).
func TestListingRepository_BuyoutOverIncumbentPersists(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	ctx := context.Background()
	now := time.Now()
	buyout := 500

	l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, &buyout, now, now.Add(time.Hour))
	require.NoError(t, err)
	require.NoError(t, repo.Insert(ctx, l))
	id := l.Snapshot().ID

	incumbent := uuid.New()
	require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
		if err := l.PlaceBidWithID(incumbent, uuid.New(), 200, uuid.New(), now); err != nil {
			return err
		}
		return l.ConfirmBid(incumbent, now)
	}))

	buyoutBid := uuid.New()
	require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
		return l.Buyout(buyoutBid, uuid.New(), now)
	}))

	got, err := repo.FindByID(ctx, id)
	require.NoError(t, err)
	statuses := map[uuid.UUID]listing.BidStatus{}
	for _, b := range got.Snapshot().Bids {
		statuses[b.ID] = b.Status
	}
	assert.Equal(t, listing.BidStatusOutbid, statuses[incumbent])
	assert.Equal(t, listing.BidStatusWinning, statuses[buyoutBid])
}
