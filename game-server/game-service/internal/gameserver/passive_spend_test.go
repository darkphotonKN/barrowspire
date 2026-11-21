package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-8RZ51 §D R16–R22, §E R23, §Edge States; ADR-0079, ADR-0082. I-8RZ51-3.

// spendCall is one SpendPassivePoint character-service was asked for.
type spendCall struct {
	memberID, characterID uuid.UUID
	nodeID                string
	rank                  int
}

// spendAnswers is how the fake character-service answers a spend: by default
// it takes the rank on the member's character and answers every rank held.
type spendAnswers struct {
	// fails every spend with this error
	spendErr error
	// holds every spend until closed, or until the caller gives up
	spendHold chan struct{}
	// answered, in order, instead of the held ranks
	scripted []passivetree.Ranks
}

func (f *fakeCharacters) SpendPassivePoint(ctx context.Context, memberID, characterID uuid.UUID, nodeID string, rank int) (passivetree.Ranks, error) {
	f.mu.Lock()
	f.spends = append(f.spends, spendCall{memberID, characterID, nodeID, rank})
	hold := f.spendHold
	f.mu.Unlock()

	if hold != nil {
		select {
		case <-hold:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.spendErr != nil {
		return nil, f.spendErr
	}
	if len(f.scripted) > 0 {
		answer := f.scripted[0]
		f.scripted = f.scripted[1:]
		return answer, nil
	}
	character, ok := f.owned[memberID][characterID]
	if !ok {
		return nil, fmt.Errorf("character %s: %w", characterID, types.ErrCharacterNotFound)
	}
	ranks := passivetree.Higher(character.PassiveRanks, passivetree.Ranks{nodeID: rank})
	character.PassiveRanks = ranks
	f.owned[memberID][characterID] = character
	return maps.Clone(ranks), nil
}

func (f *fakeCharacters) spendCalls() []spendCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]spendCall(nil), f.spends...)
}

// giveRanked creates a character holding ranks.
func (f *fakeCharacters) giveRanked(memberID uuid.UUID, class string, level int, ranks passivetree.Ranks) types.CharacterInPlay {
	character := f.give(memberID, class, "Wren", level, 0)
	f.mu.Lock()
	defer f.mu.Unlock()
	character.PassiveRanks = ranks
	f.owned[memberID][character.ID] = character
	return character
}

const spendAction = string(constants.ActionSpendPassivePoint)

// spendQuiet is how long a test listens for a reply that must not come.
const spendQuiet = 300 * time.Millisecond

// spendRig is a server with one member, Wren, entered in the hub.
type spendRig struct {
	server     *Server
	queue      *mockQueueService
	characters *fakeCharacters
	hub        *game.Session
	player     *types.Player
	conn       *websocket.Conn
	character  types.CharacterInPlay
	inbox      *startSoloInbox
}

func newSpendRig(t *testing.T, class string, level int, ranks passivetree.Ranks) *spendRig {
	t.Helper()
	rig := &spendRig{queue: NewMockQueueService(), characters: newFakeCharacters(), conn: &websocket.Conn{}}
	rig.server = newTestServer(t, context.Background(), &MockAuthClient{}, rig.queue, &MockEventEmitter{}, &MockItemsClient{}, rig.characters, testPodID, testPodAddr, noopAnnouncer{})
	rig.hub, _ = rig.server.HubSession()

	rig.player = &types.Player{ID: uuid.New(), Username: "Wren"}
	registerTestConn(rig.server, rig.conn, rig.player)
	rig.character = rig.characters.giveRanked(rig.player.ID, class, level, ranks)
	_, err := rig.server.EnterHub(context.Background(), rig.conn, rig.character.ID.String())
	require.NoError(t, err)
	rig.inbox = startSoloListen(t, rig.server, rig.conn)
	return rig
}

