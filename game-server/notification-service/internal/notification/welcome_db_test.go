package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/inbox"
	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/mailbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The welcome letter against a real postgres (FS-1GZGD R57-R62, A8): the
// inbox mark, the signup notification and the welcome letter commit or roll
// back together across processed_events, notifications and letters, through
// the real notification repository, inbox and mailbox store. items and the
// arrival publisher are fakes. Skips without NOTIFICATION_TEST_DB_DSN.

const welcomeTestSchema = "notification_welcome_test"

func welcomeDB(t *testing.T) *sqlx.DB {
	t.Helper()
	if testing.Short() {
		t.Skip("the welcome round trip needs a database; skipped under -short")
	}
	dsn := os.Getenv("NOTIFICATION_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("set NOTIFICATION_TEST_DB_DSN to a postgres the test may create a throwaway schema in")
	}
	admin, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Skipf("no database reachable at NOTIFICATION_TEST_DB_DSN: %v", err)
	}
	defer func() { _ = admin.Close() }()
	_, err = admin.Exec(`DROP SCHEMA IF EXISTS ` + welcomeTestSchema + ` CASCADE`)
	require.NoError(t, err)
	_, err = admin.Exec(`CREATE SCHEMA ` + welcomeTestSchema)
	require.NoError(t, err)

	separator := "?"
	if strings.Contains(dsn, "?") {
		separator = "&"
	}
	// public stays on the path for the uuid-ossp functions migration 1 uses
	db, err := sqlx.Connect("postgres", dsn+separator+"search_path="+welcomeTestSchema+",public")
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = db.Close()
		cleanup, err := sqlx.Connect("postgres", dsn)
		if err != nil {
			return
		}
		defer func() { _ = cleanup.Close() }()
		_, _ = cleanup.Exec(`DROP SCHEMA IF EXISTS ` + welcomeTestSchema + ` CASCADE`)
	})

	migrations, err := filepath.Glob("../../migrations/*.up.sql")
	require.NoError(t, err)
	require.NotEmpty(t, migrations)
	sort.Strings(migrations)
	for _, m := range migrations {
		ddl, err := os.ReadFile(m)
		require.NoError(t, err)
		_, err = db.Exec(string(ddl))
		require.NoError(t, err, "applying %s", filepath.Base(m))
	}
	return db
}

// potionItems resolves every template to a potion snapshot, unless down or
// refusing. It is never asked for instances or grants here.
type potionItems struct {
	calls   int
	down    bool
	refuse  bool
	missing bool
}

// welcomePotionID is the id the test catalogue gives the welcome potion's name.
var welcomePotionID = uuid.MustParse("aa0e8400-e29b-41d4-a716-446655440006")

// FindTemplateByName answers the welcome potion's id, unless down or missing from the catalogue
// (FS-1GZGD A10). It does not count as a resolve.
func (p *potionItems) FindTemplateByName(_ context.Context, name string) (uuid.UUID, bool, error) {
	if p.down {
		return uuid.Nil, false, mailbox.ErrItemsUnavailable
	}
	if p.missing || name != mailbox.DefaultWelcomeGiftName {
		return uuid.Nil, false, nil
	}
	return welcomePotionID, true, nil
}

func (p *potionItems) ResolveItemSnapshots(_ context.Context, templates []mailbox.TemplateRef, _ []uuid.UUID) (*mailbox.Resolution, error) {
	p.calls++
	if p.down {
		return nil, mailbox.ErrItemsUnavailable
	}
	res := &mailbox.Resolution{}
	for _, t := range templates {
		if p.refuse {
			res.Templates = append(res.Templates, nil)
			res.UnknownTemplateIDs = append(res.UnknownTemplateIDs, t.TemplateID)
			continue
		}
		heal := int32(50)
		res.Templates = append(res.Templates, &mailbox.ItemSnapshot{
			TemplateID: t.TemplateID, Name: "Small Health Potion", ItemType: "consumable",
			Rarity: "normal", HealingAmount: &heal, ItemLevel: 1, RequiredLevel: 1, Affixes: []mailbox.Affix{},
		})
	}
	return res, nil
}

func (p *potionItems) GrantItems(context.Context, string, []mailbox.ItemGrant) (*mailbox.Grant, error) {
	return nil, errors.New("potionItems: no grants in the welcome tests")
}

