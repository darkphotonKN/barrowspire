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

// partyPod is one replica in a two-pod party test: its own clock and ticks, a shared miniredis.
type partyPod struct {
	*partyRig
	podID string
}

func newPartyPod(t *testing.T, client redis.UniversalClient, podID string, inbox inboxBus, opts ...Option) *partyPod {
	t.Helper()

	characters := newFakeCharacters()
	partyClock := newChatClock()
	ticks := make(chan time.Time)
	queue := NewMockQueueService()
	ctx, shutdown := context.WithCancel(context.Background())
	t.Cleanup(shutdown)
	server := newTestServer(t, ctx, &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, characters, podID, testPodAddr, noopAnnouncer{},
		append([]Option{
			WithPartyClock(partyClock.now),
			withPartyTicks(ticks),
			WithPartyStore(partystore.NewRedis(client)),
			WithPresence(partypresence.NewRedis(client)),
			WithPodInbox(inbox),
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
		podID: podID,
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
	assert.Equal(t, testPodAddr, invite.Payload["party_pod_addr"])
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

// A decline on pod B goes back to pod A's inbox and A's inviter hears it, by name; the
// invite's place is freed. FS-R82NV R15.
func TestPartyDecline_CrossPod_InviterToldDeclined(t *testing.T) {
	a, b, mini := twoPartyPods(t)
	_, wrenConn, wrenInbox := a.inHub(t, "Wren")
	_, marlConn, marlInbox := seatedThere(t, b, mini, "Marl")
	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})
	invite := awaitParty(t, marlInbox, partyInviteAction, "Marl")
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	sendParty(b.server, marlConn, partyDeclineAction, map[string]interface{}{"invite_id": invite.Payload["invite_id"]})

	declined := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "declined", declined.Payload["code"])
	assert.Equal(t, "Marl", declined.Payload["name"])
}

// A player in a field has no presence key, so an invite from another pod is not_found
// ("not here right now"). FS-R82NV R7, R12; Edge States "Invitee is in a field or run".
func TestPartyInvite_CrossPod_TargetInAFieldNotFound(t *testing.T) {
	a, b, _ := twoPartyPods(t)
	_, wrenConn, wrenInbox := a.inHub(t, "Wren")
	b.inMeadows(t, "Marl")
	b.tick()

	sendParty(a.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Marl"})

	refused := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "not_found", refused.Payload["code"])
	assert.Equal(t, "Marl", refused.Payload["name"])
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
// reaches pod A's inviter: the pod remembers where the invite came from until a decline lands
// (FS-NCC9J R8, R13; code review 2026-11-01).
func TestPartyDecline_CrossPod_RetriedAfterRedisBlip(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	declines := &blippingDeclines{Redis: partystore.NewRedis(client)}
	declines.failures.Store(1)
	a, b, _ := twoPartyPodsOn(t, client, mini, chatbus.NewRedis(client), WithPartyStore(declines))
	_, wrenConn, wrenInbox := a.inHub(t, "Wren")
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
