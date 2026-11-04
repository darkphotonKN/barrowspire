package mailbox

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
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
	db := emptyMailboxSchema(t)
	migrateUp(t, db, latestMigration)
	return db
}

// emptyMailboxSchema answers a connection to a fresh throwaway schema with no
// migration applied, dropped when the test ends.
func emptyMailboxSchema(t *testing.T) *sqlx.DB {
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

// latestMigration asks migrateUp for every migration there is.
const latestMigration = math.MaxInt

// migrateUp applies, in order, the up file of every migration numbered at
// most through.
func migrateUp(t *testing.T, db *sqlx.DB, through int) {
	t.Helper()

	migrations, err := filepath.Glob(migrationsGlob)
	require.NoError(t, err)
	require.NotEmpty(t, migrations, "no migrations found at %s", migrationsGlob)
	sort.Strings(migrations)
	for _, m := range migrations {
		if migrationVersion(t, m) > through {
			break
		}
		applyMigration(t, db, m)
	}
}

// migrateDown applies the down file of one migration.
func migrateDown(t *testing.T, db *sqlx.DB, version int) {
	t.Helper()

	files, err := filepath.Glob(fmt.Sprintf("../../migrations/%06d_*.down.sql", version))
	require.NoError(t, err)
	require.Len(t, files, 1, "one down file for migration %d", version)
	applyMigration(t, db, files[0])
}

func migrationVersion(t *testing.T, path string) int {
	t.Helper()
	version, err := strconv.Atoi(strings.SplitN(filepath.Base(path), "_", 2)[0])
	require.NoError(t, err, "migration %s has no numeric version", path)
	return version
}

func applyMigration(t *testing.T, db *sqlx.DB, path string) {
	t.Helper()
	ddl, err := os.ReadFile(path)
	require.NoError(t, err)
	_, err = db.Exec(string(ddl))
	require.NoError(t, err, "applying %s", filepath.Base(path))
}

var sentAt = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

// wardensAdmin is the admin every stored test letter records as its sender.
var wardensAdmin = uuid.MustParse("5b0f3e8a-2c4d-4e6f-8a1b-9c0d1e2f3a4b")

func letterTo(member *uuid.UUID, sent time.Time, enclosures ...Enclosure) Letter {
	return Letter{
		ID:         uuid.New(),
		Title:      "From the Wardens",
		Body:       "Well met.",
		Sender:     SenderOfficial,
		SentBy:     SentBy{MemberID: &wardensAdmin},
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

// The sent-by audit (FS-1GZGD A7.2, R53-R56).

const sentByCheck = "letters_sent_by_matches_sender"

// sentByRow is a letter's sent-by audit as an operator reads it.
type sentByRow struct {
	Sender   string         `db:"sender"`
	MemberID uuid.NullUUID  `db:"sent_by_member_id"`
	Source   sql.NullString `db:"sent_by_source"`
}

func sentByOf(t *testing.T, db *sqlx.DB, letterID uuid.UUID) sentByRow {
	t.Helper()
	var row sentByRow
	require.NoError(t, db.Get(&row,
		`SELECT sender, sent_by_member_id, sent_by_source FROM letters WHERE id = $1`, letterID))
	return row
}

func sentByColumns(t *testing.T, db *sqlx.DB) int {
	t.Helper()
	var n int
	require.NoError(t, db.Get(&n, `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = 'letters'
		  AND column_name IN ('sent_by_member_id', 'sent_by_source')`, testSchema))
	return n
}

// sentByCheckValidated answers whether the sent-by CHECK exists and, if so,
// whether postgres has checked the rows already stored against it.
func sentByCheckValidated(t *testing.T, db *sqlx.DB) (exists, validated bool) {
	t.Helper()
	var rows []bool
	require.NoError(t, db.Select(&rows, `
		SELECT c.convalidated FROM pg_constraint c
		JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = $1 AND c.conname = $2`, testSchema, sentByCheck))
	if len(rows) == 0 {
		return false, false
	}
	return true, rows[0]
}

// insertRawLetter stores a letters row by hand, without the sent-by columns,
// the way a row stored before migration 000006 looks.
func insertRawLetter(t *testing.T, db *sqlx.DB, sender string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := db.Exec(`
		INSERT INTO letters (id, title, body, sender, member_id, sent_at, expires_at)
		VALUES ($1, 'From the Wardens', 'Well met.', $2, NULL, $3, $4)`,
		id, sender, sentAt, sentAt.Add(time.Hour))
	require.NoError(t, err)
	return id
}

func TestMigration000006_LettersStoredBeforeItKeepBothSentByColumnsNull(t *testing.T) {
	db := emptyMailboxSchema(t)
	migrateUp(t, db, 5)
	official := insertRawLetter(t, db, "official")
	system := insertRawLetter(t, db, "system")

	migrateUp(t, db, 6)

	for _, id := range []uuid.UUID{official, system} {
		row := sentByOf(t, db, id)
		assert.False(t, row.MemberID.Valid, "no backfill of the member id")
		assert.False(t, row.Source.Valid, "no backfill of the source")
	}
	assert.Equal(t, 2, countRows(t, db, "letters"), "nothing is deleted")
	exists, validated := sentByCheckValidated(t, db)
	assert.True(t, exists)
	assert.False(t, validated, "the CHECK is added NOT VALID: earlier rows are not checked")
}

func TestMigration000006_UpDownUp(t *testing.T) {
	db := mailboxDB(t)
	assert.Equal(t, 2, sentByColumns(t, db))

	migrateDown(t, db, 6)
	assert.Equal(t, 0, sentByColumns(t, db), "down drops both columns")
	exists, _ := sentByCheckValidated(t, db)
	assert.False(t, exists, "down drops the CHECK")
	insertRawLetter(t, db, "official")

	migrateUp(t, db, 6)
	assert.Equal(t, 2, sentByColumns(t, db))
	exists, validated := sentByCheckValidated(t, db)
	assert.True(t, exists)
	assert.False(t, validated)
}

func TestRepository_SentByCheckRefusesARowThatDoesNotMatchItsSender(t *testing.T) {
	admin := uuid.New()
	tests := []struct {
		name     string
		sender   string
		memberID *uuid.UUID
		source   *string
		refused  bool
	}{
		{"official with the admin", "official", &admin, nil, false},
		{"system with a source", "system", nil, ptr("test.compensation"), false},
		{"official without a member id", "official", nil, nil, true},
		{"official with a source", "official", &admin, ptr("test.compensation"), true},
		{"system without a source", "system", nil, nil, true},
		{"system with a member id", "system", &admin, ptr("test.compensation"), true},
	}
	db := mailboxDB(t)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := db.Exec(`
				INSERT INTO letters (id, title, body, sender, member_id, sent_at, expires_at, sent_by_member_id, sent_by_source)
				VALUES ($1, 'From the Wardens', 'Well met.', $2, NULL, $3, $4, $5, $6)`,
				uuid.New(), tt.sender, sentAt, sentAt.Add(time.Hour), tt.memberID, tt.source)
			if !tt.refused {
				require.NoError(t, err)
				return
			}
			var pqErr *pq.Error
			require.ErrorAs(t, err, &pqErr)
			assert.Equal(t, pq.ErrorCode("23514"), pqErr.Code, "a check violation")
			assert.Equal(t, sentByCheck, pqErr.Constraint)
		})
	}
}

