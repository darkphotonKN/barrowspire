package gameserver

import (
	"context"
	"encoding/json"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/chatbus"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/hubocc"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-R82NV §Requirements R7, R9, R10, R12 (lookup), R13, R15. I-R82NV-3: an invite reaches a
// player seated on another pod through the presence index and that pod's inbox, and a decline
// comes back the same way.

// partyPod is one replica in a two-pod party test: its own clock, ticks and address, a shared
// miniredis.
type partyPod struct {
	*partyRig
	podID   string
	podAddr string
}

// podAddrOf is the address a test pod is reached at: each its own, so a handoff names one.
func podAddrOf(podID string) string { return "ws://" + podID + ".test/ws" }

func newPartyPod(t *testing.T, client redis.UniversalClient, podID string, inbox inboxBus, opts ...Option) *partyPod {
	t.Helper()

	characters := newFakeCharacters()
	partyClock := newChatClock()
	ticks := make(chan time.Time)
	queue := NewMockQueueService()
	var server *Server
	t.Cleanup(func() { stopWorlds(server) })
	ctx, shutdown := context.WithCancel(context.Background())
	t.Cleanup(shutdown)
	server = newTestServer(t, ctx, &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, characters, podID, podAddrOf(podID), noopAnnouncer{},
		append([]Option{
			WithPartyClock(partyClock.now),
			withPartyTicks(ticks),
			WithPartyStore(partystore.NewRedis(client)),
			WithPresence(partypresence.NewRedis(client)),
			WithPodInbox(inbox),
			WithHubOccupancy(hubocc.NewRedis(client)),
		}, opts...)...,
	)
	hub, ok := server.HubSession()
	require.True(t, ok)
	meadows, ok := server.FieldSession(game.FieldGentleMeadows)
	require.True(t, ok)

	return &partyPod{
		partyRig: &partyRig{
			chatRig:    &chatRig{server: server, clock: newChatClock(), hub: hub, meadows: meadows, characters: characters},
			client:     client,
			partyClock: partyClock,
			ticks:      ticks,
			queue:      queue,
			shutdown:   shutdown,
		},
		podID:   podID,
		podAddr: podAddrOf(podID),
	}
}

// twoPartyPods is pods A and B on one miniredis, each listening on its inbox, both alive.
func twoPartyPods(t *testing.T) (a, b *partyPod, mini *miniredis.Miniredis) {
	t.Helper()
	client, mini := testutil.NewRedis(t)
	return twoPartyPodsOn(t, client, mini, chatbus.NewRedis(client))
}

// twoPartyPodsOn is twoPartyPods with pod A writing to inboxes through aBus, and pod B built
// with bOpts as well.
func twoPartyPodsOn(t *testing.T, client redis.UniversalClient, mini *miniredis.Miniredis, aBus inboxBus, bOpts ...Option) (a, b *partyPod, _ *miniredis.Miniredis) {
	t.Helper()
	a = newPartyPod(t, client, "pod-a", aBus)
	b = newPartyPod(t, client, "pod-b", chatbus.NewRedis(client), bOpts...)
	for _, pod := range []string{"pod-a", "pod-b"} {
		require.NoError(t, mini.Set("pod:alive:"+pod, "1"))
		channel := "pod:" + pod + ":inbox"
		require.Eventually(t, func() bool { return mini.PubSubNumSub(channel)[channel] == 1 },
			pointerWait, 10*time.Millisecond, "%s listens on its inbox", pod)
	}
	return a, b, mini
}

// An invite by name from pod A reaches a player seated in pod B's hub, as the same
// party_invite a same-pod invite is; A's inviter is told it was sent. FS-R82NV R12, R13.
func TestPartyInvite_CrossPod_ReachesTheOtherPod(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	_, wrenConn, wrenInbox := a.inHub(t, "Wren")
	_, _, marlInbox := b.inHub(t, "Marl")
	b.tick()
	awaitPresence(t, mini, "Marl", "pod-b")

	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "marl"})

	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl, on pod B")
	assert.Equal(t, "Wren", invite.Payload["leader_name"])
	assert.EqualValues(t, 1, invite.Payload["member_count"])
	assert.EqualValues(t, defaultPartySize, invite.Payload["size"])
	assert.Equal(t, a.podAddr, invite.Payload["party_pod_addr"])
	assert.NotEmpty(t, invite.Payload["invite_id"])
	assert.NotContains(t, invite.Payload, "inviter_pod_id", "pod ids stay between pods")

	sent := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "sent", sent.Payload["code"])
	assert.Equal(t, "Marl", sent.Payload["name"], "the name as the character carries it, not as typed")
}