type recordedArrivals struct{ batches [][]mailbox.Letter }

func (r *recordedArrivals) PublishArrivals(_ context.Context, letters []mailbox.Letter) {
	r.batches = append(r.batches, letters)
}

// failingInsert is the real mailbox store whose letter insert fails, so the
// test sees the rollback undo the inbox mark and the notification.
type failingInsert struct{ mailbox.Repository }

func (failingInsert) InsertLetters(context.Context, sqlx.ExtContext, []mailbox.Letter) error {
	return errors.New("forced letter insert failure")
}

type welcomeRig struct {
	db       *sqlx.DB
	items    *potionItems
	arrivals *recordedArrivals
	svc      *service
}

func newWelcomeRig(t *testing.T, failInsert bool) *welcomeRig {
	t.Helper()
	db := welcomeDB(t)
	var letters mailbox.Repository = mailbox.NewRepository(db)
	if failInsert {
		letters = failingInsert{letters}
	}
	rig := &welcomeRig{db: db, items: &potionItems{}, arrivals: &recordedArrivals{}}
	inboxRepo := inbox.NewRepo()
	mailboxService := mailbox.NewService(db, letters, rig.items, nil, rig.arrivals, inboxRepo, 8).
		WithWelcomeGift(rig.items, "")
	rig.svc = NewService(db, NewRepository(db), inboxRepo, nil, mailboxService)
	return rig
}

func (r *welcomeRig) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	require.NoError(t, r.db.Get(&n, query, args...))
	return n
}

func (r *welcomeRig) processed(t *testing.T, eventID uuid.UUID) int {
	return r.count(t, `SELECT COUNT(*) FROM processed_events WHERE event_id = $1 AND event_type = $2`,
		eventID, commonconstants.MemberSignedUpEvent)
}

func (r *welcomeRig) notifications(t *testing.T, member uuid.UUID) int {
	return r.count(t, `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND event_type = $2`,
		member, commonconstants.MemberSignedUpEvent)
}

type welcomeRow struct {
	Title      string         `db:"title"`
	Sender     string         `db:"sender"`
	SentBy     sql.NullString `db:"sent_by_source"`
	SentByID   *uuid.UUID     `db:"sent_by_member_id"`
	Enclosures []byte         `db:"enclosures"`
	Days       float64        `db:"days"`
}

func (r *welcomeRig) welcomes(t *testing.T, member uuid.UUID) []welcomeRow {
	t.Helper()
	var rows []welcomeRow
	require.NoError(t, r.db.Select(&rows, `
		SELECT title, sender, sent_by_source, sent_by_member_id, enclosures,
		       EXTRACT(EPOCH FROM expires_at - sent_at) / 86400 AS days
		FROM letters WHERE member_id = $1`, member))
	return rows
}

func enclosureKinds(t *testing.T, raw []byte) []mailbox.Enclosure {
	t.Helper()
	var enclosures []mailbox.Enclosure
	require.NoError(t, json.Unmarshal(raw, &enclosures))
	return enclosures
}

func TestProcessMemberSignedUpDB_StoresMarkNotificationAndWelcomeOnce(t *testing.T) {
	rig := newWelcomeRig(t, false)
	eventID, member := uuid.New(), uuid.New()
	event := signedUp(eventID, member)

	require.NoError(t, rig.svc.ProcessMemberSignedUp(context.Background(), event))
	err := rig.svc.ProcessMemberSignedUp(context.Background(), event)

	assert.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed)
	assert.Equal(t, 1, rig.processed(t, eventID))
	assert.Equal(t, 1, rig.notifications(t, member))
	rows := rig.welcomes(t, member)
	require.Len(t, rows, 1, "exactly one welcome however often the event is delivered")
	assert.Equal(t, "The Town Keeps a Fire for You", rows[0].Title)
	assert.Equal(t, "system", rows[0].Sender)
	assert.Equal(t, sql.NullString{String: "welcome", Valid: true}, rows[0].SentBy)
	assert.Nil(t, rows[0].SentByID)
	assert.InDelta(t, 30, rows[0].Days, 0.0001)
	enclosures := enclosureKinds(t, rows[0].Enclosures)
	require.Len(t, enclosures, 2)
	assert.Equal(t, int32(3), enclosures[0].Quantity)
	require.NotNil(t, enclosures[0].Item)
	assert.Equal(t, welcomePotionID, enclosures[0].Item.TemplateID)
	assert.Equal(t, int64(100), enclosures[1].Gold)

	assert.Equal(t, 1, rig.items.calls, "the redelivery called no items RPC")
	require.Len(t, rig.arrivals.batches, 1, "announced once")
	assert.Equal(t, member, *rig.arrivals.batches[0][0].MemberID)

	// a second account in the same process uses the cached potion
	other := uuid.New()
	require.NoError(t, rig.svc.ProcessMemberSignedUp(context.Background(), signedUp(uuid.New(), other)))
	assert.Len(t, rig.welcomes(t, other), 1)
	assert.Equal(t, 1, rig.items.calls)
	assert.Len(t, rig.arrivals.batches, 2)
}

