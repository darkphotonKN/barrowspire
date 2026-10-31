package notification

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
)

type mockRepository struct {
	createCalled      bool
	createParams      *CreateNotification
	createReturn      *Notification
	createErr         error
	getByUserIDCalled bool
	getByUserIDParams *QueryNotifications
	getByUserIDReturn []Notification
	getByUserIDErr    error
	updateCalled      bool
	updateParams      *UpdateNotification
	updateErr         error
}

func (m *mockRepository) Create(ctx context.Context, createNotification *CreateNotification) (*Notification, error) {
	m.createCalled = true
	m.createParams = createNotification
	return m.createReturn, m.createErr
}

func (m *mockRepository) CreateTx(ctx context.Context, tx *sqlx.Tx, createNotification *CreateNotification) (*Notification, error) {
	m.createCalled = true
	m.createParams = createNotification
	return m.createReturn, m.createErr
}

func (m *mockRepository) GetByUserID(ctx context.Context, request *QueryNotifications) ([]Notification, error) {
	m.getByUserIDCalled = true
	m.getByUserIDParams = request
	return m.getByUserIDReturn, m.getByUserIDErr
}

func (m *mockRepository) Update(ctx context.Context, request *UpdateNotification) error {
	m.updateCalled = true
	m.updateParams = request
	return m.updateErr
}

func (m *mockRepository) MarkAllAsReadByUserID(ctx context.Context, userID uuid.UUID) (int64, error) {
	return 0, nil
}

type mockInboxRepository struct {
	inserted bool
	err      error
}

func (m *mockInboxRepository) MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error) {
	return m.inserted, m.err
}

// runInline runs the transaction body without a database.
func runInline(ctx context.Context, fn func(tx *sqlx.Tx) error) error { return fn(nil) }

// A field visit is not a match: it sends no "Game Over" or any other
// notification. A run, named or left empty, notifies as before.
// FS-X2F2H §F R45, ADR-0031, I-X2F2H-2.
func TestProcessGameEnded_WorldType(t *testing.T) {
	tests := []struct {
		name       string
		worldType  string
		wantNotify bool
	}{
		{"field visit: nothing sent", commonconstants.WorldTypeField, false},
		{"run: notified", commonconstants.WorldTypeRun, true},
		{"empty reads as run", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := &mockRepository{createReturn: &Notification{}}
			svc := &service{repo: mockRepo, inboxRepo: &mockInboxRepository{inserted: true}, withTx: runInline}
			event := &pb.MatchEndedEvent{
				SessionId: uuid.NewString(),
				WorldType: tt.worldType,
				Players: []*pb.PlayerMatchResult{
					{MemberId: uuid.NewString(), Username: "wren", FinalPosition: 1},
				},
			}

			err := svc.ProcessGameEnded(context.Background(), uuid.New(), event)

			assert.NoError(t, err)
			assert.Equal(t, tt.wantNotify, mockRepo.createCalled)
			if tt.wantNotify {
				assert.Equal(t, "Game Over", mockRepo.createParams.Title)
			}
		})
	}
}

type inboxKey struct {
	eventID   uuid.UUID
	eventType string
}

// fakeStore stands in for the database behind the service: the notifications
// table, the processed_events inbox, and the transaction around them. Writes
// made inside a transaction are staged and become visible only when the body
// returns nil, so a failed body leaves nothing behind, inbox mark included.
type fakeStore struct {
	failFor map[uuid.UUID]error // CreateTx fails for these users

	committed       []*CreateNotification
	committedEvents map[inboxKey]bool

	staged       []*CreateNotification
	stagedEvents []inboxKey

	txCount     int // transactions opened
	createCalls int // writes outside any transaction (repo.Create)
}

func newFakeStore() *fakeStore {
	return &fakeStore{failFor: map[uuid.UUID]error{}, committedEvents: map[inboxKey]bool{}}
}

func (f *fakeStore) withTx(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
	f.txCount++
	f.staged, f.stagedEvents = nil, nil
	if err := fn(nil); err != nil {
		f.staged, f.stagedEvents = nil, nil
		return err
	}
	f.committed = append(f.committed, f.staged...)
	for _, k := range f.stagedEvents {
		f.committedEvents[k] = true
	}
	f.staged, f.stagedEvents = nil, nil
	return nil
}

func (f *fakeStore) MarkEventProcessed(ctx context.Context, tx *sqlx.Tx, eventID uuid.UUID, eventType string) (bool, error) {
	k := inboxKey{eventID, eventType}
	if f.committedEvents[k] {
		return false, nil
	}
	f.stagedEvents = append(f.stagedEvents, k)
	return true, nil
}

func (f *fakeStore) Create(ctx context.Context, n *CreateNotification) (*Notification, error) {
	f.createCalls++
	return nil, errors.New("fakeStore: write outside a transaction")
}

func (f *fakeStore) CreateTx(ctx context.Context, tx *sqlx.Tx, n *CreateNotification) (*Notification, error) {
	if err := f.failFor[n.UserID]; err != nil {
		return nil, err
	}
	f.staged = append(f.staged, n)
	return &Notification{UserID: n.UserID}, nil
}