// seatedThere seats name in pod's hub and waits until the presence index says so.
func seatedThere(t *testing.T, pod *partyPod, mini *miniredis.Miniredis, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	player, conn, inbox := pod.inHub(t, name)
	pod.tick()
	awaitPresence(t, mini, name, pod.podID)
	return player, conn, inbox
}

// A decline on pod B reaches the leader on pod A, found in the presence index, by name; the
// invite's place is freed. FS-NCC9J R13.
func TestPartyDecline_CrossPod_InviterToldDeclined(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	_, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	_, marlConn, marlInbox := seatedThere(t, b, mini, "Marl")
	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})
	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl")
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	sendParty(b.server, marlConn, partyDeclineAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})

	declined := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "declined", declined.Payload["code"])
	assert.Equal(t, "Marl", declined.Payload["name"])
}

// A player in a field on pod B is present there, so an invite from pod A reaches them where they
// stand (FS-NCC9J R7, R11; user story 2).
func TestPartyInvite_CrossPod_TargetInAFieldReached(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	_, wrenConn, wrenInbox := a.inHub(t, "Wren")
	_, _, marlInbox := b.inMeadows(t, "Marl")
	b.tick()
	awaitPresence(t, mini, "Marl", "pod-b")

	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})

	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl, in pod B's Meadows")
	assert.Equal(t, "Wren", invite.Payload["leader_name"])
	sent := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "sent", sent.Payload["code"])
}

// A target in a party is already_in_party, from any pod: the invite script finds their
// pointer. FS-NCC9J R10.
func TestPartyInvite_CrossPod_TargetInAPartyThere(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	_, wrenConn, wrenInbox := a.inHub(t, "Wren")
	marl, marlConn, marlInbox := seatedThere(t, b, mini, "Marl")
	sendParty(b.server, marlConn, partyCreateAction, map[string]interface{}{})
	awaitUpdate(t, marlInbox, "joined", marl.ID, "Marl")
	require.True(t, mini.Exists(pointerKey(marl.ID)))

	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})

	refused := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "already_in_party", refused.Payload["code"])
	assert.Equal(t, "Marl", refused.Payload["name"])
}

// failingPublish is the chat bus with every publish refused, as a Redis that has gone.
type failingPublish struct{ inboxBus }

func (failingPublish) Publish(context.Context, string, []byte) error {
	return errors.New("redis gone")
}

// An invite whose letter cannot be published notices delivery_failed and holds no place.
// FS-R82NV R10.
func TestPartyInvite_CrossPod_PublishFailsDeliveryFailed(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	a, b, _ := twoPartyPodsOn(t, client, mini, failingPublish{chatbus.NewRedis(client)})
	_, wrenConn, wrenInbox := a.inHub(t, "Wren")
	seatedThere(t, b, mini, "Marl")

	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})

	sent := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "sent", sent.Payload["code"])
	failed := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "delivery_failed", failed.Payload["code"])
	assert.Equal(t, "Marl", failed.Payload["name"])

	// at size 2 a kept invite would fill the party; this one holds no place
	_, _, kaelenInbox := a.inHub(t, "Kaelen")
	a.invited(t, wrenConn, "Kaelen", kaelenInbox)
}

