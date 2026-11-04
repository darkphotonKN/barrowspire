package mailbox

import (
	"context"
	"database/sql"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/inbox"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The letter request against a real postgres (FS-1GZGD R12, R55): the inbox
// mark and the letter commit or roll back together in processed_events and
// letters. items and the arrival publisher are fakes.

func requestDBService(t *testing.T, db *sqlx.DB, items *fakeItems, arrivals *fakeArrivals) *service {
	t.Helper()
	svc := NewService(db, NewRepository(db), items, &fakeWallet{}, arrivals, inbox.NewRepo(), 8)
	svc.now = func() time.Time { return sentAt }
	return svc
}

func processedRows(t *testing.T, db *sqlx.DB, eventID string) int {
	t.Helper()
	var n int
	require.NoError(t, db.Get(&n,
		`SELECT COUNT(*) FROM processed_events WHERE event_id = $1 AND event_type = $2`,
		eventID, commonconstants.MailLetterRequestedEvent))
	return n
}

func TestProcessLetterRequestedDB_SameEventTwiceStoresOneSystemLetter(t *testing.T) {
	db := mailboxDB(t)
	arrivals := &fakeArrivals{}
	svc := requestDBService(t, db, &fakeItems{}, arrivals)
	member := uuid.New()
	evt := letterRequest(member, templateEnclosure(uuid.NewString(), 2), goldEnclosure(100))

	require.NoError(t, svc.ProcessLetterRequested(context.Background(), evt))
	err := svc.ProcessLetterRequested(context.Background(), evt)

	assert.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed)
	assert.Equal(t, 1, countRows(t, db, "letters"))
	assert.Equal(t, 1, processedRows(t, db, evt.EventId))
	assert.Len(t, arrivals.batches, 1, "the redelivery announces nothing")

	mailbox, err := NewRepository(db).ListLetters(context.Background(), member, sentAt.Add(time.Minute), mailboxSize)
	require.NoError(t, err)
	require.Len(t, mailbox, 1, "visible in the member's mailbox")
	assert.Equal(t, SenderSystem, mailbox[0].Sender)
	assert.Len(t, mailbox[0].Enclosures, 2)

	got := sentByOf(t, db, mailbox[0].ID)
	assert.Equal(t, "system", got.Sender)
	assert.Equal(t, sql.NullString{String: "test.compensation", Valid: true}, got.Source)
	assert.False(t, got.MemberID.Valid, "a system letter records no member id")
}

func TestProcessLetterRequestedDB_ItemsDownRollsBackTheMark(t *testing.T) {
	db := mailboxDB(t)
	svc := requestDBService(t, db, &fakeItems{err: ErrItemsUnavailable}, &fakeArrivals{})
	evt := letterRequest(uuid.New(), templateEnclosure(uuid.NewString(), 1))

	err := svc.ProcessLetterRequested(context.Background(), evt)

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Zero(t, processedRows(t, db, evt.EventId), "not marked processed, so redelivered")
	assert.Zero(t, countRows(t, db, "letters"))
}

func TestProcessLetterRequestedDB_InvalidSourceIsMarkedProcessedAndStoresNothing(t *testing.T) {
	db := mailboxDB(t)
	arrivals := &fakeArrivals{}
	svc := requestDBService(t, db, &fakeItems{}, arrivals)
	evt := letterRequest(uuid.New())
	evt.Source = ""

	require.NoError(t, svc.ProcessLetterRequested(context.Background(), evt))

	assert.Equal(t, 1, processedRows(t, db, evt.EventId))
	assert.Zero(t, countRows(t, db, "letters"))
	assert.Empty(t, arrivals.batches)
}
