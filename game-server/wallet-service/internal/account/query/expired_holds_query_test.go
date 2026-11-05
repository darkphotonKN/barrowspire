package query

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"slices"
	"sort"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/wallet-service/internal/account/dto"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The candidate read is plain SQL against the database clock, so a fake cannot
// say anything about it. These run against wallet's real database, defaulting to
// the local compose values as the repository tests do, and skip when it is
// unreachable.
func walletDB(t *testing.T) *sqlx.DB {
	t.Helper()

	get := func(k, fallback string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return fallback
	}
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		get("DB_USER", "user"), get("DB_PASSWORD", "password"),
		get("DB_HOST", "localhost"), get("DB_PORT", "5225"),
		get("DB_NAME", "barrowspire_wallet_service_db"))

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("wallet database unreachable, skipping integration test: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// ancient is far enough in the past that holds seeded here are older than any a
// shared dev database already carries, so they are the first the query returns.
// RESERVED holds seeded at it are real sweep candidates: a dev wallet-service
// sweeping the same database mid-test can release them and flip a result.
var ancient = time.Date(1971, 1, 1, 0, 0, 0, 0, time.UTC)

type seedHold struct {
	status    string
	expiredAt time.Time
}

// seedHolds writes one account and the given holds straight to the tables, so the
// test depends only on the query under test. It returns their bid ids in order.
func seedHolds(t *testing.T, db *sqlx.DB, holds []seedHold) []uuid.UUID {
	t.Helper()

	accountID := uuid.New()
	now := time.Now()

	_, err := db.Exec(`INSERT INTO accounts (id, member_id, gold, version, created_at, updated_at)
		VALUES ($1, $2, 100000, 0, $3, $3)`, accountID, uuid.New(), now)
	require.NoError(t, err)

	// best effort: a failed cleanup leaves a stray row, never a wrong result
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM wallet_holds WHERE account_id = $1`, accountID)
		_, _ = db.Exec(`DELETE FROM accounts WHERE id = $1`, accountID)
	})

	bidIDs := make([]uuid.UUID, len(holds))
	for i, h := range holds {
		bidIDs[i] = uuid.New()
		_, err := db.Exec(`INSERT INTO wallet_holds (id, account_id, bid_id, status, amount, expired_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, 1, $5, $6, $6)`, uuid.New(), accountID, bidIDs[i], h.status, h.expiredAt, now)
		require.NoError(t, err)
	}

	return bidIDs
}

// Only a hold that still fences gold and has lapsed by the database clock is a
// candidate: a settled hold is past the Cancel's reach, a live one still backs a bid.
func TestExpiredHoldsQuery_ReturnsOnlyReservedHoldsPastExpiry(t *testing.T) {
	db := walletDB(t)
	bidIDs := seedHolds(t, db, []seedHold{
		{"RESERVED", ancient},
		{"RELEASED", ancient},
		{"COMMITTED", ancient},
		{"RESERVED", time.Now().Add(time.Hour)},
	})
	expired, released, committed, live := bidIDs[0], bidIDs[1], bidIDs[2], bidIDs[3]

	got := bidsOf(readAllExpired(t, NewExpiredHoldsQuery(db), 100))

	assert.Contains(t, got, expired)
	assert.NotContains(t, got, released)
	assert.NotContains(t, got, committed)
	assert.NotContains(t, got, live)
}

// readAllExpired pages through every candidate the way the sweep does.
func readAllExpired(t *testing.T, q *ExpiredHoldsQuery, limit int) []dto.ExpiredHold {
	t.Helper()

	var all []dto.ExpiredHold
	var after *dto.ExpiredHold
	for {
		page, err := q.Execute(context.Background(), after, limit)
		require.NoError(t, err)
		all = append(all, page...)
		if len(page) < limit {
			return all
		}
		after = &page[len(page)-1]
	}
}

func bidsOf(holds []dto.ExpiredHold) []uuid.UUID {
	bidIDs := make([]uuid.UUID, len(holds))
	for i, h := range holds {
		bidIDs[i] = h.BidID
	}
	return bidIDs
}

// A page is the oldest expiries first and exactly as large as the caller asks,
// above 100 included: the page size is the sweep's to set, and the query does
// not quietly cut it down.
func TestExpiredHoldsQuery_OldestExpiryFirst_PageOfTheSizeAsked(t *testing.T) {
	db := walletDB(t)
	holds := make([]seedHold, 101)
	for i := range holds {
		// seeded newest first, so insertion order cannot pass for expiry order
		holds[i] = seedHold{"RESERVED", ancient.Add(time.Duration(len(holds)-i) * time.Minute)}
	}
	bidIDs := seedHolds(t, db, holds)

	got, err := NewExpiredHoldsQuery(db).Execute(context.Background(), nil, len(holds))

	require.NoError(t, err)
	require.Len(t, got, len(holds))
	for i := range got {
		assert.Equal(t, bidIDs[len(bidIDs)-1-i], got[i].BidID, "position %d", i)
		assert.True(t, holds[len(holds)-1-i].expiredAt.Equal(got[i].ExpiredAt), "position %d carries its expiry", i)
	}
}

// Paging by keyset walks every candidate once, in (expired_at, bid_id) order:
// holds sharing an expiry are told apart by bid id, so a page boundary falling
// between them neither repeats nor skips one.
func TestExpiredHoldsQuery_KeysetPages_VisitEveryCandidateOnceInOrder(t *testing.T) {
	db := walletDB(t)
	holds := make([]seedHold, 7)
	for i := range holds {
		// three expiries, shared: pages of 2 split every tie
		holds[i] = seedHold{"RESERVED", ancient.Add(time.Duration(i/3) * time.Minute)}
	}
	bidIDs := seedHolds(t, db, holds)

	want := make([]uuid.UUID, len(bidIDs))
	copy(want, bidIDs)
	sort.Slice(want, func(a, b int) bool {
		ea, eb := holds[slices.Index(bidIDs, want[a])].expiredAt, holds[slices.Index(bidIDs, want[b])].expiredAt
		if !ea.Equal(eb) {
			return ea.Before(eb)
		}
		return bytes.Compare(want[a][:], want[b][:]) < 0
	})

	// the seeded holds are the oldest in the table, so they lead the walk
	got := bidsOf(readAllExpired(t, NewExpiredHoldsQuery(db), 2))

	require.GreaterOrEqual(t, len(got), len(want))
	assert.Equal(t, want, got[:len(want)])
}

// The page size has one owner, the sweep. A size the query cannot honor is the
// caller's mistake and is refused, not replaced by a default.
func TestExpiredHoldsQuery_PageSizeBelowOne_IsRefused(t *testing.T) {
	for _, limit := range []int{0, -1} {
		_, err := NewExpiredHoldsQuery(nil).Execute(context.Background(), nil, limit)

		assert.Error(t, err, "limit %d", limit)
	}
}
