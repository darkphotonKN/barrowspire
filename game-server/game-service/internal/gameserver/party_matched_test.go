package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-988SM §Requirements R1–R6, R8–R10, R19, R22. I-988SM-1.
//
// When the host pod creates a run from a random match, it makes one matched party of every matched
// player, those on other pods included before they are seated: a leader at random among the local
// players, every member told joined, the run remembered as the party's so the instance lock holds
// it. Seating a remote adds nothing. A party failure never holds up the run.

// matchedPlayer is one matched player as seated on this pod.
type matchedPlayer struct {
	player *types.Player
	conn   *websocket.Conn
	inbox  *startSoloInbox
}

// seatedForMatch seats each named player in the hub, ready to be matched.
func seatedForMatch(t *testing.T, rig *partyRig, names ...string) []matchedPlayer {
	t.Helper()
	out := make([]matchedPlayer, 0, len(names))
	for _, name := range names {
		player, conn, inbox := rig.inHub(t, name)
		out = append(out, matchedPlayer{player: player, conn: conn, inbox: inbox})
	}
	return out
}

// matchOnThisPod has the matchmaker pop players, every one on this pod, and waits for each to be
// sent into the one run created for them, which is returned.
func matchOnThisPod(t *testing.T, rig *partyRig, players ...matchedPlayer) *game.Session {
	t.Helper()
	return matchWith(t, rig, players)
}

// otherPodID is the pod a remote matched player queued on.
const otherPodID = "pod-other"

// remoteMatched is a matched player queued on another pod, never connected here.
func remoteMatched(name string) matchmaker.MatchStartPlayer {
	return matchmaker.MatchStartPlayer{
		ID:        uuid.New(),
		Pod:       otherPodID,
		Character: types.CharacterInPlay{ID: uuid.New(), Name: name, Class: "warrior", Level: 1},
	}
}

// pushMatch has the matchmaker pop locals, on this pod, then remotes, on another.
func pushMatch(rig *partyRig, locals []matchedPlayer, remotes ...matchmaker.MatchStartPlayer) {
	match := matchmaker.MatchStart{PodID: testPodID, Step: matchmaker.MatchStepCreate}
	for _, p := range locals {
		match.Players = append(match.Players, matchmaker.MatchStartPlayer{ID: p.player.ID, Pod: testPodID, Character: p.player.Character})
	}
	match.Players = append(match.Players, remotes...)
	rig.queue.matchedChan <- match
}

// matchWith has the matchmaker pop locals, on this pod, then remotes, on another, and waits for
// each local to be sent into the one run created for them, which is returned.
func matchWith(t *testing.T, rig *partyRig, locals []matchedPlayer, remotes ...matchmaker.MatchStartPlayer) *game.Session {
	t.Helper()
	pushMatch(rig, locals, remotes...)

	var run *game.Session
	for _, p := range locals {
		entered := awaitRunEntered(t, rig.server, p.inbox, p.player.Character.Name)
		if run != nil {
			require.Equal(t, run.ID, entered.ID, "one run for the whole match")
		}
		run = entered
	}
	return run
}

// awaitJoinedSelf waits for the matched party's joined update to p, about p.
func awaitJoinedSelf(t *testing.T, p matchedPlayer) types.Message {
	t.Helper()
	return awaitUpdate(t, p.inbox, "joined", p.player.ID, p.player.Character.Name)
}

// A match whose players are all on this pod makes one matched party of every one of them, led by
// one of them, the leader listed first; each member is told joined, about themselves, with the
// whole party. The matched origin is in the Redis record and in no message; the run is
// remembered as the party's. AC rows 1, 2; R1–R5, R19.
func TestMatchedParty_AllLocal_EveryMemberJoinedLedByOne(t *testing.T) {
	rig := newPartyRig(t)
	players := seatedForMatch(t, rig, "Wren", "Kaelen")
	ids := []string{players[0].player.ID.String(), players[1].player.ID.String()}

	run := matchOnThisPod(t, rig, players...)

	var partyID, leader string
	for _, p := range players {
		update := awaitJoinedSelf(t, p)
		members := memberIDsOf(t, update)
		assert.ElementsMatch(t, ids, members, "%s: every matched player is a member", p.player.Character.Name)
		leader, _ = update.Payload["leader_id"].(string)
		assert.Contains(t, ids, leader, "the leader is one of the matched players")
		assert.Equal(t, leader, members[0], "the leader joined first")
		assert.NotContains(t, update.Payload, "origin", "the origin is never shown")
		if partyID != "" {
			assert.Equal(t, partyID, update.Payload["party_id"], "one party")
		}
		partyID, _ = update.Payload["party_id"].(string)
	}

	assert.Equal(t, "matched", rig.mini.HGet(partyKey(partyID), "origin"))
	var remembered partyRun
	rig.onLoop(t, func(reg *partyRegistry) { remembered = reg.partyRuns[run.ID] })
	assert.Equal(t, uuid.MustParse(partyID), remembered.partyID, "the run is remembered as the party's")
	assert.ElementsMatch(t, []uuid.UUID{players[0].player.ID, players[1].player.ID}, remembered.roster)
}

// The leader is drawn at random among the local players, never a player on another pod: over many
// matches, each of the two locals leads some, and the remote none. R4.
func TestMatchedParty_LeaderAtRandomAmongLocals(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	led := map[int]bool{}
	for i := 0; i < 16 && len(led) < 2; i++ {
		players := seatedForMatch(t, rig, "Wren", "Kaelen")
		marl := remoteMatched("Marl")
		matchWith(t, rig, players, marl)
		update := awaitJoinedSelf(t, players[0])
		require.NotEqual(t, marl.ID.String(), update.Payload["leader_id"], "a remote never leads")
		assert.Equal(t, marl.ID.String(), memberIDsOf(t, update)[2], "the remote joins after the locals")
		for j, p := range players {
			if update.Payload["leader_id"] == p.player.ID.String() {
				led[j] = true
			}
		}
	}
	assert.Len(t, led, 2, "both the first and the second local lead some matches")
}

