package game

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2F2H §F R39–R42, ADR-0031; Acceptance Criteria 9–11. I-X2F2H-6.

// endedVisit is a visit as a way out hands it to settlement: a sword worn
// from the loadout, a tusk picked up in the field.
func endedVisit() FieldVisit {
	swordID := uuid.New()
	entered := time.Date(2026, 10, 30, 9, 0, 0, 0, time.UTC)
	return FieldVisit{
		ID:               uuid.New(),
		Field:            FieldGentleMeadows,
		MemberID:         uuid.New(),
		CharacterID:      uuid.New(),
		Username:         "Wren",
		EnteredAt:        entered,
		LeftAt:           entered.Add(7 * time.Minute),
		Level:            4,
		Experience:       1400,
		ExperienceGained: 500,
		Deaths:           1,
		Equipment: types.ExtractedEquipment{
			WeaponSlot: &types.ExtractedItem{TemplateID: uuid.New(), ItemType: "weapon", Name: "Seax", InstanceID: &swordID},
		},
		Satchel: []*types.ExtractedItem{{TemplateID: uuid.New(), ItemType: "weapon", Name: "Boar Tusk"}},
	}
}

// A visit settles as one match.ended and one items.extracted under its own
// id: a returned result, never a win, in a field. R40, R41, R43.
func TestPublishFieldVisit_WritesTheReturnedResult(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox)
	visit := endedVisit()

	require.NoError(t, svc.PublishFieldVisit(context.Background(), visit))

	ended := outbox.matchEnded(t)
	assert.Equal(t, visit.ID.String(), ended.GetSessionId(), "the visit id, never the channel's")
	assert.Equal(t, commonconstants.WorldTypeField, ended.GetWorldType())
	assert.True(t, visit.EnteredAt.Equal(ended.GetMatchStartedAt().AsTime()))
	assert.True(t, visit.LeftAt.Equal(ended.GetMatchEndedAt().AsTime()))
	require.Len(t, ended.GetPlayers(), 1)
	result := ended.GetPlayers()[0]
	assert.Equal(t, visit.MemberID.String(), result.GetMemberId())
	assert.Equal(t, "Wren", result.GetUsername())
	assert.Equal(t, visit.CharacterID.String(), result.GetCharacterId())
	assert.Equal(t, int64(500), result.GetExperienceGained())
	assert.Zero(t, result.GetKills(), "kills are not settled")
	assert.Equal(t, int32(1), result.GetDeaths())
	assert.False(t, result.GetWin(), "a visit is never a win")
	assert.False(t, result.GetEscape())
	assert.Equal(t, int32(1), result.GetFinalPosition(), "match_history requires a position of at least 1")

	extracted := outbox.itemsExtracted(t)
	assert.Equal(t, visit.ID.String(), extracted.GetSessionId())
	require.Len(t, extracted.GetPlayerItems(), 1)
	items := extracted.GetPlayerItems()[0]
	assert.Equal(t, visit.MemberID.String(), items.GetMemberId())
	require.NotNil(t, items.GetEquipment(), "equipment is never nil")
	assert.Equal(t, visit.Equipment.WeaponSlot.InstanceID.String(), items.GetEquipment().GetWeapon().GetInstanceId())
	require.Len(t, items.GetInventory(), 1)
	assert.Equal(t, "Boar Tusk", items.GetInventory()[0].GetName())
	assert.Empty(t, items.GetInventory()[0].GetInstanceId(), "a pickup is minted by items-service")
}

// A visit with nothing worn, carried or earned still settles a full pair:
// equipment present and empty, zero experience. Edge State "Visit with no XP
// and no pickups".
func TestPublishFieldVisit_EmptyVisit_StillSettles(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox)
	visit := FieldVisit{ID: uuid.New(), MemberID: uuid.New(), CharacterID: uuid.New(), EnteredAt: time.Now(), LeftAt: time.Now()}

	require.NoError(t, svc.PublishFieldVisit(context.Background(), visit))

	assert.Zero(t, outbox.matchEnded(t).GetPlayers()[0].GetExperienceGained())
	assert.NotNil(t, outbox.itemsExtracted(t).GetPlayerItems()[0].GetEquipment())
}

// Both rows go through the run's own write, in one transaction, items first;
// a failure writes neither and is returned. R39.
func TestPublishFieldVisit_OneTransaction_AllOrNothing(t *testing.T) {
	t.Run("both rows, one commit", func(t *testing.T) {
		db, mock := mockTxDB(t)
		mock.ExpectBegin()
		mock.ExpectExec(insertOutboxStmt).
			WithArgs(commonconstants.ItemsExtracted, commonconstants.GameEventsExchange, sqlmock.AnyArg()).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(insertOutboxStmt).
			WithArgs(commonconstants.GameMatchEnded, commonconstants.GameEventsExchange, sqlmock.AnyArg()).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()
		svc := NewService(db, commonoutbox.NewService(commonoutbox.NewRepo(db)))

		require.NoError(t, svc.PublishFieldVisit(context.Background(), endedVisit()))
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("second row fails: rolled back and returned", func(t *testing.T) {
		db, mock := mockTxDB(t)
		mock.ExpectBegin()
		mock.ExpectExec(insertOutboxStmt).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(insertOutboxStmt).WillReturnError(errors.New("db down"))
		mock.ExpectRollback()
		svc := NewService(db, commonoutbox.NewService(commonoutbox.NewRepo(db)))
		visit := endedVisit()

		err := svc.PublishFieldVisit(context.Background(), visit)

		require.Error(t, err)
		assert.Contains(t, err.Error(), visit.ID.String(), "the failure names the visit")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}
