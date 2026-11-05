package query

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/utils/cursor"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The read is SQL — the filter, the order and the keyset boundary — so it runs
// against a real postgres. The stale set is every RESERVED hold in the table, so
// the test builds its own schema rather than share wallet's database. The DSN is
// supplied by the caller and the test skips when it is absent.
const (
	dsnEnv         = "WALLET_TEST_DB_DSN"
	testSchema     = "stale_reserved_holds_test"
	migrationsGlob = "../../../migrations/*.up.sql"
)

func holdsDB(t *testing.T) *sqlx.DB {
	t.Helper()

	if testing.Short() {
		t.Skip("the stale holds read needs a database; skipped under -short")
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

	migrations, err := filepath.Glob(migrationsGlob)
	require.NoError(t, err)
	require.NotEmpty(t, migrations, "no migrations found at %s", migrationsGlob)
	sort.Strings(migrations)
	for _, m := range migrations {
		ddl, err := os.ReadFile(m)
		require.NoError(t, err)
		_, err = db.Exec(string(ddl))
		require.NoError(t, err, "applying %s", filepath.Base(m))
	}

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

// insertHold writes one hold for bidID created at createdAt, under its own
// account, straight to the tables.
func insertHold(t *testing.T, db *sqlx.DB, bidID uuid.UUID, status string, createdAt time.Time) {
	t.Helper()

	accountID := uuid.New()
	_, err := db.Exec(`INSERT INTO accounts (id, member_id, gold, version, created_at, updated_at)
		VALUES ($1, $2, 1000, 0, $3, $3)`, accountID, uuid.New(), createdAt)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO wallet_holds (id, account_id, bid_id, status, amount, expired_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, 300, $5, $6, $6)`,
		uuid.New(), accountID, bidID, status, createdAt.Add(24*time.Hour), createdAt)
	require.NoError(t, err)
}

// readAll pages through the stale set from the first page and answers every bid
// id in the order it was handed out, and how many pages it took.
func readAll(t *testing.T, q *StaleReservedHoldsQuery, before time.Time, limit int) ([]uuid.UUID, int) {
	t.Helper()

	var (
		all   []uuid.UUID
		after *cursor.Cursor
	)
	for pages := 1; pages <= 100; pages++ {
		page, err := q.Execute(context.Background(), before, after, limit)
		require.NoError(t, err)
		all = append(all, page.BidIDs...)
		if page.Next == nil {
			return all, pages
		}
		require.LessOrEqual(t, len(page.BidIDs), limit)
		after = page.Next
	}
	t.Fatal("paging did not end")
	return nil, 0
}

// FS-9BJCP Req 6, 7, 11: more stale holds than one page, many sharing one
// created_at, are each handed out exactly once, in (created_at, bid_id) order,
// with next set on every page but the last.
func TestStaleReservedHolds_PagesEveryHoldOnceInCreatedAtThenBidIDOrder(t *testing.T) {
	db := holdsDB(t)
	base := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)

	type row struct {
		bidID uuid.UUID
		at    time.Time
	}
	var want []row
	// 150 holds on one instant, then 60 a second later: ties straddle the page edge
	for i := 0; i < 150; i++ {
		want = append(want, row{uuid.New(), base})
	}
	for i := 0; i < 60; i++ {
		want = append(want, row{uuid.New(), base.Add(time.Second)})
	}
	for _, r := range want {
		insertHold(t, db, r.bidID, "RESERVED", r.at)
	}
	sort.Slice(want, func(i, j int) bool {
		if !want[i].at.Equal(want[j].at) {
			return want[i].at.Before(want[j].at)
		}
		return want[i].bidID.String() < want[j].bidID.String()
	})

	got, pages := readAll(t, NewStaleReservedHoldsQuery(db), time.Now(), 100)

	wantIDs := make([]uuid.UUID, len(want))
	for i, r := range want {
		wantIDs[i] = r.bidID
	}
	assert.Equal(t, wantIDs, got, "every hold once, (created_at, bid_id) order, no skip or repeat")
	assert.Equal(t, 3, pages)
}

// Req 7: a page that holds the last row answers no next, even when it is full.
func TestStaleReservedHolds_ExactlyAFullPage_AnswersNoNext(t *testing.T) {
	db := holdsDB(t)
	base := time.Now().Add(-time.Hour)
	for i := 0; i < 3; i++ {
		insertHold(t, db, uuid.New(), "RESERVED", base.Add(time.Duration(i)*time.Second))
	}

	page, err := NewStaleReservedHoldsQuery(db).Execute(context.Background(), time.Now(), nil, 3)

	require.NoError(t, err)
	assert.Len(t, page.BidIDs, 3)
	assert.Nil(t, page.Next)
}

// Req 6: the page starts strictly after the position, so the row the position
// names is not handed out again.
func TestStaleReservedHolds_After_StartsStrictlyAfterThePosition(t *testing.T) {
	db := holdsDB(t)
	base := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	first, second := uuid.New(), uuid.New()
	insertHold(t, db, first, "RESERVED", base)
	insertHold(t, db, second, "RESERVED", base.Add(time.Second))

	page, err := NewStaleReservedHoldsQuery(db).Execute(context.Background(), time.Now(),
		&cursor.Cursor{CreatedAt: base, ID: first}, 100)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{second}, page.BidIDs)
	assert.Nil(t, page.Next)
}

// Req 6: the existing clamp is kept: a limit of zero, below zero or above 100
// reads 100.
func TestStaleReservedHolds_LimitIsClampedTo100(t *testing.T) {
	db := holdsDB(t)
	base := time.Now().Add(-time.Hour)
	for i := 0; i < 101; i++ {
		insertHold(t, db, uuid.New(), "RESERVED", base)
	}
	q := NewStaleReservedHoldsQuery(db)

	for _, limit := range []int{0, -1, 500} {
		page, err := q.Execute(context.Background(), time.Now(), nil, limit)
		require.NoError(t, err)
		assert.Len(t, page.BidIDs, 100, "limit %d", limit)
		assert.NotNil(t, page.Next, "limit %d: a 101st row follows", limit)
	}
}

// Req 8: the filter is unchanged: only RESERVED holds placed before the cutoff.
func TestStaleReservedHolds_OnlyReservedHoldsBeforeTheCutoff(t *testing.T) {
	db := holdsDB(t)
	cutoff := time.Now().Add(-10 * time.Minute)
	stale := uuid.New()
	insertHold(t, db, stale, "RESERVED", cutoff.Add(-time.Minute))
	insertHold(t, db, uuid.New(), "RESERVED", cutoff.Add(time.Minute))
	insertHold(t, db, uuid.New(), "RELEASED", cutoff.Add(-time.Minute))
	insertHold(t, db, uuid.New(), "COMMITTED", cutoff.Add(-time.Minute))

	page, err := NewStaleReservedHoldsQuery(db).Execute(context.Background(), cutoff, nil, 100)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{stale}, page.BidIDs)
	assert.Nil(t, page.Next)
}