// send sends spend_passive_point as the client does.
func (r *spendRig) send(nodeID string, rank int) {
	r.server.serverChan <- types.ClientPackage{Conn: r.conn, Message: types.Message{
		Action:  spendAction,
		Payload: map[string]interface{}{"node_id": nodeID, "rank": float64(rank)},
	}}
}

// spend spends straight on the server, as the hub does off its loop.
func (r *spendRig) spend(nodeID string, rank int) error {
	ctx, cancel := context.WithTimeout(context.Background(), passiveSpendTimeout)
	defer cancel()
	return r.server.SpendPassivePoint(ctx, r.conn, nodeID, rank)
}

// recordRanks is the ranks on the member's record.
func (r *spendRig) recordRanks(t *testing.T) passivetree.Ranks {
	t.Helper()
	stored, ok := r.server.PlayerByID(r.player.ID)
	require.True(t, ok)
	return r.server.characterOf(stored).PassiveRanks
}

// hubFrameTree is the passive tree on the latest hub frame sent here.
func (r *spendRig) hubFrameTree() (passivetree.Ranks, int, bool) {
	frame := r.inbox.latestFrame(r.hub.ID)
	if frame == nil || frame.CurrentPlayer == nil || frame.CurrentPlayer.PassiveState == nil {
		return nil, 0, false
	}
	return frame.CurrentPlayer.Ranks, frame.CurrentPlayer.Points, true
}

// Acceptance: in the HUB world with a point to spend, the spend persists the
// rank and the next current_player carries it, with passive_points one lower.
func TestSpendPassivePoint_InTown_PersistsAndTheNextStateCarriesIt(t *testing.T) {
	rig := newSpendRig(t, "warrior", 3, nil)

	require.Eventually(t, func() bool {
		ranks, points, ok := rig.hubFrameTree()
		return ok && len(ranks) == 0 && points == 2
	}, forfeitSettle, 10*time.Millisecond, "level 3 earns 2 before the spend")

	rig.send("warrior.t1a", 1)

	require.Eventually(t, func() bool {
		ranks, points, ok := rig.hubFrameTree()
		return ok && ranks["warrior.t1a"] == 1 && points == 1
	}, forfeitSettle, 10*time.Millisecond, "the next state carries the rank, one point fewer")
	assert.Equal(t, []spendCall{{rig.player.ID, rig.character.ID, "warrior.t1a", 1}}, rig.characters.spendCalls())
	assert.Equal(t, passivetree.Ranks{"warrior.t1a": 1}, rig.recordRanks(t), "the character in play takes it")

	_, refused := rig.inbox.awaitWithin(spendQuiet, spendAction)
	assert.False(t, refused, "nothing is sent on success")
}

// hubFrameHealth is the member's max and current HP on the latest hub frame.
func (r *spendRig) hubFrameHealth() (maxHP, currentHP int, ok bool) {
	frame := r.inbox.latestFrame(r.hub.ID)
	if frame == nil || frame.CurrentPlayer == nil {
		return 0, 0, false
	}
	return frame.CurrentPlayer.MaxHealth, frame.CurrentPlayer.CurrentHealth, true
}

// Acceptance (FS-8RZ51 R27): a spend in town of t1a raises the HUB body's max
// and current HP by the same amount at once: a level-3 warrior's own 174 max
// HP, 4% of it rounded is 7.
func TestSpendPassivePoint_InTown_TheHubBodyFeelsIt(t *testing.T) {
	rig := newSpendRig(t, "warrior", 3, nil)

	var maxBefore, currentBefore int
	require.Eventually(t, func() bool {
		var ok bool
		maxBefore, currentBefore, ok = rig.hubFrameHealth()
		_, points, treeOK := rig.hubFrameTree()
		return ok && treeOK && points == 2 && maxBefore > 0
	}, forfeitSettle, 10*time.Millisecond)

	rig.send("warrior.t1a", 1)

	require.Eventually(t, func() bool {
		maxHP, currentHP, ok := rig.hubFrameHealth()
		return ok && maxHP == maxBefore+7 && currentHP == currentBefore+7
	}, forfeitSettle, 10*time.Millisecond, "max and current HP rise by 7 together")
}

