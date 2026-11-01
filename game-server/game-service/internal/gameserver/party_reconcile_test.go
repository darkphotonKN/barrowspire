package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/**
* Each pod reconciles what its players see (I-NCC9J-3, decided after round 4): it records the last
* party_update queued for each player and, after every re-read, sends whoever was shown something
* other than what the cache now says. A letter lost on pub/sub then costs at most one
* re-read, for a removed player too, who no longer is any party's member.
**/

// A player seated with no party is told so: a party_update with no members, which empties a party
// store the page kept across a reconnect.
func TestPartyArrival_NoParty_SentAPartyWithNoMembers(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, _, wrenInbox := rig.inHub(t, "Wren")

	rig.tick()

	update := awaitParty(t, wrenInbox, partyUpdateAction, "Wren")
	assertNoPartyUpdate(t, update, wren.ID, "Wren")
}

// A member removed by another pod whose letter never arrives here still sees the party leave
// their screen: the re-read finds them in no party, and they were shown one.
func TestPartyRefresh_RemovedWhileTheirLetterWasLost_PartyLeavesTheirScreen(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)
	rig.tick()
	awaitUpdate(t, kaelenInbox, "sync", kaelen.ID, "Kaelen")
	partyID, err := rig.mini.Get(pointerKey(wren.ID))
	require.NoError(t, err)

	// another pod kicks Kaelen; its letters never arrive here
	_, err = partystore.NewRedis(rig.client).Remove(context.Background(), partystore.RemoveArgs{PartyID: uuid.MustParse(partyID), PlayerID: kaelen.ID, Kicker: wren.ID})
	require.NoError(t, err)
	rig.partyClock.advance(partyRefreshInterval)
	rig.tick()

	update := awaitParty(t, kaelenInbox, partyUpdateAction, "Kaelen")
	assertNoPartyUpdate(t, update, kaelen.ID, "Kaelen")
}

// assertNoPartyUpdate checks update is the one telling player they are in no party (R21).
func assertNoPartyUpdate(t *testing.T, update types.Message, player uuid.UUID, who string) {
	t.Helper()
	assert.Equal(t, "sync", update.Payload["reason"], who)
	assert.Equal(t, player.String(), update.Payload["subject_id"], who)
	assert.Equal(t, "", update.Payload["party_id"], who)
	assert.Equal(t, "", update.Payload["leader_id"], who)
	assert.Empty(t, memberIDsOf(t, update), who)
}

// A re-read that finds every party as its players were shown it sends nothing.
func TestPartyRefresh_NothingChanged_NobodyIsSentAnything(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, _, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick()
	awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")
	awaitUpdate(t, kaelenInbox, "sync", kaelen.ID, "Kaelen")
	awaitParty(t, idrisInbox, partyUpdateAction, "Idris") // in no party
	partyID, err := rig.mini.Get(pointerKey(wren.ID))
	require.NoError(t, err)
	rig.mini.FastForward(time.Minute)
	require.Less(t, rig.mini.TTL(partyKey(partyID)), partystore.TTL)

	rig.partyClock.advance(partyRefreshInterval)
	rig.tick()
	require.Eventually(t, func() bool { return rig.mini.TTL(partyKey(partyID)) == partystore.TTL },
		time.Second, 10*time.Millisecond, "the re-read ran (it keeps the party alive)")

	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox, "Idris": idrisInbox} {
		assertNoParty(t, inbox, partyUpdateAction, who)
	}
}

// A player who reconnects between two ticks is read afresh: their screen is unknown (the page may
// have reloaded), so they are read and sent their party again.
func TestPartyArrival_NewConnectionBetweenTicks_SentAgain(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick()
	awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")

	rig.server.holdForReconnect(wrenConn)
	newConn := &websocket.Conn{}
	rig.server.MapConnToPlayer(newConn, wren.ID, make(chan interface{}, clientWriterBuffer))
	newInbox := startSoloListen(t, rig.server, newConn)
	rig.tick()

	sync := awaitUpdate(t, newInbox, "sync", wren.ID, "Wren, on the new connection")
	assert.Contains(t, memberIDsOf(t, sync), wren.ID.String())
}