// A letter for a player this pod does not hold is dropped, and the pod goes on.
// FS-R82NV R9.
func TestPodInbox_LetterForAnAbsentPlayerDropped(t *testing.T) {
	_, b, mini := twoPartyPods(t)
	_, _, marlInbox := seatedThere(t, b, mini, "Marl")
	raw, err := json.Marshal(letter{Kind: letterPartyInvite, ToPlayerID: uuid.NewString(), Payload: map[string]interface{}{
		"invite_id": uuid.NewString(), "inviter_pod_id": "pod-a", "leader_name": "Wren",
	}})
	require.NoError(t, err)

	mini.Publish("pod:pod-b:inbox", string(raw))

	assertNoParty(t, marlInbox, partyInviteAction, "Marl: the letter was not his")
	b.tick() // the loop still runs
}

// blippingDeclines is the party store with its first declines failing, as on a short Redis outage.
type blippingDeclines struct {
	*partystore.Redis
	failures atomic.Int32
}

func (b *blippingDeclines) Decline(ctx context.Context, a partystore.DeclineArgs) (partystore.DeclineResult, error) {
	if b.failures.Add(-1) >= 0 {
		return partystore.DeclineResult{}, errors.New("redis blip")
	}
	return b.Redis.Decline(ctx, a)
}

// A decline on pod B that Redis could not take is refused unavailable, and a second try still
// reaches the leader on pod A (FS-NCC9J R8, R13; code review 2026-11-01).
func TestPartyDecline_CrossPod_RetriedAfterRedisBlip(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	declines := &blippingDeclines{Redis: partystore.NewRedis(client)}
	declines.failures.Store(1)
	a, b, _ := twoPartyPodsOn(t, client, mini, chatbus.NewRedis(client), WithPartyStore(declines))
	_, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	_, marlConn, marlInbox := seatedThere(t, b, mini, "Marl")
	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})
	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl")
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	sendParty(b.server, marlConn, partyDeclineAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})
	refused := awaitParty(t, marlInbox, partyNoticeAction, "Marl")
	assert.Equal(t, "unavailable", refused.Payload["code"])

	sendParty(b.server, marlConn, partyDeclineAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})
	declined := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "declined", declined.Payload["code"])
	assert.Equal(t, "Marl", declined.Payload["name"])
}

// fieldOf seats name in pod's Meadows and waits until the presence index says so.
func fieldOf(t *testing.T, pod *partyPod, mini *miniredis.Miniredis, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	player, conn, inbox := pod.inMeadows(t, name)
	pod.tick()
	awaitPresence(t, mini, name, pod.podID)
	return player, conn, inbox
}

// A player in a field on pod B accepts pod A's invite where they stand: nobody moves, and both
// members, on both pods, get the party of two (FS-NCC9J R5, R14; AC 1).
func TestPartyAccept_CrossPod_InAField_BothGetTheParty(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	wren, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	marl, marlConn, marlInbox := fieldOf(t, b, mini, "Marl")
	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})
	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl")

	sendParty(b.server, marlConn, partyAcceptAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})

	there := awaitUpdateAbout(t, marlInbox, marl.ID, "Marl, on pod B")
	assert.Equal(t, []string{wren.ID.String(), marl.ID.String()}, memberIDsOf(t, there))
	here := awaitUpdateAbout(t, wrenInbox, marl.ID, "Wren, on pod A")
	assert.Equal(t, []string{wren.ID.String(), marl.ID.String()}, memberIDsOf(t, here))
	for who, update := range map[string]types.Message{"Marl": there, "Wren": here} {
		assert.Equal(t, "field", memberField(t, update, marl.ID, "where"), "%s: Marl stands in a field (E6)", who)
		assert.Equal(t, "pod-b", memberField(t, update, marl.ID, "pod_id"), who)
		assert.Equal(t, "hub", memberField(t, update, wren.ID, "where"), who)
		assert.Equal(t, "pod-a", memberField(t, update, wren.ID, "pod_id"), who)
	}
	assertNoWorldHandoff(t, marlInbox)
}