// Acceptance: in a field, a run or no world, refused "Points are spent in
// town."; character-service is not called.
func TestSpendPassivePoint_OutOfTown_IsRefusedWithoutACall(t *testing.T) {
	places := map[string]func(rig *spendRig) uuid.UUID{
		"a run": func(rig *spendRig) uuid.UUID {
			return rig.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{rig.player}}).ID
		},
		"a field": func(rig *spendRig) uuid.UUID {
			for _, fieldID := range rig.server.fields {
				return fieldID
			}
			t.Fatal("the pod has no field")
			return uuid.Nil
		},
		"no world": func(*spendRig) uuid.UUID { return uuid.Nil },
	}
	for where, place := range places {
		t.Run(where, func(t *testing.T) {
			rig := newSpendRig(t, "warrior", 3, nil)
			rig.server.setCurrentWorld(rig.player, place(rig))

			rig.send("warrior.t1a", 1)

			reply, answered := rig.inbox.await(spendAction)
			require.True(t, answered, "the spend was never answered")
			require.NotNil(t, reply.Error)
			assert.Equal(t, passiveNotInTown, *reply.Error)
			assert.Equal(t, passiveNotInTown, reply.Payload["message"])
			assert.Empty(t, rig.characters.spendCalls())
		})
	}
}

// Acceptance: while queued, refused "Leave the queue to spend points."; not
// called, and the queue is left as it was.
func TestSpendPassivePoint_WhileQueued_IsRefusedWithoutACall(t *testing.T) {
	rig := newSpendRig(t, "warrior", 3, nil)
	queued := *rig.player
	queued.Character = rig.character
	rig.queue.mu.Lock()
	rig.queue.players = append(rig.queue.players, &queued)
	rig.queue.mu.Unlock()

	err := rig.spend("warrior.t1a", 1)

	assert.Equal(t, passiveQueued, spendRefusalWords(err))
	assert.Empty(t, rig.characters.spendCalls())
	assert.Empty(t, rig.queue.removedPlayers(), "the queue is read, never changed")
	_, stillQueued, _ := rig.queue.QueuedCharacter(context.Background(), rig.player.ID)
	assert.True(t, stillQueued)
}

// An unreadable queue spends nothing: the point is kept for a retry.
func TestSpendPassivePoint_QueueUnreadable_IsNotSaved(t *testing.T) {
	rig := newSpendRig(t, "warrior", 3, nil)
	rig.queue.mu.Lock()
	rig.queue.queuedErr = errors.New("redis: connection refused")
	rig.queue.mu.Unlock()

	err := rig.spend("warrior.t1a", 1)

	assert.Equal(t, passiveNotSaved, spendRefusalWords(err))
	assert.Empty(t, rig.characters.spendCalls())
}

// warriorRanks is a warrior's held ranks by slot.
func warriorRanks(slots map[string]int) passivetree.Ranks {
	ranks := passivetree.Ranks{}
	for slot, rank := range slots {
		ranks["warrior."+slot] = rank
	}
	return ranks
}

