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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-S109X Req 3, 7: a withdrawal's bid change carries whether the bid was
// leading, so the status and the flag reach the table in one UPDATE.
func TestDiffListingCarriesWithdrawnWhileLeading(t *testing.T) {
	now := time.Now()
	member, rival := uuid.New(), uuid.New()
	outbid, leader := uuid.New(), uuid.New()
	l, err := listing.Reconstitute(listing.ReconstituteParams{
		ID: uuid.New(), SellerID: uuid.New(), ItemID: uuid.New(), StartPrice: 100,
		Status: listing.StatusActive, EndsAt: now.Add(time.Hour), CreatedAt: now, UpdatedAt: now,
		Bids: []*listing.BidReconstituteParams{
			{ID: outbid, MemberID: rival, Type: listing.BidTypeBid, Amount: 120, Status: listing.BidStatusOutbid, CreatedAt: now, UpdatedAt: now},
			{ID: leader, MemberID: member, Type: listing.BidTypeBid, Amount: 150, Status: listing.BidStatusWinning, CreatedAt: now, UpdatedAt: now},
		},
	})
	require.NoError(t, err)

	before := l.Snapshot()
	require.NoError(t, l.WithdrawBid(leader, member, now))
	after := l.Snapshot()

	changes := (&ListingRepository{}).diffListing(&before, &after)
	require.NotNil(t, changes)
	got := map[uuid.UUID]*bidChanges{}
	for _, c := range changes.bidsUpdated {
		got[c.id] = c
	}
	require.Contains(t, got, leader)
	require.Contains(t, got, outbid, "the runner-up's promotion is a bid change too")
	assert.True(t, got[leader].withdrawnWhileLeading, "the withdrawn leader counts")
	assert.False(t, got[outbid].withdrawnWhileLeading, "the promoted runner-up does not")
}

// storedWithdrawnWhileLeading reads the column straight from the table, so the
// test sees what was written, not what reconstitution makes of it.
func storedWithdrawnWhileLeading(t *testing.T, db *sqlx.DB, bidID uuid.UUID) bool {
	t.Helper()
	var v bool
	require.NoError(t, db.Get(&v, `SELECT withdrawn_while_leading FROM bids WHERE id = $1`, bidID))
	return v
}

// confirmedBid is the Update closure that places and confirms one bid.
func confirmedBid(bidID, member uuid.UUID, amount int, at time.Time) func(*listing.Listing) error {
	return func(l *listing.Listing) error {
		if err := l.PlaceBidWithID(bidID, member, amount, uuid.New(), at); err != nil {
			return err
		}
		return l.ConfirmBid(bidID, at)
	}
}

// FS-S109X Req 7: whether a withdrawal was leading survives both write paths
// (Save, the withdraw use case's; Update, the locked one) and both load paths.
func TestListingRepository_RoundTripsWithdrawnWhileLeading(t *testing.T) {
	db := repositoryDB(t)
	repo := NewListingRepository(db)
	ctx := context.Background()

	tests := []struct {
		name        string
		withdrawTop bool // withdraw the leader; otherwise the outbid bid
		viaSave     bool
		want        bool
	}{
		{"leading withdrawal via Save", true, true, true},
		{"leading withdrawal via Update", true, false, true},
		{"outbid withdrawal via Save", false, true, false},
		{"outbid withdrawal via Update", false, false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			now := time.Now()
			l, err := listing.NewListing(uuid.New(), uuid.New(), uuid.New(), 100, nil, now, now.Add(time.Hour))
			require.NoError(t, err)
			require.NoError(t, repo.Insert(ctx, l))
			id := l.Snapshot().ID

			outbid, outbidMember, leader, leaderMember := uuid.New(), uuid.New(), uuid.New(), uuid.New()
			require.NoError(t, repo.Update(ctx, id, confirmedBid(outbid, outbidMember, 120, now)))
			require.NoError(t, repo.Update(ctx, id, confirmedBid(leader, leaderMember, 150, now.Add(time.Second))))
			assert.False(t, storedWithdrawnWhileLeading(t, db, leader), "a new bid is stored false")
			assert.False(t, storedWithdrawnWhileLeading(t, db, outbid), "a demoted bid stays false")

			bidID, member := outbid, outbidMember
			if tt.withdrawTop {
				bidID, member = leader, leaderMember
			}
			at := now.Add(time.Minute)
			if tt.viaSave {
				current, err := repo.FindByID(ctx, id)
				require.NoError(t, err)
				before := current.Snapshot()
				require.NoError(t, current.WithdrawBid(bidID, member, at))
				require.NoError(t, repo.Save(ctx, current, before))
			} else {
				require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
					return l.WithdrawBid(bidID, member, at)
				}))
			}

			assert.Equal(t, tt.want, storedWithdrawnWhileLeading(t, db, bidID))

			got, err := repo.FindByID(ctx, id)
			require.NoError(t, err)
			assert.Equal(t, tt.want, flagOf(t, got, bidID), "FindByID reproduces the flag")

			require.NoError(t, repo.Update(ctx, id, func(l *listing.Listing) error {
				assert.Equal(t, tt.want, flagOf(t, l, bidID), "Update's load reproduces the flag")
				return nil
			}))
		})
	}
}