// memberField is one field of a member as an update lists them.
func memberField(t *testing.T, update types.Message, member uuid.UUID, field string) string {
	t.Helper()
	for _, m := range listOf(t, update, "members") {
		if m["player_id"] == member.String() {
			v, _ := m[field].(string)
			return v
		}
	}
	t.Fatalf("%s is not a member", member)
	return ""
}

// A member present on no pod is listed with no pod and no world: they are offline, and the frames
// show no place for them (FS-NCC9J R21; I-NCC9J-3 E6).
func TestPartyUpdate_CrossPod_MemberPresentNowhere_NoPodNoWorld(t *testing.T) {
	a, b, mini, wren, _, wrenConn, marlConn, wrenInbox, _ := crossPodParty(t)
	ori, oriConn, oriInbox := seatedThere(t, b, mini, "Ori")
	inviteID := a.invited(t, wrenConn, "Ori", oriInbox)
	sendParty(b.server, oriConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	awaitUpdate(t, oriInbox, "joined", ori.ID, "Ori")
	awaitUpdate(t, wrenInbox, "joined", ori.ID, "Wren") // the accept has fanned out
	// Wren's pod stops writing her presence: as far as the index knows, she is offline
	mini.Del("presence:id:" + wren.ID.String())
	mini.Del("presence:name:wren")

	sendParty(b.server, marlConn, partyLeaveAction, map[string]interface{}{})

	var left types.Message
	for {
		update := awaitParty(t, oriInbox, partyUpdateAction, "Ori")
		if update.Payload["reason"] == "left" {
			left = update
			break
		}
	}
	assert.Empty(t, memberField(t, left, wren.ID, "pod_id"), "Wren is present on no pod")
	assert.Empty(t, memberField(t, left, wren.ID, "where"))
	// the fields are there, and filled, for a member who is present
	assert.Equal(t, "pod-b", memberField(t, left, ori.ID, "pod_id"))
	assert.Equal(t, "hub", memberField(t, left, ori.ID, "where"))
}

// crossPodParty is Wren on pod A leading Marl on pod B, size 3, both present, every update drained.
func crossPodParty(t *testing.T) (a, b *partyPod, mini *miniredis.Miniredis, wren, marl *types.Player, wrenConn, marlConn *websocket.Conn, wrenInbox, marlInbox *startSoloInbox) {
	t.Helper()
	a, b, mini = twoPartyPodsSized(t, 3)
	wren, wrenConn, wrenInbox = seatedThere(t, a, mini, "Wren")
	marl, marlConn, marlInbox = seatedThere(t, b, mini, "Marl")
	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})
	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl")
	sendParty(b.server, marlConn, partyAcceptAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})
	awaitUpdateAbout(t, marlInbox, marl.ID, "Marl")
	awaitUpdateAbout(t, wrenInbox, marl.ID, "Wren")
	return a, b, mini, wren, marl, wrenConn, marlConn, wrenInbox, marlInbox
}

// podOf is the pod_id an update gives a member.
func podOf(t *testing.T, update types.Message, member uuid.UUID) string {
	t.Helper()
	return memberField(t, update, member, "pod_id")
}