// Acceptance: a rule refusal answers in its words (§Edge States) and does not
// call character-service.
func TestSpendPassivePoint_RuleRefusals_InTheirWords(t *testing.T) {
	tier1Full := map[string]int{"t1a": 2, "t1b": 2}
	tier3Open := map[string]int{"t1a": 2, "t1b": 2, "t2a": 3, "t2b": 3}
	// 18 spent above tier 6, one point left at level 20 once t6a is held
	tier6Open := map[string]int{"t1a": 2, "t1b": 2, "t2a": 3, "t2b": 3, "t3": 1, "t4a": 2, "t4b": 2, "t5a": 3}
	guardian := maps.Clone(tier6Open)
	guardian["t6a"] = 1

	tests := []struct {
		name  string
		level int
		held  map[string]int
		node  string
		rank  int
		want  string
	}{
		{"another class's node", 5, nil, "mage.t1a", 1, "Unknown node."},
		{"an unknown node", 5, nil, "warrior.t9z", 1, "Unknown node."},
		{"out of order", 5, nil, "warrior.t1a", 2, "Take the ranks one at a time."},
		{"max rank", 5, map[string]int{"t1a": 2}, "warrior.t1a", 3, "Already at its highest rank."},
		{"tier 2 one short", 10, map[string]int{"t1a": 2, "t1b": 1}, "warrior.t2a", 1, "Spend 1 more point above to open this tier."},
		{"tier 2 with nothing spent", 10, nil, "warrior.t2a", 1, "Spend 4 more points above to open this tier."},
		{"tier 4 before the ability", 20, tier3Open, "warrior.t4a", 1, "Take Earthbreaker first."},
		{"no points", 5, tier1Full, "warrior.t2a", 1, "No points to spend."},
		{"the other specialization", 20, guardian, "warrior.t6b", 1, "You chose Guardian."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newSpendRig(t, "warrior", tt.level, warriorRanks(tt.held))

			err := rig.spend(tt.node, tt.rank)

			assert.Equal(t, tt.want, spendRefusalWords(err))
			assert.Empty(t, rig.characters.spendCalls())
		})
	}
}

// The mage's tree ability and specialization are named for the mage.
func TestSpendPassivePoint_RefusalsNameTheClasssOwn(t *testing.T) {
	held := passivetree.Ranks{"mage.t1a": 2, "mage.t1b": 2, "mage.t2a": 3, "mage.t2b": 3}
	assert.Equal(t, "Take Blink first.", tierLockedWords("mage", held, "mage.t4a"))
	assert.Equal(t, "You chose Pyromancer.", specializationTakenWords("mage", passivetree.Ranks{"mage.t6b": 1}))
}

// Acceptance: a repeat of a spend already applied sends nothing and calls
// nothing.
func TestSpendPassivePoint_AlreadyHeld_SendsAndCallsNothing(t *testing.T) {
	rig := newSpendRig(t, "warrior", 5, warriorRanks(map[string]int{"t1a": 1}))

	rig.send("warrior.t1a", 1)

	_, answered := rig.inbox.awaitWithin(spendQuiet, spendAction)
	assert.False(t, answered, "nothing is sent")
	assert.Empty(t, rig.characters.spendCalls())
	assert.Equal(t, warriorRanks(map[string]int{"t1a": 1}), rig.recordRanks(t))
}

// Acceptance: character-service unreachable, timing out or not finding the
// character: refused "Could not save the point. Try again.", the character in
// play unchanged.
func TestSpendPassivePoint_CharacterServiceFails_NotSaved(t *testing.T) {
	failures := map[string]func(f *fakeCharacters){
		"unreachable": func(f *fakeCharacters) { f.spendErr = errors.New("connection refused") },
		"not found":   func(f *fakeCharacters) { f.spendErr = fmt.Errorf("spend: %w", types.ErrCharacterNotFound) },
		"timing out":  func(f *fakeCharacters) { f.spendHold = make(chan struct{}) },
	}
	for name, fail := range failures {
		t.Run(name, func(t *testing.T) {
			rig := newSpendRig(t, "warrior", 3, nil)
			rig.characters.mu.Lock()
			fail(rig.characters)
			rig.characters.mu.Unlock()

			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			defer cancel()
			err := rig.server.SpendPassivePoint(ctx, rig.conn, "warrior.t1a", 1)

			assert.Equal(t, passiveNotSaved, spendRefusalWords(err))
			assert.Len(t, rig.characters.spendCalls(), 1, "never retried")
			assert.Empty(t, rig.recordRanks(t))
			assert.Empty(t, systems.PassiveRanks(hubBodyOf(t, rig.hub, rig.player.ID)))
		})
	}
}

