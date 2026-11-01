package gameserver

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/hubocc"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Requirements R18–R20; I-NCC9J-5. A member presses Travel in their own village and is
// handed off to the hub of the pod their leader stands on.

const (
	partyTravelAction  = "party_travel"
	worldHandoffAction = "world_handoff"
)

// awaitHandoff waits for the world_handoff reaching inbox.
func awaitHandoff(t *testing.T, inbox *startSoloInbox, who string) types.Message {
	t.Helper()
	return awaitParty(t, inbox, worldHandoffAction, who)
}

// A member in their village on pod B, whose leader stands on pod A, is handed off to pod A's
// hub: world_handoff names pod A's address and says hub. FS-NCC9J R18; AC 1.
func TestPartyTravel_CrossPod_MemberInTheirVillage_HandedOffToTheLeadersPod(t *testing.T) {
	a, b, _, _, _, _, marlConn, _, marlInbox := crossPodParty(t)

	sendParty(b.server, marlConn, partyTravelAction, map[string]interface{}{})

	handoff := awaitHandoff(t, marlInbox, "Marl")
	require.Equal(t, a.podAddr, handoff.Payload["addr"])
	require.Equal(t, true, handoff.Payload["hub"])
}

// travelState is what a refusal row sets up for Marl, on pod B, whose leader Wren is on pod A.
type travelState struct {
	field, run, queued, leaderAway, podFull bool
}

// arrange puts Marl and the pods into s: in a field or a run on pod B, in the Spire queue, his
// leader's record away (Wren dropped from pod A, pod B's re-reads mark her), pod A's hub full.
func arrange(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis, wrenConn *websocket.Conn, marl *types.Player, s travelState) {
	t.Helper()
	if s.field {
		b.meadows.AddPlayerAt(marl.ID, marl.Character, "", 200, 200)
		b.server.setCurrentWorld(marl, b.meadows.ID)
	}
	if s.run {
		b.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{marl}})
	}
	if s.queued {
		b.queued(t, marl)
	}
	if s.leaderAway {
		a.server.holdForReconnect(wrenConn)
		a.tick()
		a.settle(t)
		b.runs(t, partystore.AwayAfter)
	}
	if s.podFull {
		require.NoError(t, mini.Set("hub:occ:pod-a", strconv.Itoa(constants.HubOccupancyCap+constants.HubTravelMargin)))
	}
	b.tick()
	b.settle(t)
}

// Travel's refusals fire in R18's order: each row also sets every condition checked after its
// own, so its code winning shows the order. FS-NCC9J R18; AC 2.
func TestPartyTravel_CrossPod_Refusals_InOrder(t *testing.T) {
	tests := []struct {
		name  string
		state travelState
		want  constants.PartyNoticeCode
	}{
		{"not in hub: in a field", travelState{field: true, queued: true, leaderAway: true, podFull: true}, constants.PartyNoticeNotInHub},
		{"not in hub: in a run", travelState{run: true, queued: true, leaderAway: true, podFull: true}, constants.PartyNoticeNotInHub},
		{"queued", travelState{queued: true, leaderAway: true, podFull: true}, constants.PartyNoticeQueued},
		{"leader away", travelState{leaderAway: true, podFull: true}, constants.PartyNoticeLeaderAway},
		{"leader's pod full", travelState{podFull: true}, constants.PartyNoticePodFull},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a, b, mini, _, marl, wrenConn, marlConn, _, marlInbox := crossPodParty(t)
			arrange(t, a, b, mini, wrenConn, marl, tt.state)
			drainInbox(marlInbox)

			sendParty(b.server, marlConn, partyTravelAction, map[string]interface{}{})

			notice := awaitParty(t, marlInbox, partyNoticeAction, "Marl")
			require.Equal(t, string(tt.want), notice.Payload["code"])
			assertNoParty(t, marlInbox, worldHandoffAction, "Marl, refused")
		})
	}
}

// A player in no party is refused not_member. FS-NCC9J R18; Edge States "Empty".
func TestPartyTravel_NoParty_NotMember(t *testing.T) {
	_, b, mini := twoPartyPods(t)
	_, oriConn, oriInbox := seatedThere(t, b, mini, "Ori")
	drainInbox(oriInbox)

	sendParty(b.server, oriConn, partyTravelAction, map[string]interface{}{})

	notice := awaitParty(t, oriInbox, partyNoticeAction, "Ori")
	require.Equal(t, string(constants.PartyNoticeNotMember), notice.Payload["code"])
}

