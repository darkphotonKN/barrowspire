package game

import (
	"context"
	"sync"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// settlementsEmitter records every settlement and run end the session publishes.
type settlementsEmitter struct {
	mu          sync.Mutex
	settlements []*types.RawSettlement
	confirms    []func()
	ends        []*types.RawMatchState
}

func (e *settlementsEmitter) PublishMatchComplete(_ context.Context, data *types.RawMatchState) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.ends = append(e.ends, data)
}

func (e *settlementsEmitter) PublishSettlement(_ context.Context, settlement *types.RawSettlement, onConfirmed func()) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.settlements = append(e.settlements, settlement)
	e.confirms = append(e.confirms, onConfirmed)
}

func (e *settlementsEmitter) settledMembers() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	members := make([]string, 0, len(e.settlements))
	for _, s := range e.settlements {
		members = append(members, s.Player.MemberID)
	}
	return members
}

// progressRecorder is a homeReturner that keeps the progress applied to seats.
type progressRecorder struct {
	homeReturner
	mu      sync.Mutex
	applied []types.RunProgress
}

func (p *progressRecorder) ApplyRunProgress(progress []types.RunProgress) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.applied = append(p.applied, progress...)
}

func settlingRun(t *testing.T) (*Session, *settlementsEmitter, *progressRecorder) {
	t.Helper()
	s := coopRun(t)
	emitter := &settlementsEmitter{}
	closer := &progressRecorder{homeReturner: homeReturner{run: s}}
	s.eventEmitter = emitter
	s.sessionCloser = closer
	s.sender = &recordingSender{}
	return s, emitter, closer
}

// An escaped player is settled the moment they escape, alone, as the win, and
// their progress reaches their village seat at once. FS-GV8WN §A R1–R3,
// I-GV8WN-5.
func TestSettleOnResolve_Escape_SettlesThatPlayerAtOnce(t *testing.T) {
	s, emitter, closer := settlingRun(t)
	escapee, _ := seatedDelver(t, s, "warrior", 300, 300)
	seatedDelver(t, s, "mage", 600, 300)

	s.handlePlayerEscape(escapee)

	require.Equal(t, []string{escapee.String()}, emitter.settledMembers())
	settlement := emitter.settlements[0]
	assert.Equal(t, s.ID, settlement.SessionID)
	assert.True(t, settlement.Player.Escape)
	assert.EqualValues(t, 1, settlement.FinalPosition)
	require.Len(t, closer.applied, 1)
	assert.Equal(t, escapee, closer.applied[0].MemberID)
}

// A player is settled on the tick they die, as a death, at the position their
// fall gave them. FS-GV8WN §A R1–R2, I-GV8WN-6.
func TestSettleOnResolve_Death_SettlesOnTheTickTheyFall(t *testing.T) {
	s, emitter, _ := settlingRun(t)
	_, fallen := seatedDelver(t, s, "warrior", 300, 300)
	seatedDelver(t, s, "mage", 600, 300)

	kill(t, fallen)
	tick(s)

	require.Len(t, emitter.settlements, 1)
	settlement := emitter.settlements[0]
	assert.False(t, settlement.Player.Escape)
	assert.EqualValues(t, 2, settlement.FinalPosition, "first of two to fall")
}

// A player in play removed from the run (their grace ran out) is settled as a
// death before their body goes. FS-GV8WN §A R1–R2, I-GV8WN-6.
func TestSettleOnResolve_RemovedInPlay_SettledAsADeath(t *testing.T) {
	s, emitter, _ := settlingRun(t)
	dropped, _ := seatedDelver(t, s, "warrior", 300, 300)
	seatedDelver(t, s, "mage", 600, 300)

	s.RemovePlayer(dropped.String())

	require.Equal(t, []string{dropped.String()}, emitter.settledMembers())
	assert.False(t, emitter.settlements[0].Player.Escape)
	assert.NotContains(t, s.GetPlayerIDs(), dropped, "their body is gone")
}