// Inside the run, a matched member's party_leave, party_kick and party_transfer are refused
// locked, as for a party that entered from the gate; nobody is told of a change. AC row 6; R5,
// R22. (No loot-rule action exists yet: FS-V780R is a draft.)
func TestMatchedParty_InTheRun_LeaveKickTransferRefusedLocked(t *testing.T) {
	tests := []struct {
		name   string
		action string
		// whether the leader sends it, naming the other member
		byLeader bool
	}{
		{"a member leaves", partyLeaveAction, false},
		{"the leader leaves", partyLeaveAction, true},
		{"the leader kicks the member", partyKickAction, true},
		{"the leader hands the lead to the member", partyTransferAction, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRig(t)
			players := seatedForMatch(t, rig, "Wren", "Kaelen")
			matchOnThisPod(t, rig, players...)
			update := awaitJoinedSelf(t, players[0])
			awaitJoinedSelf(t, players[1])
			leader, member := players[0], players[1]
			if update.Payload["leader_id"] != leader.player.ID.String() {
				leader, member = member, leader
			}

			sender, other := member, leader
			payload := map[string]interface{}{}
			if tt.byLeader {
				sender, other = leader, member
				payload["target_id"] = member.player.ID.String()
			}
			sendParty(rig.server, sender.conn, tt.action, payload)

			assertNoticeCode(t, sender.inbox, sender.player.Character.Name, "locked")
			assertNoParty(t, other.inbox, partyUpdateAction, other.player.Character.Name+": nothing changed")
			p, err := partystore.NewRedis(rig.client).PartyOf(context.Background(), leader.player.ID, rig.partyClock.now())
			require.NoError(t, err)
			assert.Equal(t, leader.player.ID, p.Party.Leader, "the lead stays")
			assert.Len(t, p.Party.Members, 2, "everyone stays")
		})
	}
}

// matchFailedText is what every player of a cancelled match is refused with. R8a.
const matchFailedText = "The match failed. Queue again."

// awaitMatchFailed waits for the find_game refusal of a cancelled match, failing if a
// world_entered comes first.
func awaitMatchFailed(t *testing.T, inbox *startSoloInbox, who string) {
	t.Helper()
	msg, got := inbox.await(string(constants.ActionFindGame), string(constants.ActionWorldEntered))
	require.True(t, got, "%s was never told the match failed", who)
	require.Equal(t, string(constants.ActionFindGame), msg.Action, "%s is refused, never sent in", who)
	require.NotNil(t, msg.Error, "%s: a refusal", who)
	assert.Equal(t, matchFailedText, *msg.Error, who)
	assert.Equal(t, matchFailedText, msg.Payload["message"], who)
}

// assertNothingOf waits a while and fails on any message to inbox with one of actions.
func assertNothingOf(t *testing.T, inbox *startSoloInbox, who string, actions ...string) {
	t.Helper()
	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-inbox.messages:
			for _, action := range actions {
				assert.NotEqual(t, action, msg.Action, "%s should get no %s; got %v", who, action, msg.Payload)
			}
		case <-deadline:
			return
		}
	}
}

// cancelWarnings are the Warn lines that name playerID and say the match was cancelled.
func cancelWarnings(sink *lockedLog, playerID uuid.UUID) []string {
	var out []string
	for _, line := range warnLinesWith(sink, playerID.String()) {
		if strings.Contains(line, "cancel") {
			out = append(out, line)
		}
	}
	return out
}

// queuedCount is how many players the queue holds.
func (m *mockQueueService) queuedCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.players)
}

// A match whose players are all on this pod, one of them already in a party, is cancelled: no
// matched party, no run, nobody leaves the hub; every one is refused "The match failed", the one in
// a party included, who keeps their own party untouched; nobody is queued again; the pod logs the
// cancel at Warn naming them. AC rows 5, 6, 7; R3a, R8, R8a, R19.
func TestMatchedParty_LocalAlreadyInAParty_MatchCancelledEveryoneRefused(t *testing.T) {
	sink := captureLogs(t)
	announcer := &recordingAnnouncer{}
	rig := newPartyRigAnnouncing(t, &MockAuthClient{}, announcer, func(redis.UniversalClient) []Option { return nil })
	players := seatedForMatch(t, rig, "Wren", "Kaelen")
	wren, kaelen := players[0], players[1]
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wren.conn, wren.inbox, "Idris", idrisConn, idrisInbox)
	store := partystore.NewRedis(rig.client)
	own, err := store.PartyOf(context.Background(), wren.player.ID, rig.partyClock.now())
	require.NoError(t, err)

	pushMatch(rig, players)

	for _, p := range players {
		awaitMatchFailed(t, p.inbox, p.player.Character.Name)
		assertNothingOf(t, p.inbox, p.player.Character.Name, string(constants.ActionWorldEntered), partyUpdateAction)
		assert.True(t, rig.hub.HasPlayer(p.player.ID), "%s never left the hub", p.player.Character.Name)
	}
	after, err := store.PartyOf(context.Background(), wren.player.ID, rig.partyClock.now())
	require.NoError(t, err)
	assert.Equal(t, own.Party.ID, after.Party.ID, "Wren keeps their own party")
	assert.Equal(t, memberIDs(own.Party), memberIDs(after.Party), "their own party is untouched")
	assert.False(t, rig.mini.Exists("{party}:pl:"+kaelen.player.ID.String()), "Kaelen is in no party")
	assert.Empty(t, announcer.recorded(), "no handoff announced")
	assert.Zero(t, rig.queue.queuedCount(), "nobody is queued again")
	assert.NotEmpty(t, cancelWarnings(sink, wren.player.ID), "the pod logs the cancel at Warn, naming Wren")
}

