package query

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	commoncursor "github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The read is SQL — the seller filter, the order and the keyset boundary — so it
// runs against a real postgres. The DSN is supplied by the caller and the test
// skips when it is absent, like the other services' round-trip tests.
const (
	dsnEnv         = "MARKETPLACE_TEST_DB_DSN"
	testSchema     = "list_my_listings_test"
	listingsSchema = "../../../migrations/000001_create_listings_table.up.sql"
)

func listingsDB(t *testing.T) *sqlx.DB {
	t.Helper()

	if testing.Short() {
		t.Skip("the listings read needs a database; skipped under -short")
	}

	dsn := os.Getenv(dsnEnv)
	if dsn == "" {
		t.Skipf("set %s to a postgres the test may create a throwaway schema in", dsnEnv)
	}

	admin, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("no database reachable at %s: %v", dsnEnv, err)
	}
	defer func() { _ = admin.Close() }()

	_, err = admin.Exec(`DROP SCHEMA IF EXISTS ` + testSchema + ` CASCADE`)
	require.NoError(t, err)
	_, err = admin.Exec(`CREATE SCHEMA ` + testSchema)
	require.NoError(t, err)

	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	db, err := sqlx.Connect("postgres", dsn+separator+"search_path="+testSchema)
	require.NoError(t, err)

	ddl, err := os.ReadFile(listingsSchema)
	require.NoError(t, err)
	_, err = db.Exec(string(ddl))
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = db.Close()

		cleanup, err := sqlx.Connect("postgres", dsn)
		if err != nil {
			return
		}
		defer func() { _ = cleanup.Close() }()
		_, _ = cleanup.Exec(`DROP SCHEMA IF EXISTS ` + testSchema + ` CASCADE`)
	})

	return db
}

// insertListing writes a LISTED row for the seller created at the given time
// and returns its id.
func insertListing(t *testing.T, db *sqlx.DB, sellerID uuid.UUID, createdAt time.Time) uuid.UUID {
	t.Helper()

	id := uuid.New()
	_, err := db.Exec(`
		INSERT INTO listings (id, seller_id, item_id, start_price, status, ends_at, created_at, updated_at)
		VALUES ($1, $2, $3, 100, 'LISTED', $4, $5, $5)`,
		id, sellerID, uuid.New(), createdAt.Add(24*time.Hour), createdAt)
	require.NoError(t, err)

	return id
}

func TestListMyListingsReturnsOnlyTheSellersListingsNewestFirst(t *testing.T) {
	db := listingsDB(t)
	seller, other := uuid.New(), uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	oldest := insertListing(t, db, seller, base)
	newest := insertListing(t, db, seller, base.Add(2*time.Hour))
	middle := insertListing(t, db, seller, base.Add(time.Hour))
	insertListing(t, db, other, base.Add(3*time.Hour))

	page, err := NewListMyListingsQuery(db).Execute(context.Background(), seller, nil, 10)

	require.NoError(t, err)
	got := make([]uuid.UUID, 0, len(page.Listings))
	for _, l := range page.Listings {
		assert.Equal(t, seller, l.SellerID, "another member's listing leaked into the page")
		got = append(got, l.ID)
	}
	assert.Equal(t, []uuid.UUID{newest, middle, oldest}, got)
	assert.Empty(t, page.NextCursor, "everything fit, so there is no next page")
}

func TestListMyListingsSecondPageFollowsTheCursor(t *testing.T) {
	db := listingsDB(t)
	seller := uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	first := insertListing(t, db, seller, base.Add(3*time.Hour))
	second := insertListing(t, db, seller, base.Add(2*time.Hour))
	third := insertListing(t, db, seller, base.Add(time.Hour))

	q := NewListMyListingsQuery(db)

	page1, err := q.Execute(context.Background(), seller, nil, 2)
	require.NoError(t, err)
	require.Len(t, page1.Listings, 2)
	assert.Equal(t, first, page1.Listings[0].ID)
	assert.Equal(t, second, page1.Listings[1].ID)
	require.NotEmpty(t, page1.NextCursor)

	c, err := commoncursor.Decode(page1.NextCursor)
	require.NoError(t, err)

	page2, err := q.Execute(context.Background(), seller, c, 2)
	require.NoError(t, err)
	require.Len(t, page2.Listings, 1)
	assert.Equal(t, third, page2.Listings[0].ID)
	assert.Empty(t, page2.NextCursor)
}

// Two listings created in the same instant are split by id, so a page boundary
// between them neither repeats nor skips one.
func TestListMyListingsBreaksCreatedAtTiesByID(t *testing.T) {
	db := listingsDB(t)
	seller := uuid.New()
	same := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	a := insertListing(t, db, seller, same)
	b := insertListing(t, db, seller, same)

	q := NewListMyListingsQuery(db)
	page1, err := q.Execute(context.Background(), seller, nil, 1)
	require.NoError(t, err)
	c, err := commoncursor.Decode(page1.NextCursor)
	require.NoError(t, err)
	page2, err := q.Execute(context.Background(), seller, c, 1)
	require.NoError(t, err)

	require.Len(t, page1.Listings, 1)
	require.Len(t, page2.Listings, 1)
	assert.ElementsMatch(t, []uuid.UUID{a, b}, []uuid.UUID{page1.Listings[0].ID, page2.Listings[0].ID})
}

func TestListMyListingsAnswersAnEmptyPageForASellerWithNone(t *testing.T) {
	db := listingsDB(t)

	page, err := NewListMyListingsQuery(db).Execute(context.Background(), uuid.New(), nil, 10)

	require.NoError(t, err)
	assert.Empty(t, page.Listings)
	assert.Empty(t, page.NextCursor)
}

// The limit is bounded here as well as at the gateway: a caller that sends none
// (proto's zero) still gets a page rather than nothing or everything.
func TestListMyListingsBoundsTheLimit(t *testing.T) {
	db := listingsDB(t)
	seller := uuid.New()
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		insertListing(t, db, seller, base.Add(time.Duration(i)*time.Minute))
	}

	page, err := NewListMyListingsQuery(db).Execute(context.Background(), seller, nil, 0)

	require.NoError(t, err)
	assert.Len(t, page.Listings, 3, "an unset limit falls back to the default page size")
}