func TestProcessMemberSignedUpDB_ItemsDownOnAColdCacheStoresNothingUntilRetried(t *testing.T) {
	rig := newWelcomeRig(t, false)
	rig.items.down = true
	eventID, member := uuid.New(), uuid.New()

	err := rig.svc.ProcessMemberSignedUp(context.Background(), signedUp(eventID, member))

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Zero(t, rig.processed(t, eventID))
	assert.Zero(t, rig.notifications(t, member))
	assert.Empty(t, rig.welcomes(t, member))
	assert.Empty(t, rig.arrivals.batches)

	rig.items.down = false
	require.NoError(t, rig.svc.ProcessMemberSignedUp(context.Background(), signedUp(eventID, member)))
	assert.Equal(t, 1, rig.processed(t, eventID))
	assert.Equal(t, 1, rig.notifications(t, member))
	rows := rig.welcomes(t, member)
	require.Len(t, rows, 1)
	assert.Len(t, enclosureKinds(t, rows[0].Enclosures), 2)
	assert.Len(t, rig.arrivals.batches, 1)
}

func TestProcessMemberSignedUpDB_RefusedPotionStoresAGoldOnlyWelcome(t *testing.T) {
	rig := newWelcomeRig(t, false)
	rig.items.refuse = true
	eventID, member := uuid.New(), uuid.New()

	require.NoError(t, rig.svc.ProcessMemberSignedUp(context.Background(), signedUp(eventID, member)))

	assert.Equal(t, 1, rig.processed(t, eventID))
	assert.Equal(t, 1, rig.notifications(t, member))
	rows := rig.welcomes(t, member)
	require.Len(t, rows, 1)
	assert.Equal(t, []mailbox.Enclosure{{Kind: mailbox.EnclosureGold, Gold: 100}}, enclosureKinds(t, rows[0].Enclosures))
	assert.Len(t, rig.arrivals.batches, 1)
}

func TestProcessMemberSignedUpDB_LetterInsertFailureRollsBackMarkAndNotification(t *testing.T) {
	rig := newWelcomeRig(t, true)
	eventID, member := uuid.New(), uuid.New()

	err := rig.svc.ProcessMemberSignedUp(context.Background(), signedUp(eventID, member))

	require.Error(t, err)
	assert.Zero(t, rig.processed(t, eventID), "the inbox mark rolled back")
	assert.Zero(t, rig.notifications(t, member), "the notification rolled back")
	assert.Zero(t, rig.count(t, `SELECT COUNT(*) FROM letters`))
	assert.Empty(t, rig.arrivals.batches)
}

// The potion's name is not in this environment's catalogue: signup still commits, and the welcome
// carries its gold only (FS-1GZGD A10).
func TestProcessMemberSignedUpDB_PotionNotInTheCatalogueStoresAGoldOnlyWelcome(t *testing.T) {
	rig := newWelcomeRig(t, false)
	rig.items.missing = true
	eventID, member := uuid.New(), uuid.New()

	require.NoError(t, rig.svc.ProcessMemberSignedUp(context.Background(), signedUp(eventID, member)))

	assert.Equal(t, 1, rig.processed(t, eventID))
	assert.Equal(t, 1, rig.notifications(t, member))
	rows := rig.welcomes(t, member)
	require.Len(t, rows, 1)
	enclosures := enclosureKinds(t, rows[0].Enclosures)
	require.Len(t, enclosures, 1)
	assert.Equal(t, mailbox.EnclosureGold, enclosures[0].Kind)
	assert.Zero(t, rig.items.calls, "nothing to resolve without a template")
}