// A match with a player on another pod, either of them already in a party, is cancelled: nothing
// written, no run, no world_entered, no handoff announced; the local is refused directly, and the
// remote's own pod is sent a match_failed letter for them. AC rows 5, 6, 7; R3a, R8, R8a.
func TestMatchedParty_LocalOrRemoteInAParty_MatchCancelledRemoteLettered(t *testing.T) {
	tests := []struct {
		name string
		// whether the remote is the one in a party, or the local
		remoteGrouped bool
	}{
		{"the local is in a party", false},
		{"the remote is in a party", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sink := captureLogs(t)
			announcer := &recordingAnnouncer{}
			inbox := newRecordingInbox()
			rig := newPartyRigAnnouncing(t, &MockAuthClient{}, announcer, func(redis.UniversalClient) []Option {
				return []Option{WithPodInbox(inbox)}
			})
			wren := seatedForMatch(t, rig, "Wren")
			marl := remoteMatched("Marl")
			store := partystore.NewRedis(rig.client)
			grouped, free := wren[0].player.ID, marl.ID
			if tt.remoteGrouped {
				grouped, free = marl.ID, wren[0].player.ID
				_, err := store.Create(context.Background(), uuid.New(), partystore.Joiner{PlayerID: marl.ID, Name: "Marl", Class: "warrior"}, rig.partyClock.now())
				require.NoError(t, err)
			} else {
				_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
				rig.partied(t, wren[0].conn, wren[0].inbox, "Idris", idrisConn, idrisInbox)
			}

			pushMatch(rig, wren, marl)

			awaitMatchFailed(t, wren[0].inbox, "Wren")
			assertNothingOf(t, wren[0].inbox, "Wren", string(constants.ActionWorldEntered), partyUpdateAction)
			assert.True(t, rig.hub.HasPlayer(wren[0].player.ID), "Wren never left the hub")
			var letters []letter
			require.Eventually(t, func() bool {
				letters = inbox.letters()[inboxChannel(otherPodID)]
				return len(letters) > 0
			}, settle, 10*time.Millisecond, "Marl's pod is written to")
			require.Len(t, letters, 1, "one letter, for Marl")
			assert.Equal(t, letterMatchFailed, letters[0].Kind)
			assert.Equal(t, marl.ID.String(), letters[0].ToPlayerID)
			assert.False(t, rig.mini.Exists("{party}:pl:"+free.String()), "the free player is in no party")
			assert.Empty(t, announcer.recorded(), "no handoff announced")
			assert.NotEmpty(t, cancelWarnings(sink, grouped), "the pod logs the cancel at Warn, naming the one in a party")
		})
	}
}

// A cancelled match's remote player is told by their own pod: pod A hosts the match, Marl on pod
// B is already in a party, and B turns A's match_failed letter into the same find_game refusal;
// Wren, on A, is refused directly. AC row 6; R8a.
func TestMatchedParty_Cancelled_RemoteRefusedByTheirOwnPod(t *testing.T) {
	a, b, _ := twoPartyPods(t)
	wren, _, wrenInbox := a.inHub(t, "Wren")
	marl, _, marlInbox := b.inHub(t, "Marl")
	_, err := partystore.NewRedis(b.client).Create(context.Background(), uuid.New(), joinerOf(marl), b.partyClock.now())
	require.NoError(t, err)

	a.queue.matchedChan <- matchmaker.MatchStart{PodID: a.podID, Step: matchmaker.MatchStepCreate, Players: []matchmaker.MatchStartPlayer{
		{ID: wren.ID, Pod: a.podID, Character: wren.Character},
		{ID: marl.ID, Pod: b.podID, Character: marl.Character},
	}}

	awaitMatchFailed(t, wrenInbox, "Wren, on the host")
	awaitMatchFailed(t, marlInbox, "Marl, on pod B")
	assertNothingOf(t, marlInbox, "Marl", string(constants.ActionWorldHandoff), partyUpdateAction)
}

// partyStoreGate holds every matched create until it is opened, so a test can see what the hub
// does while the script has not answered.
type partyStoreGate struct {
	*partystore.Redis
	open chan struct{}
}

func (g *partyStoreGate) CreateMatched(ctx context.Context, a partystore.MatchedArgs) (partystore.MatchedResult, error) {
	<-g.open
	return g.Redis.CreateMatched(ctx, a)
}

// The run is created only once the creation script has answered: until then nobody is sent in,
// no handoff is announced, and everyone stands in the hub; once it answers, the run is created,
// every local sent in and the other pods told, the run existing when they are. AC row 8; R3a.
func TestMatchedParty_RunCreatedOnlyAfterTheScriptAnswers(t *testing.T) {
	announcer := &recordingAnnouncer{}
	gate := &partyStoreGate{open: make(chan struct{})}
	rig := newPartyRigAnnouncing(t, &MockAuthClient{}, announcer, func(client redis.UniversalClient) []Option {
		gate.Redis = partystore.NewRedis(client)
		return []Option{WithPartyStore(gate)}
	})
	announcer.server = rig.server
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")

	pushMatch(rig, wren, marl)

	assertNothingOf(t, wren[0].inbox, "Wren, before the script answers", string(constants.ActionWorldEntered), partyUpdateAction)
	assert.True(t, rig.hub.HasPlayer(wren[0].player.ID), "no run yet: Wren stands in the hub")
	assert.Empty(t, announcer.recorded(), "no handoff before the script answers")

	close(gate.open)

	run := awaitRunEntered(t, rig.server, wren[0].inbox, "Wren")
	update := awaitJoinedSelf(t, wren[0])
	assert.Equal(t, []string{wren[0].player.ID.String(), marl.ID.String()}, memberIDsOf(t, update))
	require.Eventually(t, func() bool { return len(announcer.recorded()) == 1 }, settle, 10*time.Millisecond, "the other pod is told")
	call := announcer.recorded()[0]
	assert.Equal(t, run.ID, call.payload.SessionID)
	assert.True(t, call.sessionExists, "the run exists when the other pod is told")
}