// Acceptance: after a run raised the level, character-service refusing with
// no points (its grant not yet consumed) reads as a level still being
// recorded. Any other refusal of its own reads in the rule's words.
func TestSpendPassivePoint_CharacterServiceRefuses(t *testing.T) {
	tests := []struct {
		rule *passivetree.Refusal
		want string
	}{
		{passivetree.ErrNoPoints, "Your new level is still being recorded. Try again in a moment."},
		{passivetree.ErrMaxRank, "Already at its highest rank."},
		{passivetree.ErrUnknownNode, "Unknown node."},
	}
	for _, tt := range tests {
		t.Run(string(tt.rule.Code), func(t *testing.T) {
			rig := newSpendRig(t, "warrior", 3, nil)
			rig.characters.mu.Lock()
			rig.characters.spendErr = fmt.Errorf("spend: %w", tt.rule)
			rig.characters.mu.Unlock()

			rig.send("warrior.t1a", 1)

			reply, answered := rig.inbox.await(spendAction)
			require.True(t, answered)
			require.NotNil(t, reply.Error)
			assert.Equal(t, tt.want, *reply.Error)
			assert.Empty(t, rig.recordRanks(t))
		})
	}
}

// Acceptance: the spend runs off the message hub's loop: a character-service
// that does not answer does not delay another connection's messages.
func TestSpendPassivePoint_RunsOffTheLoop(t *testing.T) {
	rig := newSpendRig(t, "warrior", 3, nil)
	hold := make(chan struct{})
	rig.characters.mu.Lock()
	rig.characters.spendHold = hold
	rig.characters.mu.Unlock()
	defer close(hold)

	rig.send("warrior.t1a", 1)
	require.Eventually(t, func() bool { return len(rig.characters.spendCalls()) == 1 }, forfeitSettle, 5*time.Millisecond)

	// another connection, answered on the loop while the spend waits
	other := &websocket.Conn{}
	registerTestConn(rig.server, other, &types.Player{ID: uuid.New(), Username: "Kaelen"})
	otherInbox := startSoloListen(t, rig.server, other)
	rig.server.serverChan <- types.ClientPackage{Conn: other, Message: types.Message{Action: string(constants.ActionLeaveRun)}}

	reply, answered := otherInbox.awaitWithin(time.Second, string(constants.ActionLeaveRun))
	require.True(t, answered, "the loop is held by the spend")
	assert.Equal(t, "You are not in a delve.", reply.Payload["message"])
}

// Acceptance: two OK answers arriving out of order leave the record, and the
// HUB world body, at the higher ranks.
func TestSpendPassivePoint_AnswersOutOfOrder_KeepTheHigherRanks(t *testing.T) {
	rig := newSpendRig(t, "warrior", 6, nil)
	rig.characters.mu.Lock()
	rig.characters.scripted = []passivetree.Ranks{
		warriorRanks(map[string]int{"t1a": 2}),
		// an answer that left character-service before the one above
		warriorRanks(map[string]int{"t1a": 1, "t1b": 1}),
	}
	rig.characters.mu.Unlock()

	require.NoError(t, rig.spend("warrior.t1a", 1))
	require.NoError(t, rig.spend("warrior.t1b", 1))

	want := warriorRanks(map[string]int{"t1a": 2, "t1b": 1})
	assert.Equal(t, want, rig.recordRanks(t))
	assert.Equal(t, want, systems.PassiveRanks(hubBodyOf(t, rig.hub, rig.player.ID)))
}

// The acting player is the connection's (ADR-0079): a player id in the
// payload spends nobody else's point.
func TestSpendPassivePoint_ActsForTheConnectionsPlayer(t *testing.T) {
	rig := newSpendRig(t, "warrior", 3, nil)

	rig.server.serverChan <- types.ClientPackage{Conn: rig.conn, Message: types.Message{
		Action:  spendAction,
		Payload: map[string]interface{}{"node_id": "warrior.t1a", "rank": float64(1), "player_id": uuid.NewString()},
	}}

	require.Eventually(t, func() bool { return len(rig.characters.spendCalls()) == 1 }, forfeitSettle, 5*time.Millisecond)
	assert.Equal(t, rig.player.ID, rig.characters.spendCalls()[0].memberID)
}

