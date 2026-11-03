package gameserver

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-988SM §Requirements R11–R18, R21, R21b. I-988SM-3.
//
// A matched party member leaves the party as they leave the run: a dead delver leaving early, the
// run's end sending everyone home, their reconnect grace running out. Watching is not leaving. The
// lead passes to the earliest-joined remaining member, the last one out ends the party, and each is
// back in town party-less, free to queue. A party that entered from the gate is never touched.

// matchedPair is a matched party of two made on this pod, and its run: the leader, drawn at
// random, and the other member.
type matchedPair struct {
	run            *game.Session
	partyID        string
	leader, member matchedPlayer
}

// matchedPairHere matches Wren and Kaelen on this pod and waits for both to be told they joined.
func matchedPairHere(t *testing.T, rig *partyRig) matchedPair {
	t.Helper()
	players := seatedForMatch(t, rig, "Wren", "Kaelen")
	run := matchOnThisPod(t, rig, players...)
	joined := awaitJoinedSelf(t, players[0])
	awaitJoinedSelf(t, players[1])
	partyID, _ := joined.Payload["party_id"].(string)
	pair := matchedPair{run: run, partyID: partyID, leader: players[0], member: players[1]}
	if joined.Payload["leader_id"] != players[0].player.ID.String() {
		pair.leader, pair.member = players[1], players[0]
	}
	return pair
}

// partyless asserts p is in town with no party: the pod's cache holds them in none, and no Redis
// pointer of theirs names partyID.
func partyless(t *testing.T, rig *partyRig, p matchedPlayer, partyID string) {
	t.Helper()
	require.Eventually(t, func() bool {
		var in bool
		rig.onLoop(t, func(reg *partyRegistry) { in = reg.inParty(p.player.ID) })
		return !in
	}, settle, 10*time.Millisecond, "%s: the pod's cache still holds them in a party", p.player.Character.Name)
	if pointer, err := rig.mini.Get(pointerKey(p.player.ID)); err == nil {
		assert.NotEqual(t, partyID, pointer, "%s: a pointer still names the matched party", p.player.Character.Name)
	}
}

// A dead member who leaves through leave_run is out of the matched party: the other is told left,
// the party without them; the leaver gets their last update, no longer listing them, and is in
// town party-less. AC row 1; R11, R12, R19, R21.
func TestMatchedParty_DeadMemberLeavesTheRun_LeavesTheParty(t *testing.T) {
	rig := newPartyRig(t)
	pair := matchedPairHere(t, rig)
	leader, leaver := pair.leader, pair.member
	leaveRunKill(t, pair.run, leaver.player.ID)

	leaveRunSend(rig.server, leaver.conn)

	left := awaitUpdate(t, leader.inbox, "left", leaver.player.ID, "the leader")
	assert.Equal(t, []string{leader.player.ID.String()}, memberIDsOf(t, left), "the party without the leaver")
	final := awaitUpdate(t, leaver.inbox, "left", leaver.player.ID, "the leaver")
	assert.NotContains(t, memberIDsOf(t, final), leaver.player.ID.String(), "the leaver's last update no longer lists them")
	hub, _ := rig.server.HubSession()
	assert.Equal(t, hub.ID, startSoloWorldOnRecord(t, rig.server, leaver.player.ID), "the leaver is in town")
	partyless(t, rig, leaver, pair.partyID)
	assert.Equal(t, []uuid.UUID{leader.player.ID}, rosterOf(t, rig, pair.run), "the run's roster forgets the leaver")
}