// A local matched player who is gone from the town while the creation script is out is left out of
// the run, and leaves the matched party as one leaving the run does: the run seats only those still
// in town, the other is told left, the gone one's pointer is gone and the run's roster forgets
// them. Gone is a record deleted, or one naming another world; a player inside their reconnect
// grace is not gone (see the next test). Edge States "A local matched player is gone before the
// run is created"; R4, R11; code review round 1, Standards #1; round 2, Spec #1.
func TestMatchedParty_LocalGoneWhileTheScriptRuns_LeftOutOfRunAndParty(t *testing.T) {
	tests := []struct {
		name string
		// what becomes of Kaelen while the script has not answered
		gone func(t *testing.T, rig *partyRig, kaelen matchedPlayer)
		// whether Kaelen's record is still held here afterwards
		held bool
	}{
		{"drops and the grace runs out", func(t *testing.T, rig *partyRig, kaelen matchedPlayer) {
			_, hold, held := rig.server.holdForReconnect(kaelen.conn)
			require.True(t, held, "the connection carried Kaelen")
			rig.server.cleanUpPlayerCompletely(kaelen.player.ID, hold)
		}, false},
		{"starts a run of their own", func(t *testing.T, rig *partyRig, kaelen matchedPlayer) {
			rig.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{kaelen.player}})
		}, true},
		{"goes out into a field", func(t *testing.T, rig *partyRig, kaelen matchedPlayer) {
			rig.hub.RemovePlayer(kaelen.player.ID.String())
			rig.meadows.AddPlayerAt(kaelen.player.ID, kaelen.player.Character, "", 200, 200)
			rig.server.setCurrentWorld(kaelen.player, rig.meadows.ID)
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gate := &partyStoreGate{open: make(chan struct{})}
			rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
				gate.Redis = partystore.NewRedis(client)
				return []Option{WithPartyStore(gate)}
			})
			players := seatedForMatch(t, rig, "Wren", "Kaelen")
			wren, kaelen := players[0], players[1]
			pushMatch(rig, players)
			rig.onLoop(t, func(*partyRegistry) {}) // the match is resolved, its script held

			tt.gone(t, rig, kaelen)
			close(gate.open)

			run := awaitRunEntered(t, rig.server, wren.inbox, "Wren")
			assert.True(t, run.HasPlayer(wren.player.ID), "Wren plays the run")
			assert.False(t, run.HasPlayer(kaelen.player.ID), "no body in the run for Kaelen")
			record, held := rig.server.PlayerByID(kaelen.player.ID)
			assert.Equal(t, tt.held, held, "Kaelen's record")
			if held {
				assert.NotEqual(t, run.ID, record.CurrentGameSessionId, "Kaelen's record never points at the run")
			}
			left := awaitUpdate(t, wren.inbox, "left", kaelen.player.ID, "Wren")
			assert.Equal(t, []string{wren.player.ID.String()}, memberIDsOf(t, left), "the party without Kaelen")
			require.Eventually(t, func() bool { return !rig.mini.Exists(pointerKey(kaelen.player.ID)) },
				settle, 10*time.Millisecond, "Kaelen's pointer is gone")
			assert.Equal(t, []uuid.UUID{wren.player.ID}, rosterOf(t, rig, run), "the run's roster forgets Kaelen")
		})
	}
}

// A local matched player who drops into their reconnect grace while the creation script is out is
// not gone: closing the tab is a disconnect, host player or not. They go into the run as a
// disconnected member and stay in the matched party, told nothing of leaving; the run's normal
// grace then applies to them, so their grace running out takes them out of the run and the party.
// R7, R18; code review round 2, Spec #1.
func TestMatchedParty_LocalInTheGraceWhileTheScriptRuns_InTheRunAndTheParty(t *testing.T) {
	gate := &partyStoreGate{open: make(chan struct{})}
	rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
		gate.Redis = partystore.NewRedis(client)
		return []Option{WithPartyStore(gate)}
	})
	players := seatedForMatch(t, rig, "Wren", "Kaelen")
	wren, kaelen := players[0], players[1]
	pushMatch(rig, players)
	rig.onLoop(t, func(*partyRegistry) {}) // the match is resolved, its script held

	_, hold, held := rig.server.holdForReconnect(kaelen.conn)
	require.True(t, held, "the connection carried Kaelen")
	close(gate.open)

	run := awaitRunEntered(t, rig.server, wren.inbox, "Wren")
	assert.True(t, run.HasPlayer(kaelen.player.ID), "Kaelen is in the run, disconnected")
	assert.Equal(t, run.ID, startSoloWorldOnRecord(t, rig.server, kaelen.player.ID), "Kaelen's record points at the run")
	both := []string{wren.player.ID.String(), kaelen.player.ID.String()}
	assert.ElementsMatch(t, both, memberIDsOf(t, awaitJoinedSelf(t, wren)), "Kaelen is a member")
	assert.ElementsMatch(t, []uuid.UUID{wren.player.ID, kaelen.player.ID}, rosterOf(t, rig, run))
	assertNobodyLeft(t, wren.inbox, "Wren")

	rig.server.cleanUpPlayerCompletely(kaelen.player.ID, hold)

	left := awaitUpdate(t, wren.inbox, "left", kaelen.player.ID, "Wren")
	assert.Equal(t, []string{wren.player.ID.String()}, memberIDsOf(t, left), "the party without Kaelen")
	assert.False(t, run.HasPlayer(kaelen.player.ID), "the grace ran out: Kaelen's body is gone")
	assert.Equal(t, []uuid.UUID{wren.player.ID}, rosterOf(t, rig, run), "the run's roster forgets Kaelen")
}

