package stats

import (
	"context"
	"encoding/json"
	"log/slog"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commontypes "github.com/darkphotonKN/barrowspire-server/common/types"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
)

type mockRepo struct {
	getPlayerStatsReturn *PlayerMatchStats
	getPlayerStatsErr    error

	upsertCalled               bool
	upsertParams               *UpdateStatsParams
	upsertErr                  error
	upsertPlayerRankingsCalled bool
	upsertPlayerRankingParams  *UpdatePlayerRankingsParams
}

func (m *mockRepo) UpsertPlayerMatchStatsTx(ctx context.Context, tx *sqlx.Tx, params *UpdateStatsParams) (*PlayerMatchStats, error) {
	m.upsertCalled = true
	m.upsertParams = params
	return nil, m.upsertErr
}

func (m *mockRepo) UpsertPlayerRankingStatsTx(ctx context.Context, tx *sqlx.Tx, params *UpdatePlayerRankingsParams) (*PlayerRankingStats, error) {
	m.upsertPlayerRankingsCalled = true
	m.upsertPlayerRankingParams = params
	return nil, m.upsertErr
}

func (m *mockRepo) CreateMatchHistoryTx(ctx context.Context, tx *sqlx.Tx, history *MatchHistory) error {
	return nil
}

func (m *mockRepo) GetPlayerMatchStatsTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*PlayerMatchStats, error) {
	return m.getPlayerStatsReturn, m.getPlayerStatsErr
}

func (m *mockRepo) GetPlayerRankingStatsTx(ctx context.Context, tx *sqlx.Tx, memberID uuid.UUID) (*PlayerRankingStats, error) {
	return nil, nil
}

func (m *mockRepo) UpsertPlayerRankingStats(ctx context.Context, params *UpdatePlayerRankingsParams) (*PlayerRankingStats, error) {
	m.upsertPlayerRankingsCalled = true
	m.upsertPlayerRankingParams = params
	return nil, m.upsertErr
}

func (m *mockRepo) GetPlayerRankings(ctx context.Context, params *GetPlayerRankings) ([]*PlayerRankingStats, error) {
	return nil, nil
}

// test publisher just for testing
type TestPublisher struct {
}

func (p *TestPublisher) PublishWithContext(_ context.Context, exchange, key string, msg commonbroker.Message) error {
	var matchEndData commontypes.MatchEndState

	err := json.Unmarshal(msg.Body, &matchEndData)

	if err != nil {
		slog.Info("Error when unmarshalling published message, message type could not not be unmarshaled to expected type MatchEndState")
		return err
	}

	slog.Info("Worked!", "matchEndData", matchEndData)
	return nil
}

func TestUpdatePlayerStats_IncrementWin(t *testing.T) {
	repo := &mockRepo{}
	service := NewService(repo, &TestPublisher{}, nil, nil)

	playerStats := &pb.PlayerMatchResult{
		MemberId:      uuid.MustParse("550e8400-e29b-41d4-a716-446655440001").String(),
		Username:      "Obiwon2002",
		Win:           true,
		Kills:         10,
		Deaths:        1,
		FinalPosition: 1,
		Escape:        false,
	}

	err := service.updatePlayerStats(context.Background(), nil, playerStats)
	assert.NoError(t, err)

	slog.Info("end of updatePlayerStats increment win test", "repo.upsertParams.Wins", repo.upsertParams.Wins)

	assert.Equal(t, 1, repo.upsertParams.Wins)
	assert.Equal(t, 10, repo.upsertParams.Kills)
}
