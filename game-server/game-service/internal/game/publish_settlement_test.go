package game

import (
	"context"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// One player's settlement is one pair carrying only them: a partial
// items.extracted and a match.ended with their result and experience, under
// ids derived from the run and that member. FS-GV8WN §B R5–R6, I-GV8WN-5.
func TestPublishSettlement_OnePlayer_PartialPairUnderTheirIDs(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t))
	run, wren, character := uuid.New(), uuid.New(), uuid.New()

	svc.PublishSettlement(context.Background(), &types.RawSettlement{
		SessionID:     run,
		Player:        types.RawPlayerState{MemberID: wren.String(), Username: "wren", Kills: 3, Escape: true},
		Progress:      types.RunProgress{MemberID: wren, CharacterID: character, Gained: 120},
		FinalPosition: 1,
	})
	svc.Drain()

	extracted := outbox.itemsExtracted(t)
	assert.True(t, extracted.GetPartial(), "a player's own settlement releases only them")
	require.Len(t, extracted.GetPlayerItems(), 1)
	assert.Equal(t, wren.String(), extracted.GetPlayerItems()[0].GetMemberId())

	ended := outbox.matchEnded(t)
	require.Len(t, ended.GetPlayers(), 1)
	result := ended.GetPlayers()[0]
	assert.Equal(t, wren.String(), result.GetMemberId())
	assert.True(t, result.GetEscape())
	assert.True(t, result.GetWin(), "an escape is the win")
	assert.EqualValues(t, 1, result.GetFinalPosition())
	assert.EqualValues(t, 120, result.GetExperienceGained())
	assert.Equal(t, character.String(), result.GetCharacterId())

	want := newSettlementIDs(run, wren.String())
	assert.Equal(t, want.ItemsExtracted, outbox.rowID(t, commonconstants.ItemsExtracted))
	assert.Equal(t, want.MatchEnded, outbox.rowID(t, commonconstants.GameMatchEnded))
}

// A dead player's settlement is no win, at the position their fall gave them.
func TestPublishSettlement_Dead_NoWinAtTheirPosition(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t))

	svc.PublishSettlement(context.Background(), &types.RawSettlement{
		SessionID:     uuid.New(),
		Player:        types.RawPlayerState{MemberID: uuid.NewString(), Username: "ash"},
		FinalPosition: 3,
	})
	svc.Drain()

	result := outbox.matchEnded(t).GetPlayers()[0]
	assert.False(t, result.GetWin())
	assert.EqualValues(t, 3, result.GetFinalPosition())
}

// The run's end names the members already settled, so its release skips them.
// FS-GV8WN R14 (D3).
func TestPublishMatchComplete_SomeSettled_NamesThemOnTheWholeRunEvent(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t))
	settled := uuid.New()

	svc.PublishMatchComplete(context.Background(), &types.RawMatchState{
		SessionID:        uuid.New(),
		Players:          []types.RawPlayerState{{MemberID: uuid.NewString(), Username: "wren"}},
		SettledMemberIDs: []uuid.UUID{settled},
	})

	extracted := outbox.itemsExtracted(t)
	assert.False(t, extracted.GetPartial(), "the run's end releases the whole run")
	assert.Equal(t, []string{settled.String()}, extracted.GetSettledMemberIds())
}

// With everyone already settled, the run's end is only a sweep: one
// items.extracted with no players, naming the settled, and no match.ended.
// FS-GV8WN R14 (D2, D3).
func TestPublishMatchComplete_NobodyLeft_SweepOnly(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t))
	run, settled := uuid.New(), uuid.New()

	svc.PublishMatchComplete(context.Background(), &types.RawMatchState{
		SessionID:        run,
		SettledMemberIDs: []uuid.UUID{settled},
	})

	extracted := outbox.itemsExtracted(t)
	assert.Empty(t, extracted.GetPlayerItems())
	assert.False(t, extracted.GetPartial())
	assert.Equal(t, []string{settled.String()}, extracted.GetSettledMemberIds())
	assert.Equal(t, newSettlementIDs(run, sweepMemberKey).ItemsExtracted, outbox.rowID(t, commonconstants.ItemsExtracted))
	assert.False(t, outbox.wrote(commonconstants.GameMatchEnded), "a sweep is no match result")
}