// The host's only local matched player dropping into their reconnect grace while the script is out
// does not fail the match: the run starts with them in it, disconnected, and the remote player's
// pod is told to hand theirs over, never that the match failed. R7, R8a; code review round 2,
// Spec #1.
func TestMatchedParty_SoleLocalInTheGrace_MatchGoesOn(t *testing.T) {
	gate := &partyStoreGate{open: make(chan struct{})}
	announcer := &recordingAnnouncer{}
	inbox := newRecordingInbox()
	rig := newPartyRigAnnouncing(t, &MockAuthClient{}, announcer, func(client redis.UniversalClient) []Option {
		gate.Redis = partystore.NewRedis(client)
		return []Option{WithPartyStore(gate), WithPodInbox(inbox)}
	})
	announcer.server = rig.server
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")
	pushMatch(rig, wren, marl)
	rig.onLoop(t, func(*partyRegistry) {}) // the match is resolved, its script held

	_, _, held := rig.server.holdForReconnect(wren[0].conn)
	require.True(t, held, "the connection carried Wren")
	close(gate.open)

	require.Eventually(t, func() bool { return len(announcer.recorded()) == 1 }, settle, 10*time.Millisecond, "Marl's pod is told to hand him over")
	call := announcer.recorded()[0]
	assert.True(t, call.sessionExists, "the run exists")
	assert.Equal(t, call.payload.SessionID, startSoloWorldOnRecord(t, rig.server, wren[0].player.ID), "Wren's record points at the run")
	rig.settle(t)
	for _, l := range inbox.letters()[inboxChannel(otherPodID)] {
		assert.NotEqual(t, letterMatchFailed, l.Kind, "the match did not fail")
	}
	assert.True(t, rig.mini.Exists(pointerKey(wren[0].player.ID)), "Wren is in the matched party")
	assert.True(t, rig.mini.Exists(pointerKey(marl.ID)), "Marl is in the matched party")
}

// With every local matched player gone from the town while the script is out, no run starts: the
// matched party loses every member, nobody is handed off, and the match fails for those it can
// still reach, the remote by a match_failed letter to their pod. R4, R8a; code review round 1,
// Standards #1.
func TestMatchedParty_EveryLocalGoneWhileTheScriptRuns_NoRunPartyLetGo(t *testing.T) {
	gate := &partyStoreGate{open: make(chan struct{})}
	announcer := &recordingAnnouncer{}
	inbox := newRecordingInbox()
	rig := newPartyRigAnnouncing(t, &MockAuthClient{}, announcer, func(client redis.UniversalClient) []Option {
		gate.Redis = partystore.NewRedis(client)
		return []Option{WithPartyStore(gate), WithPodInbox(inbox)}
	})
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")
	sessions := startSoloSessionCount(rig.server)
	pushMatch(rig, wren, marl)
	rig.onLoop(t, func(*partyRegistry) {}) // the match is resolved, its script held

	// Wren drops and her grace runs out: her record is gone
	_, hold, held := rig.server.holdForReconnect(wren[0].conn)
	require.True(t, held, "the connection carried Wren")
	rig.server.cleanUpPlayerCompletely(wren[0].player.ID, hold)
	close(gate.open)

	require.Eventually(t, func() bool {
		letters := inbox.letters()[inboxChannel(otherPodID)]
		return len(letters) > 0 && letters[0].Kind == letterMatchFailed
	}, settle, 10*time.Millisecond, "Marl's pod is told the match failed")
	require.Eventually(t, func() bool {
		return !rig.mini.Exists(pointerKey(marl.ID)) && !rig.mini.Exists(pointerKey(wren[0].player.ID))
	}, settle, 10*time.Millisecond, "the matched party lets everyone go")
	assert.Equal(t, sessions, startSoloSessionCount(rig.server), "no run starts")
	assert.Empty(t, announcer.recorded(), "nobody is handed off")
	for _, l := range inbox.letters()[inboxChannel(otherPodID)] {
		assert.NotEqual(t, letterPartyUpdate, l.Kind, "Marl is told nothing of a party")
	}
}

// partyStoreRemovesDown fails every removal while down is set, as Redis down does, and holds the
// matched create as partyStoreGate does.
type partyStoreRemovesDown struct {
	*partyStoreGate
	down atomic.Bool
}

func (s *partyStoreRemovesDown) Remove(ctx context.Context, a partystore.RemoveArgs) (partystore.RemoveResult, error) {
	if s.down.Load() {
		return partystore.RemoveResult{}, errors.New("redis down")
	}
	return s.partyStoreGate.Remove(ctx, a)
}

// A match that fails with every local gone, after its party was made, sends no party_update at
// all: the party lets everyone go without a word, nobody told left, leader or dissolved, so no
// party chat line either, only R8a's refusal. A removal Redis failed is tried again on the tick,
// just as quietly. R8a, R17, R19; code review round 2, Spec #2.
func TestMatchedParty_NoRun_PartyLetGoWithoutAWord(t *testing.T) {
	tests := []struct {
		name string
		// whether Redis fails the removals until a tick after the refusal
		removalsFail bool
	}{
		{"the removals answer", false},
		{"the removals fail, then answer on a tick", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &partyStoreRemovesDown{partyStoreGate: &partyStoreGate{open: make(chan struct{})}}
			store.down.Store(tt.removalsFail)
			rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
				store.Redis = partystore.NewRedis(client)
				return []Option{WithPartyStore(store)}
			})
			players := seatedForMatch(t, rig, "Wren", "Kaelen")
			// the pod has ticked since they sat down, as it always has in play: their arrival
			// is read already, before any party exists
			rig.tick()
			rig.settle(t)
			pushMatch(rig, players)
			rig.onLoop(t, func(*partyRegistry) {}) // the match is resolved, its script held

			// both go out into a field, still connected, so anything said to them arrives
			for _, p := range players {
				rig.hub.RemovePlayer(p.player.ID.String())
				rig.meadows.AddPlayerAt(p.player.ID, p.player.Character, "", 200, 200)
				rig.server.setCurrentWorld(p.player, rig.meadows.ID)
			}
			close(store.open)

			for _, p := range players {
				awaitMatchFailed(t, p.inbox, p.player.Character.Name)
			}
			if tt.removalsFail {
				rig.settle(t)
				rig.tick()
				rig.settle(t)
				store.down.Store(false)
				rig.tick()
			}
			require.Eventually(t, func() bool {
				return !rig.mini.Exists(pointerKey(players[0].player.ID)) && !rig.mini.Exists(pointerKey(players[1].player.ID))
			}, settle, 10*time.Millisecond, "the matched party lets everyone go")
			for _, p := range players {
				assertNothingOf(t, p.inbox, p.player.Character.Name, partyUpdateAction, string(constants.ActionChat))
			}
		})
	}
}

