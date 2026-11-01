package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Requirements R17, R21 (`online`); I-NCC9J-4. Every member has a record the pod holding
// them refreshes every ten seconds: about 30 s without a refresh and they show away, five minutes
// and they are removed, with succession if they led.

// onlineOf is the online flag an update gives a member.
func onlineOf(t *testing.T, update types.Message, member uuid.UUID) bool {
	t.Helper()
	for _, m := range listOf(t, update, "members") {
		if m["player_id"] == member.String() {
			online, ok := m["online"].(bool)
			require.True(t, ok, "online is a bool")
			return online
		}
	}
	t.Fatalf("%s is not a member", member)
	return false
}

// awaitUpdateWhere waits for the party_update that satisfies match, dropping the rest.
func awaitUpdateWhere(t *testing.T, inbox *startSoloInbox, who, what string, match func(types.Message) bool) types.Message {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == partyUpdateAction && match(msg) {
				return msg
			}
		case <-deadline:
			t.Fatalf("%s never received a party_update %s", who, what)
			return types.Message{}
		}
	}
}

// A member whose pod stops refreshing them (they dropped from pod B) shows away to a teammate on
// pod A once AwayAfter has passed without a refresh: about 30 s from the drop. FS-NCC9J R17; AC 1.
func TestPartyAway_CrossPod_MemberDropped_ShownAwayAfter30s(t *testing.T) {
	a, b, _, _, marl, _, marlConn, wrenInbox, _ := crossPodParty(t)
	b.server.holdForReconnect(marlConn)
	b.tick()

	a.partyClock.advance(partystore.AwayAfter)
	a.tick()

	awaitUpdateWhere(t, wrenInbox, "Wren", "showing Marl away", func(u types.Message) bool {
		return !onlineOf(t, u, marl.ID)
	})
}

// reseated puts player back on pod on a new connection, as a reconnect does, and ticks pod so it
// reads their party on arrival, waiting for the read to land.
func reseated(t *testing.T, pod *partyPod, player *types.Player) (*websocket.Conn, *startSoloInbox) {
	t.Helper()
	conn := &websocket.Conn{}
	pod.server.MapConnToPlayer(conn, player.ID, make(chan interface{}, clientWriterBuffer))
	inbox := startSoloListen(t, pod.server, conn)
	pod.tick()
	pod.settle(t)
	return conn, inbox
}

// assertNeverAway checks nothing reaching inbox until it goes quiet shows member away.
func assertNeverAway(t *testing.T, inbox *startSoloInbox, member uuid.UUID, who string) {
	t.Helper()
	for _, msg := range collectInbox(inbox) {
		if msg.Action == partyUpdateAction {
			require.True(t, onlineOf(t, msg, member), "%s is never shown the member away", who)
		}
	}
}

// A drop shorter than 30 s never shows away: Marl drops from pod B and is seated there again 20 s
// later, which refreshes his record, so pod A's re-reads at 40 s and 55 s find him online.
// FS-NCC9J R17; AC 4.
func TestPartyAway_CrossPod_ShortDrop_NeverShownAway(t *testing.T) {
	a, b, _, _, marl, _, marlConn, wrenInbox, _ := crossPodParty(t)
	b.server.holdForReconnect(marlConn)
	b.tick()
	b.partyClock.advance(20 * time.Second)
	reseated(t, b, marl)

	a.partyClock.advance(partystore.AwayAfter)
	a.tick()
	a.partyClock.advance(15 * time.Second)
	a.tick()
	a.settle(t)

	assertNeverAway(t, wrenInbox, marl.ID, "Wren")
}

// Five minutes without a refresh and the member is removed: the next re-read by a pod holding a
// teammate removes Marl by script, and Wren hears he left. FS-NCC9J R17; AC 2.
func TestPartyAway_CrossPod_FiveMinutesUnrefreshed_Removed(t *testing.T) {
	a, b, _, wren, marl, _, marlConn, wrenInbox, _ := crossPodParty(t)
	b.server.holdForReconnect(marlConn)
	b.tick()

	a.runs(t, partystore.RecordTTL)

	left := awaitUpdateWhere(t, wrenInbox, "Wren", "telling Marl left", func(u types.Message) bool {
		return u.Payload["reason"] == "left"
	})
	require.Equal(t, marl.ID.String(), left.Payload["subject_id"])
	require.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, left))
}

// runs advances the pod's clock by d one re-read at a time, ticking at each, as a live pod's own
// re-reads refresh its seated players' records every ten seconds.
func (r *partyRig) runs(t *testing.T, d time.Duration) { running(t, d, r) }

