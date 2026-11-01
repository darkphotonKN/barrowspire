package gameserver

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Requirements R6, R8, R9, R14, R15 on one pod. I-NCC9J-1: the party in Redis, read and
// changed from any world, the hub's loop never waiting on it.

// A player in a field invites someone in the town: an invite is sent from any world (R9).
func TestPartyInvite_FromAField_Delivered(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inMeadows(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})

	awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
	sent := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "sent", sent.Payload["code"])
}

// An invitee who walked into a field accepts there and joins where they stand: nobody moves, and
// both get the party of two (R14; user story 3).
func TestPartyAccept_InAField_JoinsWhereTheyStand(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	rig.hub.RemovePlayer(kaelen.ID.String())
	rig.meadows.AddPlayerAt(kaelen.ID, kaelen.Character, "", 200, 200)
	rig.server.setCurrentWorld(kaelen, rig.meadows.ID)

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})

	joined := awaitUpdateAbout(t, kaelenInbox, kaelen.ID, "Kaelen")
	assert.Equal(t, []string{wren.ID.String(), kaelen.ID.String()}, memberIDsOf(t, joined))
	awaitUpdateAbout(t, wrenInbox, kaelen.ID, "Wren")
	assertNoWorldHandoff(t, kaelenInbox)
}

// A player in a field creates a party there (R15).
func TestPartyCreate_InAField_Forms(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inMeadows(t, "Wren")

	sendParty(rig.server, wrenConn, partyCreateAction, map[string]interface{}{})

	formed := awaitUpdate(t, wrenInbox, "joined", wren.ID, "Wren")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, formed))
}

// A player seated on the pod is read from Redis and sent all of their party at once, reason sync,
// so a party changed while they were elsewhere is shown on arrival; it is sent once, not on every
// tick (R6; user story 20).
func TestPartyArrival_SeatedPlayerGetsTheirParty(t *testing.T) {
	rig := newPartyRig(t)
	kaelen, _, kaelenInbox := rig.inHub(t, "Kaelen")
	// a party formed on another pod, as only Redis knows it
	partyID := uuid.New()
	created, err := partystore.NewRedis(rig.client).Create(context.Background(), partyID,
		partystore.Joiner{PlayerID: kaelen.ID, Name: "Kaelen", Class: "warrior"}, rig.partyClock.now())
	require.NoError(t, err)
	require.Empty(t, created.Refusal)

	rig.tick()

	sync := awaitUpdate(t, kaelenInbox, "sync", kaelen.ID, "Kaelen")
	assert.Equal(t, partyID.String(), sync.Payload["party_id"])
	assert.Equal(t, kaelen.ID.String(), sync.Payload["leader_id"])
	assert.Equal(t, []string{kaelen.ID.String()}, memberIDsOf(t, sync))

	rig.tick()
	assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen: already held, not read again")
}

// With Redis unreachable every party change is refused unavailable: create, invite, accept and
// decline (R8; Edge States "Redis unreachable").
func TestParty_RedisUnreachable_ChangesRefusedUnavailable(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent
	rig.mini.Close()

	for _, step := range []struct {
		who     string
		send    func()
		inbox   *startSoloInbox
		purpose string
	}{
		{"Idris", func() { sendParty(rig.server, idrisConn, partyCreateAction, map[string]interface{}{}) }, idrisInbox, "create"},
		{"Idris", func() { sendParty(rig.server, idrisConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"}) }, idrisInbox, "invite"},
		{"Kaelen", func() {
			sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
		}, kaelenInbox, "accept"},
		{"Kaelen", func() {
			sendParty(rig.server, kaelenConn, partyDeclineAction, map[string]interface{}{"invite_id": inviteID})
		}, kaelenInbox, "decline"},
	} {
		step.send()
		refused := awaitParty(t, step.inbox, partyNoticeAction, step.who)
		assert.Equal(t, "unavailable", refused.Payload["code"], step.purpose)
	}
}

// With Redis unreachable the party is still read from the cache: a member who does not lead is
// refused not_leader without asking Redis (R4, R8; AC "No Redis call on the hub loop for a party
// read").
func TestParty_RedisUnreachable_ReadsComeFromTheCache(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.mini.Close()

	sendParty(rig.server, kaelenConn, partyInviteAction, map[string]interface{}{"name": "Idris"})

	refused := awaitParty(t, kaelenInbox, partyNoticeAction, "Kaelen")
	assert.Equal(t, "not_leader", refused.Payload["code"])
}

// blippingArrivals is the party store with its first arrival reads failing, as on a short Redis
// outage.
type blippingArrivals struct {
	*partystore.Redis
	failures atomic.Int32
}

func (b *blippingArrivals) PartyOf(ctx context.Context, playerID uuid.UUID, now time.Time) (partystore.Party, bool, error) {
	if b.failures.Add(-1) >= 0 {
		return partystore.Party{}, false, errors.New("redis blip")
	}
	return b.Redis.PartyOf(ctx, playerID, now)
}

// An arrival read that fails is tried again on a later tick: a short Redis outage as a player is
// seated does not leave their party out of the cache for their whole stay (R6; code review
// 2026-11-01, HIGH).
func TestPartyArrival_FailedReadRetried(t *testing.T) {
	var store *blippingArrivals
	rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
		store = &blippingArrivals{Redis: partystore.NewRedis(client)}
		store.failures.Store(1)
		return []Option{WithPartyStore(store)}
	})
	kaelen, _, kaelenInbox := rig.inHub(t, "Kaelen")
	created, err := store.Create(context.Background(), uuid.New(),
		partystore.Joiner{PlayerID: kaelen.ID, Name: "Kaelen", Class: "warrior"}, rig.partyClock.now())
	require.NoError(t, err)
	require.Empty(t, created.Refusal)

	for range 10 {
		rig.tick()
		if update, got := partyUpdateWithin(kaelenInbox, chatSilence); got {
			assert.Equal(t, "sync", update.Payload["reason"])
			assert.Equal(t, created.Party.ID.String(), update.Payload["party_id"])
			return
		}
	}
	t.Fatal("Kaelen's party was never read after the first read failed")
}

// partyUpdateWithin is the first party_update the inbox gets within d, dropping anything else.
func partyUpdateWithin(inbox *startSoloInbox, d time.Duration) (types.Message, bool) {
	deadline := time.After(d)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == partyUpdateAction {
				return msg, true
			}
		case <-deadline:
			return types.Message{}, false
		}
	}
}

// failingWithdrawals is the party store with every withdrawal failing.
type failingWithdrawals struct{ *partystore.Redis }

func (failingWithdrawals) Withdraw(context.Context, uuid.UUID, bool, time.Time) (bool, error) {
	return false, errors.New("redis blip")
}

// An undelivered first invite that Redis could not withdraw leaves its party standing in Redis:
// the leader is told delivery_failed and given the party as it stands, and the cache keeps it, so
// a create is refused already_in_party rather than meeting a party the pod forgot (D6; code
// review 2026-11-01).
func TestPartyInvite_UndeliveredAndNotWithdrawn_PartyKept(t *testing.T) {
	rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
		return []Option{WithPartyStore(failingWithdrawals{partystore.NewRedis(client)})}
	})
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	rig.stalled(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})

	failed := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "delivery_failed", failed.Payload["code"])
	formed := awaitUpdate(t, wrenInbox, "joined", wren.ID, "Wren")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, formed))

	sendParty(rig.server, wrenConn, partyCreateAction, map[string]interface{}{})
	refused := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "already_in_party", refused.Payload["code"])
}