// More matched players than the party holds: the first up to the size are members, the leader
// always among them; the rest play outside it and hear nothing. AC row 5 (I-988SM-1); R10.
func TestMatchedParty_MorePlayersThanTheSize_LeaderAmongTheMembers(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(1))
	players := seatedForMatch(t, rig, "Wren", "Kaelen")

	matchOnThisPod(t, rig, players...)

	var joined, outside []matchedPlayer
	for _, p := range players {
		if update, got := p.inbox.await(partyUpdateAction); got {
			assert.Equal(t, []string{p.player.ID.String()}, memberIDsOf(t, update))
			assert.Equal(t, p.player.ID.String(), update.Payload["leader_id"], "the one member leads")
			joined = append(joined, p)
			continue
		}
		outside = append(outside, p)
	}
	assert.Len(t, joined, 1, "one member at size one")
	assert.Len(t, outside, 1, "the other plays outside the party")
}

// Redis refusing the create is logged at Warn, and the run starts and plays as ever: every
// matched player is sent in and stands in it, nobody told of a party. AC row 5; R9; User Story 18.
func TestMatchedParty_RedisDown_RunGoesOn(t *testing.T) {
	sink := captureLogs(t)
	rig := newPartyRig(t)
	players := seatedForMatch(t, rig, "Wren", "Kaelen")
	rig.mini.SetError("redis down")
	t.Cleanup(func() { rig.mini.SetError("") })

	run := matchOnThisPod(t, rig, players...)

	for _, p := range players {
		assert.True(t, run.HasPlayer(p.player.ID), "%s plays the run", p.player.Character.Name)
		assertNoParty(t, p.inbox, partyUpdateAction, p.player.Character.Name)
	}
	assert.NotEmpty(t, warnLinesWith(sink, run.ID.String()), "the failed create is logged at Warn, naming the run")
}

// partyStoreLostAnswer runs every matched create, writing it or not as committed says, and then
// answers with a Redis error, as a call that timed out does: whether the script ran is unknown.
type partyStoreLostAnswer struct {
	*partystore.Redis
	committed bool
}

func (l *partyStoreLostAnswer) CreateMatched(ctx context.Context, a partystore.MatchedArgs) (partystore.MatchedResult, error) {
	if l.committed {
		if _, err := l.Redis.CreateMatched(ctx, a); err != nil {
			return partystore.MatchedResult{}, err
		}
	}
	return partystore.MatchedResult{}, errors.New("i/o timeout")
}

// A create whose answer was lost may still have committed: the run goes on, remembering the party
// it tried with every matched player on its roster, so each who leaves the run leaves the party,
// and nobody comes home in it. A party that was never written answers each removal not_member,
// which is quiet: no Warn names them. R9, R11; code review round 1, Standards #2.
func TestMatchedParty_CreateAnswerLost_MembersStillLeaveWithTheRun(t *testing.T) {
	tests := []struct {
		name      string
		committed bool
	}{
		{"the script committed", true},
		{"the script never ran", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sink := captureLogs(t)
			store := &partyStoreLostAnswer{committed: tt.committed}
			rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
				store.Redis = partystore.NewRedis(client)
				return []Option{WithPartyStore(store)}
			})
			players := seatedForMatch(t, rig, "Wren", "Kaelen")
			ids := []uuid.UUID{players[0].player.ID, players[1].player.ID}

			run := matchOnThisPod(t, rig, players...)
			assert.ElementsMatch(t, ids, rosterOf(t, rig, run), "the run remembers the party it tried")
			if tt.committed {
				require.True(t, rig.mini.Exists(pointerKey(ids[0])), "the lost create was written")
			}

			rig.server.leftRun(run.ID, ids...)

			require.Eventually(t, func() bool { return len(rosterOf(t, rig, run)) == 0 },
				settle, 10*time.Millisecond, "the run's roster forgets them")
			rig.settle(t)
			for _, id := range ids {
				assert.False(t, rig.mini.Exists(pointerKey(id)), "nobody is left in the matched party")
			}
			if !tt.committed {
				for _, id := range ids {
					assert.Empty(t, warnLinesWith(sink, id.String()), "a removal from a party never written is quiet")
				}
			}
		})
	}
}

// A match with a player on another pod makes one matched party at initialisation of every matched
// player, the remote one included before they are seated; the local player leads, the remote
// joins after, and the run's roster lists both. AC row 2; R3, R4, R5; I-988SM-1 delta.
func TestMatchedParty_LocalAndRemote_OnePartyOfBothLocalLeads(t *testing.T) {
	rig := newPartyRig(t)
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")

	run := matchWith(t, rig, wren, marl)

	update := awaitJoinedSelf(t, wren[0])
	ids := []string{wren[0].player.ID.String(), marl.ID.String()}
	assert.Equal(t, ids, memberIDsOf(t, update), "the local leads and joins first, the remote after")
	assert.Equal(t, wren[0].player.ID.String(), update.Payload["leader_id"], "the local leads")
	assert.False(t, run.HasPlayer(marl.ID), "Marl is a member before he is seated")
	var remembered partyRun
	rig.onLoop(t, func(reg *partyRegistry) { remembered = reg.partyRuns[run.ID] })
	assert.Equal(t, []uuid.UUID{wren[0].player.ID, marl.ID}, remembered.roster, "the run's roster holds the remote too")
	partyID, _ := update.Payload["party_id"].(string)
	pointer, err := rig.mini.Get("{party}:pl:" + marl.ID.String())
	require.NoError(t, err)
	assert.Equal(t, partyID, pointer, "Marl's pointer names the matched party")
}

// partyUpdatesOn pumps the party updates the server sends on conn, among a run's state frames,
// until the connection closes. Read off the test: a read that times out spoils the connection.
func partyUpdatesOn(conn *websocket.Conn) <-chan types.Message {
	updates := make(chan types.Message, 16)
	go func() {
		defer close(updates)
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var msg types.Message
			if json.Unmarshal(data, &msg) == nil && msg.Action == partyUpdateAction {
				updates <- msg
			}
		}
	}()
	return updates
}