// Each pod publishes how many players its hub seats, on a 3 s TTL, every tick, so travel can
// tell when the leader's pod has no room. FS-JEAVX R19; FS-NCC9J R18.
func TestHubOccupancy_PublishedEveryTick(t *testing.T) {
	a, _, mini := twoPartyPods(t)
	seatedThere(t, a, mini, "Wren")
	seatedThere(t, a, mini, "Kaelen")
	a.inMeadows(t, "Idris") // in a field, not the hub

	a.tick()
	a.settle(t)

	require.Eventually(t, func() bool {
		count, err := mini.Get("hub:occ:pod-a")
		return err == nil && count == "2"
	}, pointerWait, 10*time.Millisecond, "pod A publishes its hub's two")
	require.Equal(t, hubocc.TTL, mini.TTL("hub:occ:pod-a"))
}

// assertNoAnswer checks inbox gets neither a handoff nor a notice: the client never offers Travel
// here, so the server says nothing.
func assertNoAnswer(t *testing.T, inbox *startSoloInbox, who string) {
	t.Helper()
	for _, msg := range collectInbox(inbox) {
		require.NotEqual(t, worldHandoffAction, msg.Action, who)
		require.NotEqual(t, partyNoticeAction, msg.Action, who)
	}
}

// The leader, and a member already on the leader's pod, are answered with nothing: there is
// nowhere to travel to. FS-NCC9J R18.
func TestPartyTravel_NowhereToGo_AnsweredWithNothing(t *testing.T) {
	a, _, mini, _, _, wrenConn, _, wrenInbox, _ := crossPodParty(t)
	_, kaelenConn, kaelenInbox := seatedThere(t, a, mini, "Kaelen")
	inviteID := a.invited(t, wrenConn, "Kaelen", kaelenInbox)
	sendParty(a.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	drainInbox(kaelenInbox)
	drainInbox(wrenInbox)

	sendParty(a.server, wrenConn, partyTravelAction, map[string]interface{}{})
	sendParty(a.server, kaelenConn, partyTravelAction, map[string]interface{}{})

	assertNoAnswer(t, wrenInbox, "Wren, the leader")
	assertNoAnswer(t, kaelenInbox, "Kaelen, on the leader's pod")
}

// A member removed in Redis while this pod's cache still lists them is refused not_member: the
// party is read before anyone is sent anywhere, so a stale cache never moves a player (R4).
func TestPartyTravel_RemovedButStillCached_NotMember(t *testing.T) {
	_, b, mini, wren, marl, _, marlConn, _, marlInbox := crossPodParty(t)
	partyID, err := mini.Get("{party}:pl:" + marl.ID.String())
	require.NoError(t, err)
	// another pod kicks Marl; its letters never arrive here
	_, err = partystore.NewRedis(b.client).Remove(context.Background(), partystore.RemoveArgs{PartyID: uuid.MustParse(partyID), PlayerID: marl.ID, Kicker: wren.ID})
	require.NoError(t, err)
	drainInbox(marlInbox)

	sendParty(b.server, marlConn, partyTravelAction, map[string]interface{}{})

	notice := awaitParty(t, marlInbox, partyNoticeAction, "Marl")
	require.Equal(t, string(constants.PartyNoticeNotMember), notice.Payload["code"])
	assertNoParty(t, marlInbox, worldHandoffAction, "Marl")
}

// travelled has Marl, on pod B, travel to Wren's pod and waits for his handoff.
func travelled(t *testing.T, b *partyPod, marlConn *websocket.Conn, marlInbox *startSoloInbox) {
	t.Helper()
	sendParty(b.server, marlConn, partyTravelAction, map[string]interface{}{})
	awaitHandoff(t, marlInbox, "Marl")
}

// The pod a member travels from lets them go at once: their presence is unseated on its next
// tick, and the connection the handoff went over is marked, so when it drops they are not held for
// the reconnect grace (TestDisconnect_LetGoTraveller_NotHeld). FS-NCC9J R19; AC 3.
func TestPartyTravel_OldPodLetsGo_PresenceUnseated(t *testing.T) {
	_, b, mini, _, _, _, marlConn, _, marlInbox := crossPodParty(t)
	travelled(t, b, marlConn, marlInbox)

	b.tick()
	b.settle(t)

	awaitPresence(t, mini, "Marl", "")
	require.True(t, b.server.letGoOver(marlConn), "a drop of this connection ends Marl's stay")
}

// A traveller still here on the same connection once the travel window has passed was not taken
// by the travel (their arrival refused, R20): they are taken back, present here again.
// FS-NCC9J R19, R20.
func TestPartyTravel_WindowPassesStillHere_TakenBack(t *testing.T) {
	_, b, mini, _, _, _, marlConn, _, marlInbox := crossPodParty(t)
	travelled(t, b, marlConn, marlInbox)
	b.tick()
	b.settle(t)
	awaitPresence(t, mini, "Marl", "")

	b.partyClock.advance(travelWindow)
	b.tick()
	b.tick() // the presence keeper samples who is present after the take-back

	awaitPresence(t, mini, "Marl", "pod-b")
	require.False(t, b.server.letGoOver(marlConn))
}

// arrivesAt connects player to pod on a new connection, as a client following the travel handoff
// does, and sends enter_hub as their character there.
func arrivesAt(t *testing.T, pod *partyPod, player *types.Player) (*websocket.Conn, *startSoloInbox) {
	t.Helper()
	arrived := &types.Player{ID: player.ID, Username: player.Username}
	character := pod.characters.give(player.ID, player.Character.Class, player.Character.Name, player.Character.Level, player.Character.Experience)
	arrived.Character = character
	conn := &websocket.Conn{}
	registerTestConn(pod.server, conn, arrived)
	inbox := startSoloListen(t, pod.server, conn)
	pod.server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: string(constants.ActionEnterHub), Payload: map[string]interface{}{"characterId": character.ID.String()}},
	}
	return conn, inbox
}

