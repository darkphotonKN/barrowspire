package gameserver

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The Spire is entered only with gear that can be read: a member whose loadout
// items-service cannot answer for is refused at the door, with the reason a
// field entry gives, and is never queued or put in a run. Fail closed: a run
// built on unread gear would settle the stored loadout as empty.
//
// The read runs off the message hub's loop, so a slow items-service holds up
// only the member asking.

// atSpireGate seats a fresh member in rig's hub at the Spire's door, once the
// hub's tick has measured them there, and listens on their connection.
func (r *fieldRig) atSpireGate(t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	player, conn, inbox := r.inHubAt(t, name, &websocket.Conn{}, 1000, 50)
	require.Eventually(t, func() bool {
		return r.hub.AtGate(player.ID, components.GateDestinationSpire)
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured them at the Spire's door")

	return player, conn, inbox
}

func TestFindGame_UnreadableGear_IsRefused(t *testing.T) {
	rig := newFieldRig(t, &failingLoadoutItems{})
	wren, conn, inbox := rig.atSpireGate(t, "Wren")

	send(rig.server, conn, constants.ActionFindGame)

	assertRefused(t, inbox, constants.ActionFindGame, "loadout_unavailable")
	assert.Zero(t, rig.queue.joinCalls(), "the queue was asked to take them")
	assert.False(t, rig.queue.holds(wren), "they were queued")
	assert.True(t, rig.hub.HasPlayer(wren.ID), "still standing in the hub")
}

func TestStartSolo_UnreadableGear_IsRefused(t *testing.T) {
	rig := newFieldRig(t, &failingLoadoutItems{})
	wren, conn, inbox := rig.atSpireGate(t, "Wren")
	worldsBefore := startSoloSessionCount(rig.server)

	startSoloSend(rig.server, conn)

	assertRefused(t, inbox, startSoloAction, "loadout_unavailable")
	assert.Equal(t, worldsBefore, startSoloSessionCount(rig.server), "a run was built")
	assert.True(t, rig.hub.HasPlayer(wren.ID), "still standing in the hub")
	assert.Equal(t, rig.hub.ID, startSoloWorldOnRecord(t, rig.server, wren.ID), "the record still names the hub")
}

// While one member's gear read stalls, the hub keeps answering everyone else;
// once it returns, the member descends as before.
func TestStartSolo_AStalledGearReadDoesNotHoldTheHub(t *testing.T) {
	items := &armedStallingItems{stallingItems: stallingItems{started: make(chan struct{}, 1), release: make(chan struct{})}}
	rig := newFieldRig(t, items)
	wren, wrenConn, wrenInbox := rig.atSpireGate(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHubAt(t, "Kaelen", &websocket.Conn{}, constants.HubSpawnX, constants.HubSpawnY)

	items.armed.Store(true)
	startSoloSend(rig.server, wrenConn)
	select {
	case <-items.started:
	case <-time.After(startSoloSettle):
		t.Fatal("the gear read never started")
	}

	// Kaelen, away from the door, is answered while Wren's read is held
	send(rig.server, kaelenConn, constants.ActionFindGame)
	reply, answered := kaelenInbox.await(string(constants.ActionFindGame))
	require.True(t, answered, "the hub answered nobody while a gear read stalled")
	require.NotNil(t, reply.Error)
	assert.Equal(t, spireGateRefusalCopy, *reply.Error)

	close(items.release)
	run := startSoloAwaitRun(t, rig.server, wrenInbox)
	assert.Equal(t, run.ID, startSoloWorldOnRecord(t, rig.server, wren.ID), "the record names the run")
}