// updatesFor is every message updates delivers for d.
func updatesFor(updates <-chan types.Message, d time.Duration) []types.Message {
	var got []types.Message
	deadline := time.After(d)
	for {
		select {
		case msg, open := <-updates:
			if !open {
				return got
			}
			got = append(got, msg)
		case <-deadline:
			return got
		}
	}
}

// A remote member arriving by handoff is seated into a party they are already in: the seat adds
// nothing to it (the record unchanged, no version bump) and sends no joined, to them or anyone.
// Their screen is caught up by the arrival reconcile, a sync. AC row 4; R6, R19.
func TestMatchedParty_RemoteSeated_AddsNothingNoJoined(t *testing.T) {
	marlAuth := &oneMemberAuth{memberID: uuid.New()}
	rig := newPartyRigAuthed(t, marlAuth, func(redis.UniversalClient) []Option { return nil })
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")
	marl.ID = marlAuth.memberID
	run := matchWith(t, rig, wren, marl)
	created := awaitJoinedSelf(t, wren[0])
	partyID, _ := created.Payload["party_id"].(string)
	before := rig.mini.HGet(partyKey(partyID), "version")
	route := newConnectRoute(t, rig.server, marlAuth)

	conn := route.dialHandoff(t, "token", run.ID.String())
	route.awaitHandled(t)

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(settle)))
	var entered types.Message
	require.NoError(t, conn.ReadJSON(&entered), "Marl is served")
	require.NoError(t, conn.SetReadDeadline(time.Time{}))
	assert.Equal(t, string(constants.ActionWorldEntered), entered.Action)
	assert.True(t, run.HasPlayer(marl.ID), "Marl is seated")
	updates := partyUpdatesOn(conn)
	assert.Empty(t, updatesFor(updates, chatSilence), "seating sends Marl no joined")
	assertNoParty(t, wren[0].inbox, partyUpdateAction, "Wren: nobody joined")
	assert.Equal(t, before, rig.mini.HGet(partyKey(partyID), "version"), "the party is unchanged")

	rig.runs(t, partyRefreshInterval)

	shown := updatesFor(updates, chatSilence)
	require.Len(t, shown, 1, "Marl is shown the party on arrival, once")
	assert.Equal(t, "sync", shown[0].Payload["reason"], "by the arrival reconcile, never joined")
	assert.Equal(t, []string{wren[0].player.ID.String(), marl.ID.String()}, memberIDsOf(t, shown[0]))
}

// FS-988SM §Requirements R7, R9, R11, R13, R14, R19, R21b. I-988SM-2.
//
// A remote member whose seat the run released at 15 s never arrived: they count as dead, and so
// leave the run and its matched party. The run tells the pod whose seats it released; the pod takes
// each out of the party on its registry's loop, with the remove script and reason left.

// rosterOf is the roster the pod remembers for run.
func rosterOf(t *testing.T, rig *partyRig, run *game.Session) []uuid.UUID {
	t.Helper()
	var roster []uuid.UUID
	rig.onLoop(t, func(reg *partyRegistry) { roster = append(roster, reg.partyRuns[run.ID].roster...) })
	return roster
}

// A remote member whose seat is released leaves the matched party: the others are told left, the
// party without them; their pointer is gone, the run's roster forgets them. A remote seated, or
// still to be released, is untouched. AC rows 5, 6 (I-988SM-2); R7, R11, R12, R19.
func TestMatchedParty_SeatReleased_RemoteLeavesOthersToldLeft(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren := seatedForMatch(t, rig, "Wren")
	marl, idris := remoteMatched("Marl"), remoteMatched("Idris")
	run := matchWith(t, rig, wren, marl, idris)
	created := awaitJoinedSelf(t, wren[0])
	partyID, _ := created.Payload["party_id"].(string)

	rig.server.SeatsReleased(run.ID, []uuid.UUID{marl.ID})

	left := awaitUpdate(t, wren[0].inbox, "left", marl.ID, "Wren")
	assert.Equal(t, []string{wren[0].player.ID.String(), idris.ID.String()}, memberIDsOf(t, left), "the party without Marl")
	assert.Equal(t, wren[0].player.ID.String(), left.Payload["leader_id"], "the lead stays")
	assert.False(t, rig.mini.Exists(pointerKey(marl.ID)), "Marl's pointer is gone")
	pointer, err := rig.mini.Get(pointerKey(idris.ID))
	require.NoError(t, err)
	assert.Equal(t, partyID, pointer, "Idris is still a member")
	assert.Equal(t, []uuid.UUID{wren[0].player.ID, idris.ID}, rosterOf(t, rig, run), "the run's roster forgets Marl")
	assert.False(t, run.Ended(), "the run plays on")
}

// A released member who led is succeeded at once by the earliest-joined remaining member, as the
// remove script always does. The leader is a local player in practice; the rule holds anyway.
// AC row 5 (I-988SM-2); R13.
func TestMatchedParty_SeatReleased_LeaderReleased_EarliestJoinedLeads(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren := seatedForMatch(t, rig, "Wren")
	marl, idris := remoteMatched("Marl"), remoteMatched("Idris")
	run := matchWith(t, rig, wren, marl, idris)
	awaitJoinedSelf(t, wren[0])
	store := partystore.NewRedis(rig.client)

	rig.server.SeatsReleased(run.ID, []uuid.UUID{wren[0].player.ID})

	require.Eventually(t, func() bool {
		res, err := store.PartyOf(context.Background(), marl.ID, rig.partyClock.now())
		return err == nil && res.In && res.Party.Leader == marl.ID
	}, settle, 10*time.Millisecond, "Marl, the earliest-joined remaining member, leads")
	res, err := store.PartyOf(context.Background(), marl.ID, rig.partyClock.now())
	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{marl.ID, idris.ID}, memberIDs(res.Party))
	final := awaitUpdate(t, wren[0].inbox, "left", wren[0].player.ID, "Wren")
	assert.NotContains(t, memberIDsOf(t, final), wren[0].player.ID.String(), "Wren's last update no longer lists them")
}