func (f *fakeStore) GetByUserID(ctx context.Context, request *QueryNotifications) ([]Notification, error) {
	return nil, nil
}

func (f *fakeStore) Update(ctx context.Context, request *UpdateNotification) error { return nil }

func (f *fakeStore) MarkAllAsReadByUserID(ctx context.Context, userID uuid.UUID) (int64, error) {
	return 0, nil
}

func (f *fakeStore) service() *service {
	return &service{repo: f, inboxRepo: f, withTx: f.withTx}
}

func (f *fakeStore) committedUsers() []uuid.UUID {
	users := make([]uuid.UUID, 0, len(f.committed))
	for _, n := range f.committed {
		users = append(users, n.UserID)
	}
	return users
}

// A run's match result is applied once per MessageId, all players or none,
// through the inbox in one transaction with the notification writes. A field
// visit writes nothing and marks nothing. FS-PJPNA Req 1, 2, 5, 6, 8, 9.
func TestProcessGameEnded_Inbox(t *testing.T) {
	alice, bob := uuid.New(), uuid.New()
	eventID := uuid.New()
	matchEnded := inboxKey{eventID, commonconstants.GameMatchEnded}
	transient := fmt.Errorf("notification repo: create notification: %w", commonconstants.ErrTransient)

	tests := []struct {
		name         string
		worldType    string
		players      []string
		seenBefore   bool
		failFor      map[uuid.UUID]error
		wantErr      error
		wantUsers    []uuid.UUID
		wantInboxRow bool
		wantTxOpened bool
	}{
		{
			name:         "new event: every player notified and the inbox marked",
			players:      []string{alice.String(), bob.String()},
			wantUsers:    []uuid.UUID{alice, bob},
			wantInboxRow: true,
			wantTxOpened: true,
		},
		{
			name:         "duplicate event: nothing written",
			players:      []string{alice.String(), bob.String()},
			seenBefore:   true,
			wantErr:      commonconstants.ErrAlreadyProcessed,
			wantUsers:    []uuid.UUID{},
			wantInboxRow: true, // the earlier delivery's row
			wantTxOpened: true,
		},
		{
			name:         "one player's write fails: nothing commits, inbox mark rolled back",
			players:      []string{alice.String(), bob.String()},
			failFor:      map[uuid.UUID]error{bob: transient},
			wantErr:      commonconstants.ErrTransient,
			wantUsers:    []uuid.UUID{},
			wantInboxRow: false,
			wantTxOpened: true,
		},
		{
			name:         "non-UUID member skipped, the rest and the inbox row commit",
			players:      []string{alice.String(), "not-a-uuid", bob.String()},
			wantUsers:    []uuid.UUID{alice, bob},
			wantInboxRow: true,
			wantTxOpened: true,
		},
		{
			name:         "no players: the inbox row commits alone",
			players:      nil,
			wantUsers:    []uuid.UUID{},
			wantInboxRow: true,
			wantTxOpened: true,
		},
		{
			name:         "field visit: no notification, no inbox row, no transaction",
			worldType:    commonconstants.WorldTypeField,
			players:      []string{alice.String(), bob.String()},
			wantUsers:    []uuid.UUID{},
			wantInboxRow: false,
			wantTxOpened: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newFakeStore()
			if tt.seenBefore {
				store.committedEvents[matchEnded] = true
			}
			for id, err := range tt.failFor {
				store.failFor[id] = err
			}
			event := &pb.MatchEndedEvent{SessionId: uuid.NewString(), WorldType: tt.worldType}
			for _, id := range tt.players {
				event.Players = append(event.Players, &pb.PlayerMatchResult{MemberId: id, Username: "wren"})
			}

			err := store.service().ProcessGameEnded(context.Background(), eventID, event)

			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
			} else {
				assert.NoError(t, err)
			}
			assert.ElementsMatch(t, tt.wantUsers, store.committedUsers())
			assert.Equal(t, tt.wantInboxRow, store.committedEvents[matchEnded], "processed_events row for (MessageId, match.ended)")
			assert.Len(t, store.committedEvents, map[bool]int{true: 1, false: 0}[tt.wantInboxRow], "no other inbox key is used")
			assert.Equal(t, tt.wantTxOpened, store.txCount > 0)
			assert.Zero(t, store.createCalls, "game.ended never writes outside the transaction")
		})
	}
}

// A match that failed for one player is retried as a whole: the redelivery
// with the same MessageId writes every valid player exactly once, and any
// later copy is a duplicate. FS-PJPNA Req 5, 6; Edge States.
func TestProcessGameEnded_RedeliveryAfterFailure_WritesEachPlayerOnce(t *testing.T) {
	alice, bob := uuid.New(), uuid.New()
	eventID := uuid.New()
	store := newFakeStore()
	store.failFor[bob] = errors.New("notification repo: create notification: boom")
	svc := store.service()
	event := &pb.MatchEndedEvent{
		SessionId: uuid.NewString(),
		Players: []*pb.PlayerMatchResult{
			{MemberId: alice.String(), Username: "alice"},
			{MemberId: bob.String(), Username: "bob"},
		},
	}

	err := svc.ProcessGameEnded(context.Background(), eventID, event)
	assert.Error(t, err)
	assert.Empty(t, store.committed)

	delete(store.failFor, bob)
	err = svc.ProcessGameEnded(context.Background(), eventID, event)
	assert.NoError(t, err)
	assert.ElementsMatch(t, []uuid.UUID{alice, bob}, store.committedUsers())

	err = svc.ProcessGameEnded(context.Background(), eventID, event)
	assert.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed)
	assert.Len(t, store.committed, 2)
}