// When the leader leaves the run, the earliest-joined remaining member leads at once, and every
// remaining member is told: the leaver left, then who leads. AC row 2; R13; FS-BJNYC R17.
func TestMatchedParty_LeaderLeavesTheRun_EarliestJoinedLeadsAtOnce(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	players := seatedForMatch(t, rig, "Wren", "Kaelen", "Idris")
	run := matchOnThisPod(t, rig, players...)
	byID := map[string]matchedPlayer{}
	for _, p := range players {
		byID[p.player.ID.String()] = p
	}
	order := memberIDsOf(t, awaitJoinedSelf(t, players[0]))
	for _, p := range players[1:] {
		awaitJoinedSelf(t, p)
	}
	leader, next, last := byID[order[0]], byID[order[1]], byID[order[2]]
	leaveRunKill(t, run, leader.player.ID)

	leaveRunSend(rig.server, leader.conn)

	for _, p := range []matchedPlayer{next, last} {
		who := p.player.Character.Name
		left := awaitUpdate(t, p.inbox, "left", leader.player.ID, who)
		assert.Equal(t, order[1:], memberIDsOf(t, left), "%s: the party without the old leader", who)
		led := awaitUpdate(t, p.inbox, "leader", next.player.ID, who)
		assert.Equal(t, next.player.ID.String(), led.Payload["leader_id"], "%s: the earliest-joined remaining member leads", who)
	}
	assert.Equal(t, next.player.ID, partyInRedisOf(t, rig, last.player.ID).Leader)
}

// partyInRedisOf is the party member is in, as Redis holds it.
func partyInRedisOf(t *testing.T, rig *partyRig, member uuid.UUID) partystore.Party {
	t.Helper()
	res, err := partystore.NewRedis(rig.client).PartyOf(context.Background(), member, rig.partyClock.now())
	require.NoError(t, err)
	require.True(t, res.In, "%s is in no party", member)
	return res.Party
}

// awaitOwnLastUpdate waits for p's update about themselves leaving: left, or dissolved for the
// last one out, and returns its reason.
func awaitOwnLastUpdate(t *testing.T, p matchedPlayer) string {
	t.Helper()
	id := p.player.ID.String()
	update := awaitUpdateWhere(t, p.inbox, p.player.Character.Name, "about their own leaving", func(msg types.Message) bool {
		reason := msg.Payload["reason"]
		return msg.Payload["subject_id"] == id && (reason == "left" || reason == "dissolved")
	})
	assert.NotContains(t, memberIDsOf(t, update), id, "%s: their last update no longer lists them", p.player.Character.Name)
	reason, _ := update.Payload["reason"].(string)
	return reason
}

// assertEndedOnce asserts the matched party is gone: one of the pair left, and the last one out
// was told dissolved; neither is in any party, and Redis holds no party.
func assertEndedOnce(t *testing.T, rig *partyRig, pair matchedPair) {
	t.Helper()
	reasons := []string{awaitOwnLastUpdate(t, pair.leader), awaitOwnLastUpdate(t, pair.member)}
	assert.ElementsMatch(t, []string{"left", "dissolved"}, reasons, "one leaves, the last one out is told dissolved")
	assert.False(t, rig.mini.Exists(partyKey(pair.partyID)), "the matched party is gone from Redis")
	partyless(t, rig, pair.leader, pair.partyID)
	partyless(t, rig, pair.member, pair.partyID)
}

// At the run's end every member still in it leaves the matched party as they are sent home, and
// the last one's update reads dissolved: nobody comes home in it. AC row 3; R11, R14, R19, R21.
func TestMatchedParty_RunEnds_EveryoneLeavesLastOneDissolved(t *testing.T) {
	rig := newPartyRig(t)
	pair := matchedPairHere(t, rig)

	leaveRunKill(t, pair.run, pair.leader.player.ID)
	leaveRunKill(t, pair.run, pair.member.player.ID)

	require.Eventually(t, pair.run.Ended, leaveRunSettle, 10*time.Millisecond, "the run never ended")
	assertEndedOnce(t, rig, pair)
	hub, _ := rig.server.HubSession()
	for _, p := range []matchedPlayer{pair.leader, pair.member} {
		assert.Equal(t, hub.ID, startSoloWorldOnRecord(t, rig.server, p.player.ID), "%s is home", p.player.Character.Name)
	}
}