// Every member, on every pod, hears of an open invite as a reserved slot, and of its decline as
// the slot going; each member's update names the pod holding every member (FS-NCC9J R5, R21; AC 4).
func TestPartyReserved_CrossPod_EveryMemberSeesTheSlot(t *testing.T) {
	a, b, mini, wren, marl, wrenConn, _, wrenInbox, marlInbox := crossPodParty(t)
	ori, oriConn, oriInbox := seatedThere(t, b, mini, "Ori")

	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Ori"})
	invite := awaitParty(t, oriInbox, partyInviteAction, "Ori")
	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Marl": marlInbox} {
		invited := awaitUpdate(t, inbox, "invited", ori.ID, who)
		reserved := listOf(t, invited, "reserved")
		require.Len(t, reserved, 1, who)
		assert.Equal(t, "Ori", reserved[0]["name"], who)
		assert.NotEmpty(t, reserved[0]["expires_at"], who)
		assert.Equal(t, "pod-a", podOf(t, invited, wren.ID), "%s: Wren stands on pod A", who)
		assert.Equal(t, "pod-b", podOf(t, invited, marl.ID), "%s: Marl stands on pod B", who)
	}

	sendParty(b.server, oriConn, partyDeclineAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})
	ended := awaitUpdate(t, marlInbox, "invite_ended", ori.ID, "Marl")
	assert.Empty(t, listOf(t, ended, "reserved"), "Marl")
	// the leader hears both, in no set order: the slot gone, and who declined
	var sawEnded, sawDeclined bool
	for !sawEnded || !sawDeclined {
		msg, got := wrenInbox.await(partyUpdateAction, partyNoticeAction)
		require.True(t, got, "Wren heard the slot go (%v) and the decline (%v)", sawEnded, sawDeclined)
		switch {
		case msg.Action == partyUpdateAction && msg.Payload["reason"] == "invite_ended":
			assert.Empty(t, listOf(t, msg, "reserved"), "Wren")
			sawEnded = true
		case msg.Action == partyNoticeAction:
			assert.Equal(t, "declined", msg.Payload["code"])
			assert.Equal(t, "Ori", msg.Payload["name"])
			sawDeclined = true
		}
	}
}

// twoPartyPodsSized is twoPartyPods with every party capped at size.
func twoPartyPodsSized(t *testing.T, size int) (a, b *partyPod, mini *miniredis.Miniredis) {
	t.Helper()
	client, mini := testutil.NewRedis(t)
	a = newPartyPod(t, client, "pod-a", chatbus.NewRedis(client), WithPartySize(size))
	b = newPartyPod(t, client, "pod-b", chatbus.NewRedis(client), WithPartySize(size))
	for _, pod := range []string{"pod-a", "pod-b"} {
		channel := "pod:" + pod + ":inbox"
		require.Eventually(t, func() bool { return mini.PubSubNumSub(channel)[channel] == 1 },
			pointerWait, 10*time.Millisecond, "%s listens on its inbox", pod)
	}
	return a, b, mini
}