// What a player reads is unchanged by dedup. FS-PJPNA Req 10.
func TestProcessGameEnded_Content(t *testing.T) {
	sessionID := uuid.NewString()
	tests := []struct {
		name        string
		player      *pb.PlayerMatchResult
		wantTitle   string
		wantMessage string
	}{
		{
			name:        "escaped",
			player:      &pb.PlayerMatchResult{Username: "wren", Escape: true, FinalPosition: 1, Kills: 3, Deaths: 0},
			wantTitle:   "Escaped!",
			wantMessage: "Congratulations wren! You escaped successfully! Position: #1, Kills: 3, Deaths: 0",
		},
		{
			name:        "last one standing",
			player:      &pb.PlayerMatchResult{Username: "wren", Win: true, FinalPosition: 1, Kills: 5, Deaths: 1},
			wantTitle:   "Victory!",
			wantMessage: "Congratulations wren! Last one standing! Position: #1, Kills: 5, Deaths: 1",
		},
		{
			name:        "game over",
			player:      &pb.PlayerMatchResult{Username: "wren", FinalPosition: 4, Kills: 0, Deaths: 2},
			wantTitle:   "Game Over",
			wantMessage: "wren, match ended. Position: #4, Kills: 0, Deaths: 2",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newFakeStore()
			memberID := uuid.New()
			tt.player.MemberId = memberID.String()
			event := &pb.MatchEndedEvent{SessionId: sessionID, Players: []*pb.PlayerMatchResult{tt.player}}

			err := store.service().ProcessGameEnded(context.Background(), uuid.New(), event)

			assert.NoError(t, err)
			if assert.Len(t, store.committed, 1) {
				got := store.committed[0]
				assert.Equal(t, &CreateNotification{
					UserID:           memberID,
					NotificationType: "in_app",
					EventType:        "game.ended",
					Title:            tt.wantTitle,
					Message:          tt.wantMessage,
					Data: map[string]any{
						"SessionId":     sessionID,
						"Username":      tt.player.Username,
						"Win":           tt.player.Win,
						"FinalPosition": tt.player.FinalPosition,
						"Kills":         tt.player.Kills,
						"Deaths":        tt.player.Deaths,
					},
				}, got)
			}
		})
	}
}

func (m *mockRepository) TestProcessMemberSignedUp_Success(t *testing.T) {
	// ===== Arrange =====
	mockRepo := &mockRepository{
		createReturn: &Notification{
			ID:               uuid.New(),
			UserID:           uuid.MustParse("550e8400-e29b-41d4-a716-446655440001"),
			NotificationType: "in_app",
			EventType:        "member.signedup",
			Title:            "Welcome to The Era of Barrowspire!",
			Message:          "Welcome John! Thank you for joining The Era of Barrowspire.",
			Data: map[string]any{
				"Name":  "kiki_test",
				"Email": "kiki_test@example.com",
			},
			Read:      false,
			Sent:      false,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}
	service := NewService(nil, mockRepo, &mockInboxRepository{inserted: true})

	payload := &commonconstants.MemberSignedUpEventPayload{
		UserID: "550e8400-e29b-41d4-a716-446655440001",
		Name:   "kiki_test",
		Email:  "kiki_test@example.com",
	}

	// ===== Act =====
	err := service.ProcessMemberSignedUp(context.Background(), payload)

	// ===== Assert =====
	assert.NoError(t, err)
	assert.True(t, mockRepo.createCalled, "Create should be called")
	assert.NotNil(t, mockRepo.createParams)
	assert.Equal(t, uuid.MustParse("550e8400-e29b-41d4-a716-446655440001"), mockRepo.createParams.UserID)
	assert.Equal(t, "member.signedup", mockRepo.createParams.EventType)
	assert.Equal(t, "kiki", mockRepo.createParams.Data["Name"])
	assert.Equal(t, "kiki_test@example.com", mockRepo.createParams.Data["Email"])
}

func (m *mockRepository) TestProcessMemberSignedUp_InvalidUUID(t *testing.T) {
	// ===== Arrange =====
	mockRepo := &mockRepository{}
	service := NewService(nil, mockRepo, &mockInboxRepository{inserted: true})
	payload := &commonconstants.MemberSignedUpEventPayload{
		UserID: "invalid-uuid",
		Name:   "kiki_test",
		Email:  "kiki_test@example.com",
	}

	// ===== Act =====
	err := service.ProcessMemberSignedUp(context.Background(), payload)

	// ===== Assert =====
	assert.NoError(t, err)
	assert.False(t, mockRepo.createCalled, "Create should not be called when UUID is invalid")
}