// A run gone before the hand-over from its end reached the loop still lets nobody come home in its
// matched party: the registry, forgetting the run, takes out whoever it still held. Here the members
// are sent home with no hand-over at all. Edge States "A member leaves while their remove is in
// flight and the run ends"; R11, R14.
func TestMatchedParty_RunGoneUnannounced_TheTickEndsTheParty(t *testing.T) {
	rig := newPartyRig(t)
	pair := matchedPairHere(t, rig)
	for _, p := range []matchedPlayer{pair.leader, pair.member} {
		pair.run.RemovePlayer(p.player.ID.String())
		rig.hub.AddPlayerAt(p.player.ID, p.player.Character, "", 600, 600)
		rig.server.setCurrentWorld(p.player, rig.hub.ID)
	}

	require.NoError(t, rig.server.CloseSession(pair.run.ID))
	rig.tick()

	assertEndedOnce(t, rig, pair)
	var remembered bool
	rig.onLoop(t, func(reg *partyRegistry) { _, remembered = reg.partyRuns[pair.run.ID] })
	assert.False(t, remembered, "the run is forgotten")
}

// Two members leaving at once, and a removal finding its member already gone, are both success:
// the script serializes them, one is told left, the last dissolved, and nothing is told twice.
// AC row 12; Edge States "Two members leave in the same tick".
func TestMatchedParty_TwoLeaveAtOnce_OneLeftLastDissolved(t *testing.T) {
	rig := newPartyRig(t)
	pair := matchedPairHere(t, rig)
	both := []uuid.UUID{pair.leader.player.ID, pair.member.player.ID}

	rig.server.leftRun(pair.run.ID, both...)
	rig.server.leftRun(pair.run.ID, both...)

	assertEndedOnce(t, rig, pair)
	for _, p := range []matchedPlayer{pair.leader, pair.member} {
		assertNoParty(t, p.inbox, partyUpdateAction, p.player.Character.Name+": told once")
	}
}

// A member whose reconnect grace runs out has left the run, and so the matched party, whether their
// record is deleted (still in play) or kept for the run's settlement (dead): the other is told left,
// the party without them. AC row 4; R7, R11.
func TestMatchedParty_GraceRunsOut_LeavesTheParty(t *testing.T) {
	tests := []struct {
		name string
		// what becomes of the dropped member before their grace runs out
		resolve func(t *testing.T, run *game.Session, id uuid.UUID)
		// whether the server keeps their record for the run's settlement
		kept bool
	}{
		{"in play, record deleted", func(*testing.T, *game.Session, uuid.UUID) {}, false},
		{"dead, kept for settlement", leaveRunKill, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRig(t)
			pair := matchedPairHere(t, rig)
			gone := pair.member
			tt.resolve(t, pair.run, gone.player.ID)

			resolvedDropPastGrace(t, rig.server, gone.conn)

			_, onRecord := rig.server.PlayerByID(gone.player.ID)
			require.Equal(t, tt.kept, onRecord, "kept for the run's settlement")
			left := awaitUpdate(t, pair.leader.inbox, "left", gone.player.ID, "the leader")
			assert.Equal(t, []string{pair.leader.player.ID.String()}, memberIDsOf(t, left), "the party without them")
			assert.False(t, rig.mini.Exists(pointerKey(gone.player.ID)), "their pointer is gone")
			assert.Equal(t, []uuid.UUID{pair.leader.player.ID}, rosterOf(t, rig, pair.run), "the run's roster forgets them")
		})
	}
}

// arrivedRemote is a matched party of Wren, local and leading, and Marl, matched on another pod
// and since arrived here by handoff: the host holds his record as it holds Wren's.
type arrivedRemote struct {
	rig  *partyRig
	run  *game.Session
	wren matchedPlayer
	marl uuid.UUID
	// the server's end of Marl's connection
	marlConn *websocket.Conn
}