// A party gone from Redis with no letter here (its end lost, or Redis restarted without its data)
// leaves every screen here at the next re-read: each is told they are in no party.
func TestPartyRefresh_PartyGoneWithoutALetter_EveryoneHereShownNone(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick()
	awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")
	awaitUpdate(t, kaelenInbox, "sync", kaelen.ID, "Kaelen")
	partyID, err := rig.mini.Get(pointerKey(wren.ID))
	require.NoError(t, err)

	rig.mini.Del(partyKey(partyID))
	rig.partyClock.advance(partyRefreshInterval)
	rig.tick()

	for who, member := range map[string]struct {
		id    uuid.UUID
		inbox *startSoloInbox
	}{"Wren": {wren.ID, wrenInbox}, "Kaelen": {kaelen.ID, kaelenInbox}} {
		assertNoPartyUpdate(t, awaitParty(t, member.inbox, partyUpdateAction, who), member.id, who)
	}
}

// A reconcile sync names the pod and world of each member held elsewhere, from the presence index,
// as every party_update does (R21; code review of round 4's reconcile, MED).
func TestPartyRefresh_ReconcileSync_NamesThePodOfAMemberElsewhere(t *testing.T) {
	a, _, mini, wren, marl, _, _, wrenInbox, _ := crossPodParty(t)
	partyID, err := mini.Get(pointerKey(wren.ID))
	require.NoError(t, err)

	// pod B's letter about the new leader never reaches pod A
	_, err = partystore.NewRedis(a.client).Transfer(context.Background(), uuid.MustParse(partyID), wren.ID, marl.ID)
	require.NoError(t, err)
	a.partyClock.advance(partyRefreshInterval)
	a.tick()

	sync := awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")
	assert.Equal(t, marl.ID.String(), sync.Payload["leader_id"])
	assert.Equal(t, "pod-b", podOf(t, sync, marl.ID), "Marl stands on pod B")
	assert.Equal(t, "hub", memberField(t, sync, marl.ID, "where"))
}

// A re-read that lands while a change's update still waits on its presence lookup leaves the
// change to its own update: the members hear the change, first and once, not also a sync of the
// same party (code review of round 4's reconcile, MED).
func TestPartyRefresh_ChangeStillBeingTold_NotOvertakenBySync(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	entered, gate := make(chan struct{}, 1), make(chan struct{})
	pod := newPartyPod(t, client, "pod-a", chatbus.NewRedis(client), WithPartySize(4),
		WithPresence(gatedLookup{Redis: partypresence.NewRedis(client), entered: entered, gate: gate}))
	require.Eventually(t, func() bool { return mini.PubSubNumSub("pod:pod-a:inbox")["pod:pod-a:inbox"] == 1 },
		pointerWait, 10*time.Millisecond, "pod A listens on its inbox")
	wren, wrenConn, wrenInbox := pod.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := pod.inHub(t, "Kaelen")
	_, idrisConn, idrisInbox := pod.inHub(t, "Idris")
	pod.tick()
	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox, "Idris": idrisInbox} {
		awaitParty(t, inbox, partyUpdateAction, who) // in no party yet
	}
	pod.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	pod.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)

	for _, inbox := range []*startSoloInbox{kaelenInbox, idrisInbox} {
		drainInbox(inbox)
	}

	// the runner is held on a name lookup; the kick and then the re-read queue behind it
	sendParty(pod.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Nobody"})
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("the name lookup never started")
	}
	pod.onLoop(t, func(reg *partyRegistry) {
		reg.kick(context.Background(), wren, wrenConn, map[string]interface{}{"target_id": kaelen.ID.String()})
	})
	pod.partyClock.advance(partyRefreshInterval)
	pod.onLoop(t, func(reg *partyRegistry) { reg.tick(context.Background()) })
	close(gate)

	for who, inbox := range map[string]*startSoloInbox{"Kaelen": kaelenInbox, "Idris": idrisInbox} {
		first := awaitParty(t, inbox, partyUpdateAction, who)
		assert.Equal(t, "kicked", first.Payload["reason"], "%s hears the kick first", who)
		assertNoParty(t, inbox, partyUpdateAction, who+", told the kick, is not sent the same party again")
	}
}

