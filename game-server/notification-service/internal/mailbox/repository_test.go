package mailbox

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The mailbox reads are SQL (who a letter is addressed to, expiry, the lazy
// state row), so they run against a real postgres. The DSN is the caller's and
// the test skips without it, like the other services' round-trip tests. Point
// it at a throwaway database: the test builds its own schema there.
const (
	dsnEnv         = "NOTIFICATION_TEST_DB_DSN"
	testSchema     = "mailbox_repo_test"
	migrationsGlob = "../../migrations/*.up.sql"
)

func mailboxDB(t *testing.T) *sqlx.DB {
	t.Helper()

	if testing.Short() {
		t.Skip("the mailbox repository needs a database; skipped under -short")
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
	// public stays on the path for the uuid-ossp functions migration 1 uses
	db, err := sqlx.Connect("postgres", dsn+separator+"search_path="+testSchema+",public")
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

var sentAt = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

func letterTo(member *uuid.UUID, sent time.Time, enclosures ...Enclosure) Letter {
	return Letter{
		ID:         uuid.New(),
		Title:      "From the Wardens",
		Body:       "Well met.",
		Sender:     SenderOfficial,
		MemberID:   member,
		Enclosures: enclosures,
		SentAt:     sent,
		ExpiresAt:  sent.Add(30 * 24 * time.Hour),
	}
}

func store(t *testing.T, db *sqlx.DB, letters ...Letter) {
	t.Helper()
	repo := NewRepository(db)
	err := commonutils.ExecTx(context.Background(), db, nil, func(tx *sqlx.Tx) error {
		return repo.InsertLetters(context.Background(), tx, letters)
	})
	require.NoError(t, err)
}

func countRows(t *testing.T, db *sqlx.DB, table string) int {
	t.Helper()
	var n int
	require.NoError(t, db.Get(&n, `SELECT COUNT(*) FROM `+table))
	return n
}

func ptr[T any](v T) *T { return &v }

var potion = &ItemSnapshot{
	TemplateID:    uuid.MustParse("6f1c1f43-6a4f-4d8a-9f43-2b9f0c4c0a11"),
	Name:          "Minor Healing Draught",
	ItemType:      "consumable",
	Rarity:        "normal",
	HealingAmount: ptr(int32(40)),
	ItemLevel:     1,
	RequiredLevel: 1,
	Affixes:       []Affix{},
}

var unique = &ItemSnapshot{
	TemplateID:       uuid.MustParse("0d7c5a0e-3a59-4d3c-8f0e-5a8d0e1c2b33"),
	Name:             "Barrow King's Edge",
	Description:      ptr("Cold iron."),
	ItemType:         "weapon",
	WeaponType:       ptr("sword"),
	Rarity:           "fabled",
	AttackPower:      ptr(int32(31)),
	CriticalRate:     ptr(7.5),
	ItemLevel:        40,
	RequiredLevel:    18,
	Affixes:          []Affix{{Stat: "attack_speed", Tier: 0, Value: 12}, {Stat: "crit_chance", Tier: 3, Value: 4}},
	UniqueEffectText: ptr("Strikes twice at dusk."),
}

func TestRepository_BroadcastIsVisibleWithoutAStateRow(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	broadcast := letterTo(nil, sentAt)
	store(t, db, broadcast)

	// a member who never read anything, the "signed up after the send" case
	member := uuid.New()
	got, err := repo.ListLetters(ctx, member, sentAt.Add(time.Hour), 50)
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, broadcast.ID, got[0].ID)
	assert.False(t, got[0].Read)

	assert.Equal(t, 1, countRows(t, db, "letters"), "a broadcast is one letter row")
	assert.Equal(t, 0, countRows(t, db, "letter_states"), "and no state rows")
}

func TestRepository_MarkReadCreatesOneStateRowPerLetterAndMember(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	broadcast := letterTo(nil, sentAt)
	store(t, db, broadcast)
	member := uuid.New()

	first := sentAt.Add(time.Minute)
	require.NoError(t, repo.MarkRead(ctx, broadcast.ID, member, first))
	require.NoError(t, repo.MarkRead(ctx, broadcast.ID, member, first.Add(time.Hour)))

	var rows []struct {
		ReadAt     time.Time `db:"read_at"`
		ClaimState string    `db:"claim_state"`
	}
	require.NoError(t, db.Select(&rows, `SELECT read_at, claim_state FROM letter_states WHERE letter_id = $1 AND member_id = $2`, broadcast.ID, member))
	require.Len(t, rows, 1, "exactly one state row for (letter, member)")
	assert.True(t, rows[0].ReadAt.Equal(first), "a repeat keeps the first read time")
	assert.Equal(t, "unclaimed", rows[0].ClaimState)

	got, err := repo.ListLetters(ctx, member, sentAt.Add(2*time.Hour), 50)
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.True(t, got[0].Read)

	other, err := repo.ListLetters(ctx, uuid.New(), sentAt.Add(2*time.Hour), 50)
	require.NoError(t, err)
	require.Len(t, other, 1)
	assert.False(t, other[0].Read, "another member's read is their own")
}

func TestRepository_ListShowsOnlyLettersAddressedToTheMemberOrToAll(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	a, b := uuid.New(), uuid.New()
	toA := letterTo(&a, sentAt)
	toB := letterTo(&b, sentAt.Add(time.Minute))
	toAll := letterTo(nil, sentAt.Add(2*time.Minute))
	store(t, db, toA, toB, toAll)

	got, err := repo.ListLetters(ctx, a, sentAt.Add(time.Hour), 50)
	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, toAll.ID, got[0].ID, "newest first")
	assert.Equal(t, toA.ID, got[1].ID)
}

func TestRepository_ListHidesExpiredLettersAndCapsAtTheLimit(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	member := uuid.New()
	var letters []Letter
	for i := 0; i < 52; i++ {
		letters = append(letters, letterTo(&member, sentAt.Add(time.Duration(i)*time.Minute)))
	}
	expired := letterTo(&member, sentAt.Add(-31*24*time.Hour))
	expired.ExpiresAt = sentAt.Add(-time.Hour)
	letters = append(letters, expired)
	store(t, db, letters...)

	got, err := repo.ListLetters(ctx, member, sentAt.Add(2*time.Hour), 50)
	require.NoError(t, err)
	require.Len(t, got, 50)
	assert.Equal(t, letters[51].ID, got[0].ID, "newest first")
	for _, l := range got {
		assert.NotEqual(t, expired.ID, l.ID)
	}
}

func TestRepository_LetterRoundTripsItsEnclosures(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	member := uuid.New()
	letter := letterTo(&member, sentAt,
		Enclosure{Kind: EnclosureItem, Quantity: 3, Item: potion},
		Enclosure{Kind: EnclosureItem, Quantity: 1, Item: unique},
		Enclosure{Kind: EnclosureGold, Gold: 500},
	)
	store(t, db, letter)

	got, err := repo.ListLetters(ctx, member, sentAt.Add(time.Hour), 50)
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, letter.Enclosures, got[0].Enclosures)
	assert.Equal(t, ClaimUnclaimed, got[0].ClaimState)
	assert.Equal(t, letter.Title, got[0].Title)
	assert.Equal(t, letter.Body, got[0].Body)
	assert.Equal(t, SenderOfficial, got[0].Sender)
	assert.True(t, letter.SentAt.Equal(got[0].SentAt))
	assert.True(t, letter.ExpiresAt.Equal(got[0].ExpiresAt))
}

