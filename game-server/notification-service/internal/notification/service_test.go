package notification

import (
	"context"
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
			svc := NewService(nil, mockRepo, &mockInboxRepository{inserted: true})
			event := &pb.MatchEndedEvent{
				SessionId: uuid.NewString(),
				WorldType: tt.worldType,
				Players: []*pb.PlayerMatchResult{
					{MemberId: uuid.NewString(), Username: "wren", FinalPosition: 1},
				},
			}

			err := svc.ProcessGameEnded(context.Background(), event)

			assert.NoError(t, err)
			assert.Equal(t, tt.wantNotify, mockRepo.createCalled)
			if tt.wantNotify {
				assert.Equal(t, "Game Over", mockRepo.createParams.Title)
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