// A payload with no node or no whole target rank is refused, nothing called.
func TestSpendPassivePoint_MalformedPayload(t *testing.T) {
	tests := map[string]struct {
		payload map[string]interface{}
		want    string
	}{
		"no node":         {map[string]interface{}{"rank": float64(1)}, "Unknown node."},
		"a node not text": {map[string]interface{}{"node_id": 7, "rank": float64(1)}, "Unknown node."},
		"no rank":         {map[string]interface{}{"node_id": "warrior.t1a"}, "Take the ranks one at a time."},
		"a part rank":     {map[string]interface{}{"node_id": "warrior.t1a", "rank": 1.5}, "Take the ranks one at a time."},
		"rank 0":          {map[string]interface{}{"node_id": "warrior.t1a", "rank": float64(0)}, "Take the ranks one at a time."},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			rig := newSpendRig(t, "warrior", 3, nil)

			rig.server.serverChan <- types.ClientPackage{Conn: rig.conn, Message: types.Message{Action: spendAction, Payload: tt.payload}}

			reply, answered := rig.inbox.await(spendAction)
			require.True(t, answered)
			require.NotNil(t, reply.Error)
			assert.Equal(t, tt.want, *reply.Error)
			assert.Empty(t, rig.characters.spendCalls())
		})
	}
}

// Acceptance: entering the HUB loads the character's ranks into the character
// in play and onto the body; a same-pod switch into a run carries them.
func TestEntry_TheRanksRideTheCharacterInPlay(t *testing.T) {
	ranks := warriorRanks(map[string]int{"t1a": 2, "t1b": 1})
	rig := newSpendRig(t, "warrior", 6, ranks)

	assert.Equal(t, ranks, rig.recordRanks(t))
	assert.Equal(t, ranks, systems.PassiveRanks(hubBodyOf(t, rig.hub, rig.player.ID)))

	run := rig.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{rig.player}})
	assert.Equal(t, ranks, systems.PassiveRanks(hubBodyOf(t, run, rig.player.ID)), "the run seats the record's ranks")
}

// A handoff seat is built from the queue entry's character, which crosses pods
// as JSON: the ranks cross with it.
func TestCharacterInPlay_TheRanksCrossAsJSON(t *testing.T) {
	character := types.CharacterInPlay{ID: uuid.New(), Class: "archer", Level: 7, PassiveRanks: passivetree.Ranks{"archer.t1a": 2}}

	encoded, err := json.Marshal(character)
	require.NoError(t, err)
	var decoded types.CharacterInPlay
	require.NoError(t, json.Unmarshal(encoded, &decoded))

	assert.Equal(t, character, decoded)
}

// hubBodyOf finds the member's body in a world.
func hubBodyOf(t *testing.T, world *game.Session, memberID uuid.UUID) *ecs.Entity {
	t.Helper()
	for _, entity := range world.EntityManager.GetAllEntities() {
		if pc, ok := entity.GetComponent(ecs.ComponentTypePlayer); ok && pc.(*components.PlayerComponent).MemberID == memberID {
			return entity
		}
	}
	t.Fatalf("member %s has no body in world %s", memberID, world.ID)
	return nil
}

// awaitWithin is await bounded by d rather than the usual settle.
func (in *startSoloInbox) awaitWithin(d time.Duration, actions ...string) (types.Message, bool) {
	deadline := time.After(d)
	for {
		select {
		case msg := <-in.messages:
			for _, action := range actions {
				if msg.Action == action {
					return msg, true
				}
			}
		case <-deadline:
			return types.Message{}, false
		}
	}
}