// Arrival is an ordinary hub entry on the leader's pod: Marl is seated in pod A's hub and sent
// his party as it stands. FS-NCC9J R6, R20; AC 4.
func TestPartyTravel_ArrivalOnTheLeadersPod_SeatedAndShownTheParty(t *testing.T) {
	a, b, _, wren, marl, _, marlConn, _, marlInbox := crossPodParty(t)
	travelled(t, b, marlConn, marlInbox)

	_, arrivedInbox := arrivesAt(t, a, marl)

	entered := awaitParty(t, arrivedInbox, string(constants.ActionWorldEntered), "Marl, on pod A")
	require.Equal(t, string(types.WorldTypeHub), entered.Payload["world_type"])
	a.tick()
	sync := awaitUpdate(t, arrivedInbox, "sync", marl.ID, "Marl, on pod A")
	require.Equal(t, []string{wren.ID.String(), marl.ID.String()}, memberIDsOf(t, sync))
	require.Equal(t, "pod-a", podOf(t, sync, marl.ID), "pod A holds him now")
}

// fillHubTo seats bodies in pod's hub until it holds n players.
func fillHubTo(t *testing.T, pod *partyPod, n int) {
	t.Helper()
	for pod.hub.Occupancy() < n {
		pod.hub.AddPlayerAt(uuid.New(), types.CharacterInPlay{ID: uuid.New(), Name: "Filler", Class: "warrior"}, "", 600, 600)
	}
}

// awaitEnterHub waits for the answer to enter_hub: world_entered, or the refusal's message.
func awaitEnterHub(t *testing.T, inbox *startSoloInbox, who string) (admitted bool, why string) {
	t.Helper()
	for _, msg := range collectInbox(inbox) {
		switch msg.Action {
		case string(constants.ActionWorldEntered):
			return true, ""
		case string(constants.ActionEnterHub):
			why, _ := msg.Payload["message"].(string)
			return false, why
		}
	}
	t.Fatalf("%s never had an answer to enter_hub", who)
	return false, ""
}

// A hub at its cap still admits a member joining their leader there, up to one full party past
// it; anyone else is refused as ever, and past the margin so is the member. FS-NCC9J R18, R20
// (amended: travel's fixed margin, constants.HubTravelMargin).
func TestPartyTravel_Arrival_HubAtItsCap_MemberJoiningTheLeaderAdmitted(t *testing.T) {
	tests := []struct {
		name      string
		occupancy int
		member    bool
		admitted  bool
	}{
		{"at the cap, a member joining the leader", constants.HubOccupancyCap, true, true},
		{"at the cap, a stranger", constants.HubOccupancyCap, false, false},
		{"past the margin, a member joining the leader", constants.HubOccupancyCap + constants.HubTravelMargin, true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a, b, mini, _, marl, _, _, _, _ := crossPodParty(t)
			fillHubTo(t, a, tt.occupancy)
			arriver := marl
			if !tt.member {
				arriver, _, _ = seatedThere(t, b, mini, "Ori")
			}

			_, inbox := arrivesAt(t, a, arriver)

			admitted, why := awaitEnterHub(t, inbox, arriver.Character.Name)
			require.Equal(t, tt.admitted, admitted, why)
			if !tt.admitted {
				require.Equal(t, "The hub is full. Try again shortly.", why)
			}
		})
	}
}

// A leader whose presence names no pod address (written by a pod from before addresses were
// kept, during a rolling deploy) cannot be travelled to yet: the member is told unavailable, never
// sent to an empty address. FS-NCC9J R18.
func TestPartyTravel_LeaderPodAddressUnknown_Unavailable(t *testing.T) {
	_, b, mini, wren, _, _, marlConn, _, marlInbox := crossPodParty(t)
	mini.HDel("presence:id:"+wren.ID.String(), "pod_addr")
	drainInbox(marlInbox)

	sendParty(b.server, marlConn, partyTravelAction, map[string]interface{}{})

	notice := awaitParty(t, marlInbox, partyNoticeAction, "Marl")
	require.Equal(t, string(constants.PartyNoticeUnavailable), notice.Payload["code"])
	assertNoParty(t, marlInbox, worldHandoffAction, "Marl")
}
