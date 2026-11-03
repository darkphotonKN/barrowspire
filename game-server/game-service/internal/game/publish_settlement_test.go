package game

import (
	"context"
	"encoding/json"
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
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)
	run, wren, character := uuid.New(), uuid.New(), uuid.New()

	svc.PublishSettlement(context.Background(), &types.RawSettlement{
		SessionID:     run,
		Player:        types.RawPlayerState{MemberID: wren.String(), Username: "wren", Kills: 3, Escape: true},
		Progress:      types.RunProgress{MemberID: wren, CharacterID: character, Gained: 120},
		FinalPosition: 1,
	}, nil)
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
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)

	svc.PublishSettlement(context.Background(), &types.RawSettlement{
		SessionID:     uuid.New(),
		Player:        types.RawPlayerState{MemberID: uuid.NewString(), Username: "ash"},
		FinalPosition: 3,
	}, nil)
	svc.Drain()

	result := outbox.matchEnded(t).GetPlayers()[0]
	assert.False(t, result.GetWin())
	assert.EqualValues(t, 3, result.GetFinalPosition())
}

// The run's end names the members already settled, so its release skips them.
// FS-GV8WN R14 (D3).
func TestPublishMatchComplete_SomeSettled_NamesThemOnTheWholeRunEvent(t *testing.T) {
	outbox := &capturingOutbox{}
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)
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
	svc := NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)
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

// A player's settlement is applied in items-service under its items.extracted
// row id once recorded, then confirmed. FS-GV8WN §D R13, I-GV8WN-8.
func TestPublishSettlement_Recorded_AppliedThenConfirmed(t *testing.T) {
	applier := &recordingApplier{}
	svc := NewService(committingTxDB(t), &capturingOutbox{}, noWake{}, testRetry(t), applier)
	run, wren := uuid.New(), uuid.New()
	confirmed := make(chan struct{}, 1)

	svc.PublishSettlement(context.Background(), &types.RawSettlement{
		SessionID: run,
		Player:    types.RawPlayerState{MemberID: wren.String(), Username: "wren", Escape: true},
	}, func() { confirmed <- struct{}{} })
	svc.Drain()

	require.Len(t, applier.requests(), 1)
	assert.Equal(t, newSettlementIDs(run, wren.String()).ItemsExtracted.String(), applier.requests()[0].GetEventId())
	assert.True(t, applier.requests()[0].GetEvent().GetPartial())
	select {
	case <-confirmed:
	default:
		t.Fatal("never confirmed")
	}
}

// The run's end is applied at once too, under its own row id. FS-GV8WN R13.
func TestPublishMatchComplete_Recorded_Applied(t *testing.T) {
	applier := &recordingApplier{}
	svc := NewService(committingTxDB(t), &capturingOutbox{}, noWake{}, testRetry(t), applier)
	run, wren := uuid.New(), uuid.NewString()

	svc.PublishMatchComplete(context.Background(), soloRunEnd(run, wren))
	svc.Drain()

	require.Len(t, applier.requests(), 1)
	assert.Equal(t, newSettlementIDs(run, wren).ItemsExtracted.String(), applier.requests()[0].GetEventId())
}

// The record's items carry the WS item shape with found and reason beside its
// fields, as the client reads them. FS-GV8WN §G R19.
func TestSettlementItems_JSON_FoundAndReasonInline(t *testing.T) {
	carried, err := json.Marshal(types.SettlementCarriedItem{ItemState: types.ItemState{Name: "Iron Band"}, Found: true})
	require.NoError(t, err)
	lost, err := json.Marshal(types.SettlementLostItem{ItemState: types.ItemState{Name: "Heal Potion"}, Reason: types.SettlementLostConsumed})
	require.NoError(t, err)

	var c, l map[string]any
	require.NoError(t, json.Unmarshal(carried, &c))
	require.NoError(t, json.Unmarshal(lost, &l))
	assert.Equal(t, "Iron Band", c["name"])
	assert.Equal(t, true, c["found"])
	assert.Equal(t, "Heal Potion", l["name"])
	assert.Equal(t, "consumed", l["reason"])
}