// A seat released in a run a pre-formed party entered from the gate changes nothing about that
// party: nobody is removed, nobody is told, the roster stands. AC row 4 (I-988SM-2); R1.
func TestMatchedParty_SeatReleased_PreFormedPartyUnchanged(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, kaelen, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
	run := pairIntoItsRun(t, rig, wrenConn, kaelenConn, wrenInbox, kaelenInbox)
	before := partyInRedis(t, rig, wren.ID)
	roster := rosterOf(t, rig.partyRig, run)

	rig.server.SeatsReleased(run.ID, []uuid.UUID{kaelen.ID})

	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren")
	assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen")
	after := partyInRedis(t, rig, kaelen.ID)
	assert.Equal(t, before.Version, after.Version, "the party is untouched")
	assert.Equal(t, []uuid.UUID{wren.ID, kaelen.ID}, memberIDs(after))
	assert.Equal(t, roster, rosterOf(t, rig.partyRig, run), "the roster stands")
}

// Redis refusing the removal is logged at Warn, naming the member, and the run plays on. AC row 6
// (I-988SM-2); R9.
func TestMatchedParty_SeatReleased_RedisDown_WarnedRunPlaysOn(t *testing.T) {
	sink := captureLogs(t)
	rig := newPartyRig(t)
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")
	run := matchWith(t, rig, wren, marl)
	awaitJoinedSelf(t, wren[0])
	rig.mini.SetError("redis down")
	t.Cleanup(func() { rig.mini.SetError("") })

	rig.server.SeatsReleased(run.ID, []uuid.UUID{marl.ID})

	require.Eventually(t, func() bool { return len(warnLinesWith(sink, marl.ID.String())) > 0 },
		settle, 10*time.Millisecond, "the failed removal is logged at Warn, naming Marl")
	assert.False(t, run.Ended(), "the run plays on")
	assert.True(t, run.HasPlayer(wren[0].player.ID), "Wren still plays it")
}

// The run's tick hands its released seats over without waiting on the hub's loop: with the loop
// busy and its queue full, the hand-over returns at once, and the removal happens once the loop is
// free. AC row 5 (I-988SM-2); R17.
func TestMatchedParty_SeatReleased_TheTickNeverWaitsOnTheLoop(t *testing.T) {
	rig := newPartyRig(t)
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")
	run := matchWith(t, rig, wren, marl)
	awaitJoinedSelf(t, wren[0])
	jobs := rig.server.parties.jobs
	busy, free := make(chan struct{}), make(chan struct{})
	jobs <- func() { close(busy); <-free }
	<-busy
	for range cap(jobs) {
		jobs <- func() {}
	}

	handed := make(chan struct{})
	go func() {
		rig.server.SeatsReleased(run.ID, []uuid.UUID{marl.ID})
		close(handed)
	}()
	select {
	case <-handed:
	case <-time.After(time.Second):
		close(free)
		t.Fatal("the hand-over waited on the busy loop")
	}
	close(free)

	awaitUpdate(t, wren[0].inbox, "left", marl.ID, "Wren")
}

// A released member still on their own pod ends up with no party there: pod A hosts the run, Marl
// on pod B never arrives, and once his seat is released B's party cache lets the matched party go
// for him through the update A sends. No Redis pointer names it, and find_game on B queues him at
// once. AC row 3 (I-988SM-2); R21b; FS-BJNYC R1.
func TestMatchedParty_SeatReleased_TheirOwnPodHoldsNoPartyFindGameQueues(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	wren, _, wrenInbox := seatedThere(t, a, mini, "Wren")
	marl, marlConn, marlInbox := b.seated(t, "Marl", b.hub, spireGateX, spireGateY)
	b.tick()
	awaitPresence(t, mini, "Marl", b.podID)
	require.Eventually(t, func() bool { return b.hub.AtGate(marl.ID, components.GateDestinationSpire) },
		settle, 10*time.Millisecond, "B's hub never measured Marl at the Spire's door")

	a.queue.matchedChan <- matchmaker.MatchStart{PodID: a.podID, Step: matchmaker.MatchStepCreate, Players: []matchmaker.MatchStartPlayer{
		{ID: wren.ID, Pod: a.podID, Character: wren.Character},
		{ID: marl.ID, Pod: b.podID, Character: marl.Character},
	}}
	run := awaitRunEntered(t, a.server, wrenInbox, "Wren, on the host")
	joined := awaitUpdate(t, marlInbox, "joined", marl.ID, "Marl, on pod B")
	partyID, _ := joined.Payload["party_id"].(string)
	inParty := func() bool {
		var in bool
		b.onLoop(t, func(reg *partyRegistry) { in = reg.inParty(marl.ID) })
		return in
	}
	require.True(t, inParty(), "B's cache holds Marl in the matched party")

	a.server.SeatsReleased(run.ID, []uuid.UUID{marl.ID})

	awaitUpdate(t, wrenInbox, "left", marl.ID, "Wren")
	final := awaitUpdate(t, marlInbox, "left", marl.ID, "Marl")
	assert.NotContains(t, memberIDsOf(t, final), marl.ID.String(), "Marl's last update no longer lists him")
	require.Eventually(t, func() bool { return !inParty() }, settle, 10*time.Millisecond, "B's cache lets the party go for Marl")
	if pointer, err := mini.Get(pointerKey(marl.ID)); err == nil {
		assert.NotEqual(t, partyID, pointer, "no pointer names the matched party")
	}

	send(b.server, marlConn, constants.ActionFindGame)

	reply, answered := marlInbox.await(string(constants.ActionFindGame), string(constants.ActionWorldEntered))
	require.True(t, answered, "Marl's find_game was never answered")
	assert.Equal(t, string(constants.ActionFindGame), reply.Action)
	assert.Nil(t, reply.Error, "refused: %v", reply.Payload["message"])
	_, queued, err := b.queue.QueuedCharacter(context.Background(), marl.ID)
	require.NoError(t, err)
	assert.True(t, queued, "Marl is queued at once")
}
