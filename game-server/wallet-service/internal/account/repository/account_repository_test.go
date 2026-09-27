package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FindByBidID is plain SQL, so a fake cannot say anything about it. These run
// against wallet's real database, defaulting to the local compose values the
// same way the usecase integration tests do, and skip when it is unreachable.
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

// seedAccountWithHold writes an account and one reserved hold straight to the
// tables, bypassing PlaceHold, so this test depends only on the query under test.
func seedAccountWithHold(t *testing.T, db *sqlx.DB, bidID uuid.UUID) uuid.UUID {
	t.Helper()

	accountID := uuid.New()
	now := time.Now()

	_, err := db.Exec(`INSERT INTO accounts (id, member_id, gold, version, created_at, updated_at)
		VALUES ($1, $2, 1000, 0, $3, $3)`, accountID, uuid.New(), now)
	require.NoError(t, err)

	_, err = db.Exec(`INSERT INTO wallet_holds (id, account_id, bid_id, status, amount, expired_at, created_at, updated_at)
		VALUES ($1, $2, $3, 'RESERVED', 300, $4, $5, $5)`, uuid.New(), accountID, bidID, now.Add(time.Hour), now)
	require.NoError(t, err)

	// best effort: a failed cleanup leaves a stray row, never a wrong result
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM wallet_holds WHERE account_id = $1`, accountID)
		_, _ = db.Exec(`DELETE FROM accounts WHERE id = $1`, accountID)
	})

	return accountID
}

func TestFindByBidID_LoadsTheAccountHoldingTheBid(t *testing.T) {
	db := walletDB(t)
	bidID := uuid.New()
	accountID := seedAccountWithHold(t, db, bidID)

	acc, err := NewAccountRepository(db).FindByBidID(context.Background(), bidID)

	require.NoError(t, err)
	snap := acc.Snapshot()
	assert.Equal(t, accountID, snap.ID)
	require.Len(t, snap.WalletHolds, 1)
	assert.Equal(t, bidID, snap.WalletHolds[0].BidID)
}

func TestFindByBidID_UnknownBid_IsNotFound(t *testing.T) {
	db := walletDB(t)

	_, err := NewAccountRepository(db).FindByBidID(context.Background(), uuid.New())

	assert.ErrorIs(t, err, commonconstants.ErrNotFound)
}