// drainInbox drops whatever reaches inbox until it has been quiet for chatSilence.
func drainInbox(inbox *startSoloInbox) {
	for {
		select {
		case <-inbox.messages:
		case <-time.After(chatSilence):
			return
		}
	}
}

// A sync whose party ended while it waited to go out (another change dropped it from the cache) is
// not sent: the change that ended it tells the player (code review rounds 6 and 7).
func TestPartySync_PartyEndedWhileItWaited_NotSent(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick()
	awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")
	awaitUpdate(t, kaelenInbox, "sync", kaelen.ID, "Kaelen")

	rig.onLoop(t, func(reg *partyRegistry) {
		p, _ := reg.cache.partyOf(wren.ID)
		reg.cache.drop(p.ID)
		delete(reg.cache.shown, wren.ID)
		reg.deliver([]partyUpdate{{party: p, reason: constants.PartyUpdateSync, subject: wren.ID, to: wren.ID}}, nil)
	})

	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: the party the sync names has ended")
}

// A re-read between two changes, both still being told, leaves them to their own updates: the
// reconcile's syncs, overtaken by the second change, are not sent, so each member hears the party
// once, with its real reason (code review round 7, MED).
func TestPartyRefresh_BetweenTwoChanges_SyncsOvertakenNotSent(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	entered, gate := make(chan struct{}, 1), make(chan struct{})
	pod := newPartyPod(t, client, "pod-a", chatbus.NewRedis(client), WithPartySize(4),
		WithPresence(gatedLookup{Redis: partypresence.NewRedis(client), entered: entered, gate: gate}))
	require.Eventually(t, func() bool { return mini.PubSubNumSub("pod:pod-a:inbox")["pod:pod-a:inbox"] == 1 },
		pointerWait, 10*time.Millisecond, "pod A listens on its inbox")
	wren, wrenConn, wrenInbox := pod.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := pod.inHub(t, "Kaelen")
	idris, idrisConn, idrisInbox := pod.inHub(t, "Idris")
	pod.tick()
	pod.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	pod.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)
	for _, inbox := range []*startSoloInbox{wrenInbox, kaelenInbox, idrisInbox} {
		drainInbox(inbox)
	}

	// the runner is held on a name lookup; a kick, a re-read and a hand-over queue behind it
	sendParty(pod.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Nobody"})
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("the name lookup never started")
	}
	pod.onLoop(t, func(reg *partyRegistry) {
		reg.kick(context.Background(), wren, wrenConn, map[string]interface{}{"target_id": kaelen.ID.String()})
	})
	pod.partyClock.advance(partyRefreshInterval)
	pod.onLoop(t, func(reg *partyRegistry) { reg.tick(context.Background()) })
	pod.onLoop(t, func(reg *partyRegistry) {
		reg.transfer(context.Background(), wren, wrenConn, map[string]interface{}{"target_id": idris.ID.String()})
	})
	close(gate)

	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Idris": idrisInbox} {
		var reasons []string
		for _, msg := range collectInbox(inbox) {
			if msg.Action == partyUpdateAction {
				reasons = append(reasons, msg.Payload["reason"].(string))
			}
		}
		assert.Equal(t, []string{"leader"}, reasons, "%s hears the party once, as it now stands", who)
	}
	final := awaitParty(t, kaelenInbox, partyUpdateAction, "Kaelen")
	assert.Equal(t, "kicked", final.Payload["reason"])
	assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen, told the kick")
}

// collectInbox is whatever reaches inbox until it has been quiet for chatSilence.
func collectInbox(inbox *startSoloInbox) []types.Message {
	var got []types.Message
	for {
		select {
		case msg := <-inbox.messages:
			got = append(got, msg)
		case <-time.After(chatSilence):
			return got
		}
	}
}