// An invite from pod A to a player on pod B meets FS-NCC9J R10's refusals in order: the
// inviter's own standing first (not_leader, queued, party_full, self), then the target's
// (not_found, already_in_party, pending). Three rows meet two refusals and prove the earlier wins:
// not_leader before already_in_party, party_full before self, already_in_party before pending
// (AC 3).
func TestPartyInvite_CrossPod_Refusals_InOrder(t *testing.T) {
	tests := []struct {
		name string
		// the party cap on both pods: 3 where a row needs an open slot beside an open invite
		size int
		// arrange seats whoever the row needs and returns the inviter's connection and inbox on
		// pod A, and the name they will send
		arrange  func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string)
		wantCode string
		wantName string
	}{
		{
			name: "not the leader, ahead of a target in a party",
			size: 3,
			arrange: func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string) {
				_, idrisConn, idrisInbox := seatedThere(t, a, mini, "Idris")
				_, kaelenConn, kaelenInbox := seatedThere(t, a, mini, "Kaelen")
				a.partied(t, idrisConn, idrisInbox, "Kaelen", kaelenConn, kaelenInbox)
				marl, marlConn, marlInbox := seatedThere(t, b, mini, "Marl")
				sendParty(b.server, marlConn, partyCreateAction, map[string]interface{}{})
				awaitUpdate(t, marlInbox, "joined", marl.ID, "Marl")
				return kaelenConn, kaelenInbox, "Marl"
			},
			wantCode: "not_leader",
		},
		{
			name: "inviter queued for the Spire",
			size: 2,
			arrange: func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string) {
				wren, conn, inbox := seatedThere(t, a, mini, "Wren")
				seatedThere(t, b, mini, "Marl")
				a.queued(t, wren)
				return conn, inbox, "Marl"
			},
			wantCode: "queued",
		},
		{
			name: "party full counting an open invite to pod B, ahead of naming yourself",
			size: 2,
			arrange: func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := seatedThere(t, a, mini, "Wren")
				_, _, marlInbox := seatedThere(t, b, mini, "Marl")
				a.invited(t, conn, "Marl", marlInbox)
				awaitParty(t, inbox, partyNoticeAction, "Wren") // sent
				return conn, inbox, "Wren"
			},
			wantCode: "party_full",
		},
		{
			name: "no such name on any pod",
			size: 2,
			arrange: func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := seatedThere(t, a, mini, "Wren")
				return conn, inbox, "Nobody"
			},
			wantCode: "not_found",
			wantName: "Nobody",
		},
		{
			name: "target in a party on pod B",
			size: 2,
			arrange: func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := seatedThere(t, a, mini, "Wren")
				marl, marlConn, marlInbox := seatedThere(t, b, mini, "Marl")
				sendParty(b.server, marlConn, partyCreateAction, map[string]interface{}{})
				awaitUpdate(t, marlInbox, "joined", marl.ID, "Marl")
				return conn, inbox, "Marl"
			},
			wantCode: "already_in_party",
			wantName: "Marl",
		},
		{
			// pod A's cache never holds Marl's party, but it does hold the open invite to him: the
			// script, not the cache, must answer, and already_in_party comes first (code review)
			name: "target on pod B leads a party of their own and still holds this party's invite",
			size: 3,
			arrange: func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := seatedThere(t, a, mini, "Wren")
				marl, marlConn, marlInbox := seatedThere(t, b, mini, "Marl")
				a.invited(t, conn, "Marl", marlInbox)
				awaitParty(t, inbox, partyNoticeAction, "Wren") // sent
				sendParty(b.server, marlConn, partyCreateAction, map[string]interface{}{})
				awaitUpdate(t, marlInbox, "joined", marl.ID, "Marl")
				return conn, inbox, "Marl"
			},
			wantCode: "already_in_party",
			wantName: "Marl",
		},
		{
			name: "an invite to the target on pod B is still open",
			size: 3,
			arrange: func(t *testing.T, a, b *partyPod, mini *miniredis.Miniredis) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := seatedThere(t, a, mini, "Wren")
				_, _, marlInbox := seatedThere(t, b, mini, "Marl")
				a.invited(t, conn, "Marl", marlInbox)
				awaitParty(t, inbox, partyNoticeAction, "Wren") // sent
				return conn, inbox, "marl"
			},
			wantCode: "pending",
			wantName: "Marl",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a, b, mini := twoPartyPodsSized(t, tt.size)
			conn, inbox, name := tt.arrange(t, a, b, mini)

			sendParty(a.server, conn, partyInviteAction, map[string]interface{}{"name": name})

			refused := awaitParty(t, inbox, partyNoticeAction, "the inviter")
			assert.Equal(t, tt.wantCode, refused.Payload["code"])
			if tt.wantName == "" {
				assert.NotContains(t, refused.Payload, "name")
			} else {
				assert.Equal(t, tt.wantName, refused.Payload["name"])
			}
		})
	}
}

// gatedLookup is the presence index with its name lookups held until the test opens the gate; it
// says on entered when one has started.
type gatedLookup struct {
	*partypresence.Redis
	entered chan struct{}
	gate    chan struct{}
}

func (g gatedLookup) Lookup(ctx context.Context, nameOrID string) (partypresence.Found, bool, error) {
	g.entered <- struct{}{}
	select {
	case <-g.gate:
	case <-ctx.Done():
		return partypresence.Found{}, false, ctx.Err()
	}
	return g.Redis.Lookup(ctx, nameOrID)
}