func newArrivedRemote(t *testing.T) arrivedRemote {
	t.Helper()
	marlAuth := &oneMemberAuth{memberID: uuid.New()}
	rig := newPartyRigAuthed(t, marlAuth, func(redis.UniversalClient) []Option { return nil })
	wren := seatedForMatch(t, rig, "Wren")
	marl := remoteMatched("Marl")
	marl.ID = marlAuth.memberID
	run := matchWith(t, rig, wren, marl)
	awaitJoinedSelf(t, wren[0])
	route := newConnectRoute(t, rig.server, marlAuth)
	client := route.dialHandoff(t, "token", run.ID.String())
	route.awaitHandled(t)
	partyUpdatesOn(client)
	require.Eventually(t, func() bool { return run.HasPlayer(marl.ID) }, settle, 10*time.Millisecond, "Marl is never seated")
	return arrivedRemote{rig: rig, run: run, wren: wren[0], marl: marl.ID, marlConn: serverConnOf(t, rig.server, marl.ID)}
}

// An arrived remote whose grace runs out leaves as a host player does: Wren is told left. AC row 4;
// R7, R11.
func TestMatchedParty_GraceRunsOut_ArrivedRemoteLeavesTheParty(t *testing.T) {
	a := newArrivedRemote(t)

	resolvedDropPastGrace(t, a.rig.server, a.marlConn)

	left := awaitUpdate(t, a.wren.inbox, "left", a.marl, "Wren")
	assert.Equal(t, []string{a.wren.player.ID.String()}, memberIDsOf(t, left), "the party without Marl")
	assert.False(t, a.rig.mini.Exists(pointerKey(a.marl)), "Marl's pointer is gone")
}

// A member who reconnects within the grace has not left the run, host player or arrived remote:
// still a member, nobody told of a change. AC row 5; R18.
func TestMatchedParty_ReconnectsWithinTheGrace_StillAMember(t *testing.T) {
	t.Run("host player", func(t *testing.T) {
		rig := newPartyRig(t)
		pair := matchedPairHere(t, rig)
		dropAndReconnect(t, rig, pair.member.conn, pair.member.player.ID)

		assertNobodyLeft(t, pair.leader.inbox, "the leader")
		assert.Equal(t, []uuid.UUID{pair.leader.player.ID, pair.member.player.ID}, memberIDs(partyInRedisOf(t, rig, pair.leader.player.ID)))
		assert.Equal(t, []uuid.UUID{pair.leader.player.ID, pair.member.player.ID}, rosterOf(t, rig, pair.run))
	})

	t.Run("arrived remote", func(t *testing.T) {
		a := newArrivedRemote(t)
		dropAndReconnect(t, a.rig, a.marlConn, a.marl)

		assertNobodyLeft(t, a.wren.inbox, "Wren")
		assert.Equal(t, []uuid.UUID{a.wren.player.ID, a.marl}, memberIDs(partyInRedisOf(t, a.rig, a.wren.player.ID)))
		assert.Equal(t, []uuid.UUID{a.wren.player.ID, a.marl}, rosterOf(t, a.rig, a.run))
	})
}

// dropAndReconnect drops the member's connection, as a reset does, and has them reconnect within
// the grace on a new one.
func dropAndReconnect(t *testing.T, rig *partyRig, conn *websocket.Conn, memberID uuid.UUID) {
	t.Helper()
	_, _, held := rig.server.holdForReconnect(conn)
	require.True(t, held, "the connection carried the member")
	back := &websocket.Conn{}
	_, mapped := rig.server.MapConnToPlayer(back, memberID, make(chan interface{}, clientWriterBuffer))
	require.True(t, mapped, "they reconnect within the grace")
	rig.tick()
	rig.settle(t)
}

// assertNobodyLeft fails if, within chatSilence, the inbox hears of anyone leaving or the party
// ending. A sync, the party resent as it stands, is no change.
func assertNobodyLeft(t *testing.T, inbox *startSoloInbox, who string) {
	t.Helper()
	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == partyUpdateAction && msg.Payload["reason"] != "sync" {
				t.Fatalf("%s should hear of no change; got %v", who, msg.Payload)
			}
		case <-deadline:
			return
		}
	}
}