func flagOf(t *testing.T, l *listing.Listing, bidID uuid.UUID) bool {
	t.Helper()
	for _, b := range l.Snapshot().Bids {
		if b.ID == bidID {
			require.Equal(t, listing.BidStatusCancelled, b.Status)
			return b.WithdrawnWhileLeading
		}
	}
	t.Fatalf("bid %s not loaded", bidID)
	return false
}

// FS-S109X Req 5-6: 000012 adds the column NOT NULL DEFAULT false, marks every
// CANCELLED bid already there as a leading withdrawal and leaves the rest false;
// its down drops the column again.
func TestMigration000012_BackfillsCancelledBidsAndDropsCleanly(t *testing.T) {
	const schema = "bid_withdrawn_while_leading_migration_test"

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
	_, err = admin.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE; CREATE SCHEMA ` + schema)
	_ = admin.Close()
	require.NoError(t, err)

	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	db, err := sqlx.Connect("postgres", dsn+separator+"search_path="+schema)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = db.Exec(`DROP SCHEMA IF EXISTS ` + schema + ` CASCADE`)
		_ = db.Close()
	})

	apply := func(path string) {
		t.Helper()
		ddl, err := os.ReadFile(path)
		require.NoError(t, err)
		_, err = db.Exec(string(ddl))
		require.NoError(t, err, "applying %s", filepath.Base(path))
	}

	ups, err := filepath.Glob("../../../migrations/*.up.sql")
	require.NoError(t, err)
	sort.Strings(ups)
	const target = "000012_bid_withdrawn_while_leading"
	var up string
	for _, m := range ups {
		if strings.HasPrefix(filepath.Base(m), target) {
			up = m
			break
		}
		apply(m)
	}
	require.NotEmpty(t, up, "migration %s not found", target)

	// rows as they stood before 000012, one per status a bid can have
	now := time.Now()
	listingID := uuid.New()
	_, err = db.Exec(`INSERT INTO listings (id, seller_id, item_id, start_price, status, version, ends_at, created_at, updated_at)
		VALUES ($1, $2, $3, 100, 'ACTIVE', 0, $4, $4, $4)`, listingID, uuid.New(), uuid.New(), now.Add(time.Hour))
	require.NoError(t, err)
	statuses := []string{"PENDING", "WINNING", "OUTBID", "WON", "LOST", "CANCELLED", "FAILED", "CANCELLED"}
	ids := make([]uuid.UUID, len(statuses))
	for i, s := range statuses {
		ids[i] = uuid.New()
		_, err = db.Exec(`INSERT INTO bids (id, listing_id, member_id, type, amount, status, created_at, updated_at)
			VALUES ($1, $2, $3, 'BID', $4, $5, $6, $6)`, ids[i], listingID, uuid.New(), 110+i, s, now)
		require.NoError(t, err, "seeding a %s bid", s)
	}

	apply(up)

	var col struct {
		Nullable string  `db:"is_nullable"`
		Default  *string `db:"column_default"`
		Type     string  `db:"data_type"`
	}
	require.NoError(t, db.Get(&col, `SELECT is_nullable, column_default, data_type FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = 'bids' AND column_name = 'withdrawn_while_leading'`, schema))
	assert.Equal(t, "NO", col.Nullable)
	assert.Equal(t, "boolean", col.Type)
	require.NotNil(t, col.Default)
	assert.Equal(t, "false", *col.Default)

	for i, s := range statuses {
		var got bool
		require.NoError(t, db.Get(&got, `SELECT withdrawn_while_leading FROM bids WHERE id = $1`, ids[i]))
		assert.Equal(t, s == "CANCELLED", got, "a pre-existing %s bid", s)
	}

	// a row written after 000012 without naming the column takes the default
	fresh := uuid.New()
	_, err = db.Exec(`INSERT INTO bids (id, listing_id, member_id, type, amount, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'BID', 500, 'CANCELLED', $4, $4)`, fresh, listingID, uuid.New(), now)
	require.NoError(t, err)
	var freshFlag bool
	require.NoError(t, db.Get(&freshFlag, `SELECT withdrawn_while_leading FROM bids WHERE id = $1`, fresh))
	assert.False(t, freshFlag)

	apply(strings.TrimSuffix(up, ".up.sql") + ".down.sql")

	var remaining int
	require.NoError(t, db.Get(&remaining, `SELECT count(*) FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = 'bids' AND column_name = 'withdrawn_while_leading'`, schema))
	assert.Zero(t, remaining, "down drops the column")
}