// running is runs for several pods side by side, their clocks kept level: each step waits for
// every pod's re-read to land, so no pod's clock runs ahead of another's writes, as on real pods
// sharing the wall clock.
func running(t *testing.T, d time.Duration, rigs ...*partyRig) {
	t.Helper()
	for step := time.Duration(0); step < d; step += partyRefreshInterval {
		for _, r := range rigs {
			r.partyClock.advance(partyRefreshInterval)
			r.tick()
			r.settle(t)
		}
	}
}

// settle waits until every Redis call the pod's party runner has queued so far has run and its
// outcome been handled on the hub's loop: the runner is first in, first out, and so is the loop.
func (r *partyRig) settle(t *testing.T) {
	t.Helper()
	done := make(chan struct{})
	r.onLoop(t, func(reg *partyRegistry) {
		onRunner(context.Background(), reg.run,
			func(context.Context) (struct{}, error) { return struct{}{}, nil },
			func(struct{}, error) { close(done) })
	})
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("the party runner never drained")
	}
}

// A leader gone five minutes is removed and the lead passes to the earliest-joined member who
// remains, wherever they stand: Wren leads from pod A, Marl on pod B joined before Ori on pod A,
// and Wren drops. Both pods keep running; Marl leads. FS-NCC9J R17; AC 2; Edge States "Leader on a
// pod that dies".
func TestPartyAway_CrossPod_LeaderUnrefreshed_EarliestJoinedLeads(t *testing.T) {
	a, b, mini, wren, marl, wrenConn, _, _, marlInbox := crossPodParty(t)
	ori, oriConn, oriInbox := seatedThere(t, a, mini, "Ori")
	inviteID := a.invited(t, wrenConn, "Ori", oriInbox)
	sendParty(a.server, oriConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	awaitUpdate(t, oriInbox, "joined", ori.ID, "Ori")
	awaitUpdate(t, marlInbox, "joined", ori.ID, "Marl")
	a.server.holdForReconnect(wrenConn)

	running(t, partystore.RecordTTL, a.partyRig, b.partyRig)

	for who, inbox := range map[string]*startSoloInbox{"Marl": marlInbox, "Ori": oriInbox} {
		left := awaitUpdateWhere(t, inbox, who, "telling Wren left", func(u types.Message) bool {
			return u.Payload["reason"] == "left"
		})
		require.Equal(t, wren.ID.String(), left.Payload["subject_id"], who)
		leader := awaitUpdate(t, inbox, "leader", marl.ID, who)
		require.Equal(t, marl.ID.String(), leader.Payload["leader_id"], who)
		require.Equal(t, []string{marl.ID.String(), ori.ID.String()}, memberIDsOf(t, leader), who)
	}
}

// seatedAs seats an existing player in pod's hub on a new connection, as a reconnect or a travel
// to another pod does, and ticks pod so it reads their party on arrival, waiting for the read to
// land.
func seatedAs(t *testing.T, pod *partyPod, player *types.Player) *startSoloInbox {
	t.Helper()
	arrived := &types.Player{ID: player.ID, Username: player.Username, Character: player.Character}
	conn := &websocket.Conn{}
	registerTestConn(pod.server, conn, arrived)
	pod.hub.AddPlayerAt(arrived.ID, arrived.Character, "", 600, 600)
	pod.server.setCurrentWorld(arrived, pod.hub.ID)
	inbox := startSoloListen(t, pod.server, conn)
	pod.tick()
	pod.settle(t)
	return inbox
}

// A member seated again on another pod within five minutes stays: Marl drops from pod B, shows
// away, and is seated on pod A a minute later; his record is refreshed there, Wren sees him
// online at once, and five more minutes on he is still a member. FS-NCC9J R17; AC 3.
func TestPartyAway_CrossPod_SeatedAgainElsewhere_OnlineAndStays(t *testing.T) {
	a, b, _, wren, marl, _, marlConn, wrenInbox, _ := crossPodParty(t)
	b.server.holdForReconnect(marlConn)
	b.tick()
	a.runs(t, time.Minute)
	awaitUpdateWhere(t, wrenInbox, "Wren", "showing Marl away", func(u types.Message) bool {
		return !onlineOf(t, u, marl.ID)
	})

	seatedAs(t, a, marl)

	back := awaitUpdateWhere(t, wrenInbox, "Wren", "showing Marl back", func(u types.Message) bool {
		return onlineOf(t, u, marl.ID)
	})
	require.Equal(t, []string{wren.ID.String(), marl.ID.String()}, memberIDsOf(t, back))
	a.runs(t, partystore.RecordTTL)
	for _, msg := range collectInbox(wrenInbox) {
		if msg.Action == partyUpdateAction {
			require.NotEqual(t, "left", msg.Payload["reason"], "Marl stays")
			require.True(t, onlineOf(t, msg, marl.ID), "Marl stays online")
		}
	}
}

// Each pod checks its cached parties every tick, between its ten-second re-reads: pod A re-reads
// 5 s short of AwayAfter and finds Marl not yet away; 6 s later, with no re-read due, the tick's
// check finds his record past AwayAfter and Wren is told then, not at the next re-read.
// FS-NCC9J R17.
func TestPartyAway_CrossPod_TickBetweenReReads_ShownAway(t *testing.T) {
	a, b, _, _, marl, _, marlConn, wrenInbox, _ := crossPodParty(t)
	b.server.holdForReconnect(marlConn)
	b.tick()
	a.partyClock.advance(partystore.AwayAfter - 5*time.Second)
	a.tick()
	a.settle(t)
	assertNeverAway(t, wrenInbox, marl.ID, "Wren, short of AwayAfter")

	a.partyClock.advance(6 * time.Second)
	a.tick()

	awaitUpdateWhere(t, wrenInbox, "Wren", "showing Marl away", func(u types.Message) bool {
		return !onlineOf(t, u, marl.ID)
	})
}

// A drop under 30 s never shows away even at its worst: Marl's record is refreshed at 10 s, he
// drops at 19 s, just before his pod's next refresh, and is back 25 s later. Pod A's re-read at
// 40 s, 30 s after his last refresh, still finds him online, because away counts from the last
// refresh and so allows one refresh interval more. FS-NCC9J R17 (amended); AC 4.
func TestPartyAway_CrossPod_ShortDropJustBeforeARefresh_NeverShownAway(t *testing.T) {
	a, b, _, _, marl, _, marlConn, wrenInbox, _ := crossPodParty(t)
	running(t, partyRefreshInterval, a.partyRig, b.partyRig) // both at 10 s: Marl refreshed
	b.partyClock.advance(9 * time.Second)
	b.server.holdForReconnect(marlConn)
	b.tick()
	b.settle(t)

	a.partyClock.advance(30 * time.Second) // 40 s
	a.tick()
	a.settle(t)
	b.partyClock.advance(25 * time.Second) // 44 s
	reseated(t, b, marl)
	a.partyClock.advance(6 * time.Second)
	a.tick()
	a.settle(t)

	assertNeverAway(t, wrenInbox, marl.ID, "Wren")
}

// A member seated again only once their record has expired is out, and this pod's cache knows it
// at once, so no reconcile before the next re-read shows them the party they left: Marl, gone
// from pod B since the start, is seated on pod A, which holds Wren, in the tick his record turns
// five minutes old, with no re-read due in that tick. FS-NCC9J R4, R17 (code review MED).
func TestPartyAway_CrossPod_SeatedAfterTheRecordExpired_CacheLetsThemGo(t *testing.T) {
	a, b, _, wren, marl, _, marlConn, wrenInbox, _ := crossPodParty(t)
	b.server.holdForReconnect(marlConn)
	b.tick()
	// pod A's re-reads land at 5 s past each ten, so none is due at five minutes
	a.partyClock.advance(5 * time.Second)
	a.tick()
	a.runs(t, partystore.RecordTTL-10*time.Second)
	a.partyClock.advance(5 * time.Second)

	marlInbox := seatedAs(t, a, marl)

	left := awaitUpdateWhere(t, wrenInbox, "Wren", "telling Marl left", func(u types.Message) bool {
		return u.Payload["reason"] == "left"
	})
	require.Equal(t, marl.ID.String(), left.Payload["subject_id"])
	final := awaitParty(t, marlInbox, partyUpdateAction, "Marl")
	require.Equal(t, "left", final.Payload["reason"], "Marl's last update")
	require.NotContains(t, memberIDsOf(t, final), marl.ID.String())
	a.onLoop(t, func(reg *partyRegistry) {
		p, cached := reg.cache.partyOf(wren.ID)
		require.True(t, cached)
		require.False(t, hasMember(p, marl.ID), "the cache no longer lists Marl")
		require.False(t, reg.cache.grouped(marl.ID), "nor knows him as grouped")
	})
}