func TestRepository_InsertLettersStoresEachLettersSentBy(t *testing.T) {
	db := mailboxDB(t)
	admin := uuid.New()
	member := uuid.New()

	official := letterTo(&member, sentAt)
	official.SentBy = SentBy{MemberID: &admin}
	system := letterTo(nil, sentAt)
	system.Sender = SenderSystem
	system.SentBy = SentBy{Source: "test.compensation"}
	store(t, db, official, system)

	got := sentByOf(t, db, official.ID)
	assert.Equal(t, uuid.NullUUID{UUID: admin, Valid: true}, got.MemberID)
	assert.False(t, got.Source.Valid)

	got = sentByOf(t, db, system.ID)
	assert.False(t, got.MemberID.Valid)
	assert.Equal(t, sql.NullString{String: "test.compensation", Valid: true}, got.Source)
}

// R55 through the real store: an admin's list send records the token's member
// on every stored row.
func TestSendLetterDB_EveryStoredLetterRecordsTheAdminFromTheToken(t *testing.T) {
	db := mailboxDB(t)
	svc := NewService(db, NewRepository(db), &fakeItems{}, &fakeWallet{}, &fakeArrivals{})
	caller := commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RoleAdmin}

	sent, err := svc.SendLetter(context.Background(), caller, LetterDraft{
		Recipient: Recipient{Kind: RecipientMemberList, MemberIDs: []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}},
		Title:     "From the Wardens",
		Body:      "Well met.",
	})
	require.NoError(t, err)

	require.Len(t, sent.Letters, 3)
	for _, l := range sent.Letters {
		got := sentByOf(t, db, l.LetterID)
		assert.Equal(t, "official", got.Sender)
		assert.Equal(t, uuid.NullUUID{UUID: caller.MemberID, Valid: true}, got.MemberID)
		assert.False(t, got.Source.Valid)
	}
}