// A member whose grace ran out, connecting again later, has no tie to the run: they land in the
// village with no party. The pod's cache holds them in none, no pointer names the matched party,
// no frame shows it, and find_game queues them at once. AC row 6; R21b; FS-BJNYC R1.
func TestMatchedParty_GraceRanOut_ConnectsAgain_VillageNoPartyFindGameQueues(t *testing.T) {
	rig := newPartyRig(t)
	pair := matchedPairHere(t, rig)
	gone := pair.member
	resolvedDropPastGrace(t, rig.server, gone.conn)
	awaitUpdate(t, pair.leader.inbox, "left", gone.player.ID, "the leader")

	conn := &websocket.Conn{}
	again := &types.Player{ID: gone.player.ID, Username: gone.player.Username, Character: gone.player.Character}
	registerTestConn(rig.server, conn, again)
	inbox := startSoloListen(t, rig.server, conn)
	rig.hub.AddPlayerAt(again.ID, again.Character, "", spireGateX, spireGateY)
	rig.server.setCurrentWorld(again, rig.hub.ID)
	require.Eventually(t, func() bool { return rig.hub.AtGate(again.ID, components.GateDestinationSpire) },
		settle, 10*time.Millisecond, "the hub never measured them at the Spire's door")
	rig.tick()
	rig.settle(t)

	partyless(t, rig, matchedPlayer{player: again, conn: conn, inbox: inbox}, pair.partyID)
	assert.False(t, rig.mini.Exists(pointerKey(again.ID)), "no pointer of theirs")
	assertNoFrame(t, inbox, again.ID, "the one who connected again")

	send(rig.server, conn, constants.ActionFindGame)

	reply, answered := inbox.await(string(constants.ActionFindGame), string(constants.ActionWorldEntered))
	require.True(t, answered, "find_game was never answered")
	assert.Nil(t, reply.Error, "refused: %v", reply.Payload["message"])
	_, queued, err := rig.queue.QueuedCharacter(context.Background(), again.ID)
	require.NoError(t, err)
	assert.True(t, queued, "queued at once")
}

// assertNoFrame fails if, within chatSilence, the inbox is shown a party listing playerID.
func assertNoFrame(t *testing.T, inbox *startSoloInbox, playerID uuid.UUID, who string) {
	t.Helper()
	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == partyUpdateAction {
				assert.NotContains(t, memberIDsOf(t, msg), playerID.String(), "%s is shown a party: %v", who, msg.Payload)
			}
		case <-deadline:
			return
		}
	}
}

// A dead or escaped member who stays to watch has not left the run: still a member, on the run's
// roster, and party chat goes both ways. AC row 7; R15; FS-XGW7H R14.
func TestMatchedParty_Watching_StillAMemberHearsPartyChat(t *testing.T) {
	for _, how := range []string{"dead", "escaped"} {
		t.Run(how, func(t *testing.T) {
			rig := newPartyRig(t)
			pair := matchedPairHere(t, rig)
			watcher, living := pair.member, pair.leader
			if how == "dead" {
				leaveRunKill(t, pair.run, watcher.player.ID)
			} else {
				leaveRunEscape(t, pair.run, watcher.player.ID)
			}

			assertNobodyLeft(t, living.inbox, "the living member")
			ids := []uuid.UUID{living.player.ID, watcher.player.ID}
			assert.Equal(t, ids, memberIDs(partyInRedisOf(t, rig, watcher.player.ID)), "the watcher is still a member")
			assert.Equal(t, ids, rosterOf(t, rig, pair.run))

			sendChat(rig.server, living.conn, "party", "hold on")
			assert.Equal(t, "hold on", awaitChat(t, watcher.inbox, "the watcher").Payload["text"])
			awaitChat(t, living.inbox, "the living member, hearing themselves")
			sendChat(rig.server, watcher.conn, "party", "watching")
			assert.Equal(t, "watching", awaitChat(t, living.inbox, "the living member").Payload["text"])
		})
	}
}