func TestRepository_LetterWithoutEnclosuresHasNoClaimState(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	member := uuid.New()
	letter := letterTo(&member, sentAt)
	store(t, db, letter)
	require.NoError(t, repo.MarkRead(ctx, letter.ID, member, sentAt.Add(time.Minute)))

	got, err := repo.ListLetters(ctx, member, sentAt.Add(time.Hour), 50)
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, ClaimNone, got[0].ClaimState)
	assert.NotNil(t, got[0].Enclosures)
	assert.Empty(t, got[0].Enclosures)
}

// FS-1GZGD A6: a list send is one transaction; a failure part-way stores none.
func TestRepository_InsertLettersIsAllOrNone(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	a, b := uuid.New(), uuid.New()
	first := letterTo(&a, sentAt)
	second := letterTo(&b, sentAt)
	third := letterTo(&a, sentAt)
	third.ID = first.ID // the third insert collides with the first

	err := commonutils.ExecTx(ctx, db, nil, func(tx *sqlx.Tx) error {
		return repo.InsertLetters(ctx, tx, []Letter{first, second, third})
	})
	require.Error(t, err)
	assert.Equal(t, 0, countRows(t, db, "letters"), "no letter of the request is stored")
}

func TestRepository_SummaryCountsDirectAndBroadcastLetters(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()
	now := sentAt.Add(time.Hour)

	member := uuid.New()
	plainRead := letterTo(&member, sentAt)                                                            // read, nothing to claim: done
	plainUnread := letterTo(nil, sentAt.Add(time.Minute))                                             // unread broadcast
	goldRead := letterTo(&member, sentAt.Add(2*time.Minute), Enclosure{Kind: EnclosureGold, Gold: 5}) // read, unclaimed
	expired := letterTo(&member, sentAt.Add(-40*24*time.Hour), Enclosure{Kind: EnclosureGold, Gold: 5})
	expired.ExpiresAt = sentAt.Add(-time.Minute)
	toOther := letterTo(ptr(uuid.New()), sentAt.Add(3*time.Minute))
	store(t, db, plainRead, plainUnread, goldRead, expired, toOther)

	require.NoError(t, repo.MarkRead(ctx, plainRead.ID, member, now))
	require.NoError(t, repo.MarkRead(ctx, goldRead.ID, member, now))

	got, err := repo.Summary(ctx, member, now)
	require.NoError(t, err)
	assert.Equal(t, 1, got.Unread, "the broadcast")
	assert.Equal(t, 1, got.Unclaimed, "the gold letter")
	assert.Equal(t, 2, got.Waiting, "the broadcast and the gold letter")
	require.NotNil(t, got.NewestLetterAt)
	assert.True(t, goldRead.SentAt.Equal(*got.NewestLetterAt), "newest non-expired letter addressed to the member")
}

func TestRepository_SummaryOfAnEmptyMailbox(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)

	got, err := repo.Summary(context.Background(), uuid.New(), sentAt)
	require.NoError(t, err)
	assert.Equal(t, Summary{}, got)
}

func TestRepository_FindAddressedLetter(t *testing.T) {
	db := mailboxDB(t)
	repo := NewRepository(db)
	ctx := context.Background()

	a := uuid.New()
	toA := letterTo(&a, sentAt)
	toAll := letterTo(nil, sentAt)
	store(t, db, toA, toAll)

	got, err := repo.FindAddressed(ctx, toA.ID, a)
	require.NoError(t, err)
	assert.True(t, toA.ExpiresAt.Equal(got.ExpiresAt))

	_, err = repo.FindAddressed(ctx, toAll.ID, uuid.New())
	require.NoError(t, err, "a broadcast is addressed to everyone")

	_, err = repo.FindAddressed(ctx, toA.ID, uuid.New())
	assert.ErrorIs(t, err, ErrLetterNotFound, "another member's letter is not found")

	_, err = repo.FindAddressed(ctx, uuid.New(), a)
	assert.ErrorIs(t, err, ErrLetterNotFound)
}