// A player is settled once, however they leave after resolving.
func TestSettleOnResolve_ResolvedThenRemoved_SettledOnce(t *testing.T) {
	s, emitter, _ := settlingRun(t)
	escapee, _ := seatedDelver(t, s, "warrior", 300, 300)
	_, fallen := seatedDelver(t, s, "mage", 600, 300)
	fallenID := s.playerEntityIDToPlayerID[fallen.ID]
	seatedDelver(t, s, "archer", 900, 300)

	s.handlePlayerEscape(escapee)
	kill(t, fallen)
	tick(s)
	s.RemovePlayer(escapee.String())
	s.RemovePlayer(fallenID.String())

	assert.ElementsMatch(t, []string{escapee.String(), fallenID.String()}, emitter.settledMembers())
}

// The run's end settles only who is left, and names the settled so its release
// skips them. FS-GV8WN §E R14 (D2, D3).
func TestSettleOnResolve_RunEnd_OnlyTheUnsettledNamingTheSettled(t *testing.T) {
	s, emitter, _ := settlingRun(t)
	escapee, _ := seatedDelver(t, s, "warrior", 300, 300)
	_, fallen := seatedDelver(t, s, "mage", 600, 300)
	fallenID := s.playerEntityIDToPlayerID[fallen.ID]

	s.handlePlayerEscape(escapee)
	kill(t, fallen)
	tick(s)
	s.endSession()

	require.Len(t, emitter.ends, 1)
	end := emitter.ends[0]
	assert.Empty(t, end.Players, "everyone was settled already")
	assert.Empty(t, end.Progress)
	assert.ElementsMatch(t, []uuid.UUID{escapee, fallenID}, end.SettledMemberIDs)
}

// gearedSettling is a run whose one delver wears a safe sword and an unsafe
// ring and carries an unsafe potion and a safe helm (gearedDelver), and whose
// settlements are recorded.
func gearedSettling(t *testing.T) (geared, *settlementsEmitter) {
	t.Helper()
	s, _ := equipRun(t, nil)
	emitter := &settlementsEmitter{}
	s.eventEmitter = emitter
	s.sessionCloser = &progressRecorder{homeReturner: homeReturner{run: s}}
	return gearedDelver(t, s), emitter
}

// An escape settles everything the body holds, finds included. FS-GV8WN §A R2.
func TestSettleOnResolve_Escape_CarriesEverythingFindsIncluded(t *testing.T) {
	g, emitter := gearedSettling(t)
	g.escape(t)

	g.s.settleEscape(g.playerID)

	require.Len(t, emitter.settlements, 1)
	extracted := emitter.settlements[0].Player
	require.NotNil(t, extracted.Equipment.Ring1Slot, "the unsafe ring comes out with an escape")
	assert.Equal(t, []string{"Lesser Heal Potion", "Barrow Helm"}, extractedNames(extracted.Inventory))
}

// A member removed in play is settled as a death: unsafe finds lost, the
// stored potions they drank carried for deletion. FS-GV8WN §A R2, I-GV8WN-6.
func TestSettleOnResolve_RemovedInPlay_LosesFindsCarriesWhatTheyDrank(t *testing.T) {
	g, emitter := gearedSettling(t)
	drunk := uuid.New()
	body, ok := g.s.EntityManager.GetEntity(g.entityID)
	require.True(t, ok)
	body.AddComponent(&components.PotionComponent{Consumed: []components.ConsumedItem{{InstanceID: drunk}}})

	g.s.RemovePlayer(g.playerID.String())

	require.Len(t, emitter.settlements, 1)
	extracted := emitter.settlements[0].Player
	require.NotNil(t, extracted.Equipment.WeaponSlot, "the brought-in sword comes home")
	assert.Nil(t, extracted.Equipment.Ring1Slot, "the unsafe ring is lost")
	assert.Equal(t, []string{"Barrow Helm"}, extractedNames(extracted.Inventory), "the unsafe potion is lost")
	assert.Equal(t, []uuid.UUID{drunk}, extracted.ConsumedItemIDs)
}