// An escaped member cannot leave early, so stays a member until the run ends; at its end both are
// out, and back in town either may queue at once. AC rows 9, 10; R15, R21.
func TestMatchedParty_Escaped_MemberUntilTheRunEndsThenFindGameQueues(t *testing.T) {
	rig := newPartyRig(t)
	pair := matchedPairHere(t, rig)
	escaped := pair.member
	leaveRunEscape(t, pair.run, escaped.player.ID)

	leaveRunSend(rig.server, escaped.conn)

	refused, answered := escaped.inbox.await(leaveRunAction)
	require.True(t, answered, "leave_run was never answered")
	require.NotNil(t, refused.Error, "an escaped member may not leave early")
	assertNobodyLeft(t, pair.leader.inbox, "the leader")
	assert.Len(t, partyInRedisOf(t, rig, escaped.player.ID).Members, 2, "still a member")

	leaveRunKill(t, pair.run, pair.leader.player.ID)

	require.Eventually(t, pair.run.Ended, leaveRunSettle, 10*time.Millisecond, "the run never ended")
	assertEndedOnce(t, rig, pair)

	rig.hub.RemovePlayer(escaped.player.ID.String())
	rig.hub.AddPlayerAt(escaped.player.ID, escaped.player.Character, "", spireGateX, spireGateY)
	require.Eventually(t, func() bool { return rig.hub.AtGate(escaped.player.ID, components.GateDestinationSpire) },
		settle, 10*time.Millisecond, "the hub never measured them at the Spire's door")
	send(rig.server, escaped.conn, constants.ActionFindGame)

	reply, answered := escaped.inbox.await(string(constants.ActionFindGame), string(constants.ActionWorldEntered))
	require.True(t, answered, "find_game was never answered")
	assert.Nil(t, reply.Error, "refused: %v", reply.Payload["message"])
	_, queued, err := rig.queue.QueuedCharacter(context.Background(), escaped.player.ID)
	require.NoError(t, err)
	assert.True(t, queued, "queued at once, not refused as a party member")
}

// A party that entered from the gate is untouched by any of it: a member who dies and leaves early,
// one who escapes, the run's end, the tick forgetting the run. Both stay members and the party
// persists. AC row 11; R1; ADR-0035.
func TestPreFormedParty_DieLeaveEscapeRunEnd_PartyStands(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, kaelen, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
	run := pairIntoItsRun(t, rig, wrenConn, kaelenConn, wrenInbox, kaelenInbox)
	before := partyInRedis(t, rig, wren.ID)

	leaveRunKill(t, run, kaelen.ID)
	leaveRunSend(rig.server, kaelenConn)
	_, home := kaelenInbox.await(string(constants.ActionWorldEntered))
	require.True(t, home, "Kaelen never went home early")
	leaveRunEscape(t, run, wren.ID)
	require.Eventually(t, run.Ended, leaveRunSettle, 10*time.Millisecond, "the run never ended")
	rig.tick()
	rig.settle(t)

	assertNobodyLeft(t, wrenInbox, "Wren")
	assertNobodyLeft(t, kaelenInbox, "Kaelen")
	after := partyInRedis(t, rig, wren.ID)
	assert.Equal(t, before.ID, after.ID, "the party persists")
	assert.Equal(t, []uuid.UUID{wren.ID, kaelen.ID}, memberIDs(after), "both stay members")
}

// A member who closes their connection on purpose is gone at once, record and body, with no grace
// to come back in: they have left the run, and so the matched party. R11; ADR-0039.
func TestMatchedParty_ClosesTheConnection_LeavesTheParty(t *testing.T) {
	a := newArrivedRemote(t)

	a.rig.server.handleReadError(a.marlConn, &websocket.CloseError{Code: websocket.CloseNormalClosure})

	left := awaitUpdate(t, a.wren.inbox, "left", a.marl, "Wren")
	assert.Equal(t, []string{a.wren.player.ID.String()}, memberIDsOf(t, left), "the party without Marl")
	assert.False(t, a.rig.mini.Exists(pointerKey(a.marl)), "Marl's pointer is gone")
}