// An inviter who joined the Spire queue while their target was being looked up is refused queued
// when the answer comes back: the queue entry is read again after the lookup, not only before it
// (FS-NCC9J R10; I-R82NV-3 review, carried into I-NCC9J-3).
func TestPartyInvite_CrossPod_QueuedDuringLookup_Refused(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	entered, gate := make(chan struct{}, 1), make(chan struct{})
	a := newPartyPod(t, client, "pod-a", chatbus.NewRedis(client), WithPresence(gatedLookup{Redis: partypresence.NewRedis(client), entered: entered, gate: gate}))
	b := newPartyPod(t, client, "pod-b", chatbus.NewRedis(client))
	for _, pod := range []string{"pod-a", "pod-b"} {
		channel := "pod:" + pod + ":inbox"
		require.Eventually(t, func() bool { return mini.PubSubNumSub(channel)[channel] == 1 },
			pointerWait, 10*time.Millisecond, "%s listens on its inbox", pod)
	}
	wren, wrenConn, wrenInbox := a.inHub(t, "Wren")
	_, _, marlInbox := seatedThere(t, b, mini, "Marl")

	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})
	<-entered // the lookup is under way
	a.queued(t, wren)
	close(gate)

	refused := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "queued", refused.Payload["code"])
	assertNoParty(t, marlInbox, partyInviteAction, "Marl: the invite was never sent")
}

// A player delving on pod B is reached by pod A's invite, but accepting there is refused locked
// until FS-BJNYC gives every run a party (FS-NCC9J R11, R14; AC 2).
func TestPartyAccept_CrossPod_InARun_Locked(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	wren, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	_, marlConn, marlInbox := b.inRun(t, "Marl")
	b.tick()
	awaitPresence(t, mini, "Marl", "pod-b")
	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})
	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl, delving on pod B")
	awaitUpdate(t, wrenInbox, "joined", wren.ID, "Wren") // her party of one, Marl's slot reserved

	sendParty(b.server, marlConn, partyAcceptAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})

	refused := awaitParty(t, marlInbox, partyNoticeAction, "Marl")
	assert.Equal(t, "locked", refused.Payload["code"])
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody joined")
}

// A player who joins one party voids another party's invite to them on another pod: that party's
// leader is told already_in_party by letter, and its members hear the slot go (FS-NCC9J R14, R21;
// Edge States "Invitee joins another party first").
func TestPartyAccept_CrossPod_VoidsAnInviteFromAnotherPod(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	_, wrenConn, wrenInbox := seatedThere(t, a, mini, "Wren")
	kaelen, kaelenConn, kaelenInbox := seatedThere(t, a, mini, "Kaelen")
	idris, idrisConn, idrisInbox := seatedThere(t, b, mini, "Idris")
	fromWren := a.invited(t, wrenConn, "Kaelen", kaelenInbox)
	sendParty(b.server, idrisConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})
	awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen, invited by Idris on pod B")
	awaitUpdate(t, idrisInbox, "joined", idris.ID, "Idris") // a party of one, Kaelen's slot reserved

	sendParty(a.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": fromWren})
	awaitUpdateAbout(t, wrenInbox, kaelen.ID, "Wren")

	var sawEnded, sawVoided bool
	for !sawEnded || !sawVoided {
		msg, got := idrisInbox.await(partyUpdateAction, partyNoticeAction)
		require.True(t, got, "Idris on pod B heard the slot go (%v) and why (%v)", sawEnded, sawVoided)
		switch {
		case msg.Action == partyUpdateAction && msg.Payload["reason"] == "invite_ended":
			assert.Equal(t, kaelen.ID.String(), msg.Payload["subject_id"])
			assert.Empty(t, listOf(t, msg, "reserved"))
			sawEnded = true
		case msg.Action == partyNoticeAction:
			assert.Equal(t, "already_in_party", msg.Payload["code"])
			assert.Equal(t, "Kaelen", msg.Payload["name"])
			sawVoided = true
		}
	}
}