// On a ticking run, removal is settled and the body removed on the tick, never
// read from beside it. FS-GV8WN §A R2; game-service ECS rules.
func TestSettleOnResolve_RemovedFromATickingRun_SettledOnTheTick(t *testing.T) {
	s, emitter, _ := settlingRun(t)
	dropped, _ := seatedDelver(t, s, "warrior", 300, 300)
	seatedDelver(t, s, "mage", 600, 300)
	s.isRunning = true // a tick runs: removal waits for it

	s.RemovePlayer(dropped.String())
	assert.Empty(t, emitter.settlements, "nothing is read off the tick")
	assert.Contains(t, s.GetPlayerIDs(), dropped, "the body goes on the tick")

	tick(s)

	assert.Equal(t, []string{dropped.String()}, emitter.settledMembers())
	assert.NotContains(t, s.GetPlayerIDs(), dropped)
}

// A body that cannot be snapshotted is not marked settled: the run's end
// settles it as before rather than dropping it. FS-GV8WN Edge States.
func TestSettleOnResolve_SnapshotFails_LeftForTheRunsEnd(t *testing.T) {
	s, emitter, _ := settlingRun(t)
	broken, body := seatedDelver(t, s, "warrior", 300, 300)
	body.RemoveComponent(ecs.ComponentTypeItemIDList)

	s.settleDeath(broken)

	assert.Empty(t, emitter.settlements)
	s.endSession()
	require.Len(t, emitter.ends, 1)
	assert.NotContains(t, emitter.ends[0].SettledMemberIDs, broken, "not named: their gear is released by the run's end")
}

// Two falling on one tick are each settled once, at the positions their falls
// gave them. FS-GV8WN Edge States.
func TestSettleOnResolve_TwoFallOnOneTick_EachAtTheirPosition(t *testing.T) {
	s, emitter, _ := settlingRun(t)
	_, first := seatedDelver(t, s, "warrior", 300, 300)
	_, second := seatedDelver(t, s, "mage", 600, 300)
	seatedDelver(t, s, "archer", 900, 300)

	kill(t, first)
	kill(t, second)
	tick(s)

	require.Len(t, emitter.settlements, 2)
	positions := []int32{emitter.settlements[0].FinalPosition, emitter.settlements[1].FinalPosition}
	assert.ElementsMatch(t, []int32{3, 2}, positions)
}

// Through the real publisher, each member of a run lands in exactly one pair:
// the escapee and the fallen in their own, nobody in the run's end, which only
// sweeps. FS-GV8WN §B R5, AC "one grant and one notification per player".
func TestSettleOnResolve_EachMemberInExactlyOnePair(t *testing.T) {
	s := coopRun(t)
	outbox := &capturingOutbox{}
	s.eventEmitter = NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)
	s.sessionCloser = &homeReturner{run: s}
	s.sender = &recordingSender{}
	escapee, _ := seatedDelver(t, s, "warrior", 300, 300)
	fallenID, fallen := seatedDelver(t, s, "mage", 600, 300)

	s.handlePlayerEscape(escapee)
	kill(t, fallen)
	tick(s)
	s.endSession()
	drainSettlements(t, s)

	pairs := map[string]int{}
	for _, event := range outbox.everyMatchEnded(t) {
		for _, player := range event.Players {
			pairs[player.MemberId]++
		}
	}
	assert.Equal(t, map[string]int{escapee.String(): 1, fallenID.String(): 1}, pairs, "one match.ended entry each")

	extracted := map[string]int{}
	for _, event := range outbox.everyItemsExtracted(t) {
		for _, items := range event.GetPlayerItems() {
			extracted[items.GetMemberId()]++
		}
	}
	assert.Equal(t, map[string]int{escapee.String(): 1, fallenID.String(): 1}, extracted, "one items.extracted entry each")
}