// notRemovedWarnings are the Warn lines saying playerID was not removed from their matched party.
func notRemovedWarnings(sink *lockedLog, playerID uuid.UUID) []string {
	var out []string
	for _, line := range warnLinesWith(sink, playerID.String()) {
		if strings.Contains(line, "not removed") {
			out = append(out, line)
		}
	}
	return out
}

// A removal Redis failed is tried again on every registry tick until the script answers, so a
// member back in town, whose record the pod keeps alive while they are seated, never stays in the
// matched party: once Redis answers, the other is told left and the leaver is party-less. The
// failure is logged at Warn once, not on every retry. R17, R21; ADR-0039; code review round 1,
// Spec #1.
func TestMatchedParty_RemovalFailed_TriedAgainEachTickUntilItTakes(t *testing.T) {
	sink := captureLogs(t)
	rig := newPartyRig(t)
	pair := matchedPairHere(t, rig)
	leaver := pair.member
	rig.mini.SetError("redis down")
	t.Cleanup(func() { rig.mini.SetError("") })

	rig.server.leftRun(pair.run.ID, leaver.player.ID)
	require.Eventually(t, func() bool { return len(notRemovedWarnings(sink, leaver.player.ID)) > 0 },
		settle, 10*time.Millisecond, "the failed removal is logged at Warn")
	for range 3 {
		rig.tick()
		rig.settle(t)
	}
	assert.Len(t, notRemovedWarnings(sink, leaver.player.ID), 1, "logged at Warn once, not on every retry")

	rig.mini.SetError("")
	rig.tick()

	left := awaitUpdate(t, pair.leader.inbox, "left", leaver.player.ID, "the leader")
	assert.Equal(t, []string{pair.leader.player.ID.String()}, memberIDsOf(t, left), "the party without the leaver")
	partyless(t, rig, leaver, pair.partyID)
	var waiting int
	rig.onLoop(t, func(reg *partyRegistry) { waiting = len(reg.leaving) })
	assert.Zero(t, waiting, "nothing is left to try again")
}

// partyStoreRemovesCounted fails every removal, as Redis down does, counting each one tried.
type partyStoreRemovesCounted struct {
	*partystore.Redis
	tried atomic.Int64
}

func (s *partyStoreRemovesCounted) Remove(context.Context, partystore.RemoveArgs) (partystore.RemoveResult, error) {
	s.tried.Add(1)
	return partystore.RemoveResult{}, errors.New("redis down")
}

// With Redis hanging, the removals waiting to be tried again never take over the party runner: the
// registry keeps at most matchedLeaveRetries of them, well under what the runner holds, and tries
// at most matchedLeaveRetryBudget again on any one tick. R17; code review round 2, Standards #1.
func TestMatchedParty_RemovalsFailing_BoundedAndTriedAFewEachTick(t *testing.T) {
	store := &partyStoreRemovesCounted{}
	rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
		store.Redis = partystore.NewRedis(client)
		return []Option{WithPartyStore(store)}
	})
	runID := uuid.New()
	members := make([]uuid.UUID, matchedLeaveRetries+16)
	for i := range members {
		members[i] = uuid.New()
	}
	rig.onLoop(t, func(reg *partyRegistry) {
		reg.partyRuns[runID] = partyRun{partyID: uuid.New(), roster: members, matched: true}
	})

	rig.server.leftRun(runID, members...)
	require.Eventually(t, func() bool { return store.tried.Load() == int64(len(members)) },
		settle, 10*time.Millisecond, "every removal is tried once")
	rig.settle(t)

	var waiting int
	rig.onLoop(t, func(reg *partyRegistry) { waiting = len(reg.leaving) })
	assert.Equal(t, matchedLeaveRetries, waiting, "at most matchedLeaveRetries wait to be tried again")
	assert.Less(t, matchedLeaveRetries, partyRunBuffer/2, "the retries never fill the runner")

	for range 2 {
		before := store.tried.Load()
		rig.tick()
		rig.settle(t)
		assert.Equal(t, int64(matchedLeaveRetryBudget), store.tried.Load()-before, "a tick tries again only its budget")
	}
}
