package gameserver

import (
	"context"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-18Z5F §C R13–R18. I-18Z5F-3.

// A field entry checks the gear out under the visit id it then opens the
// visit with, the id the visit settles under. R13, R14.
func TestEnterField_ChecksOutUnderTheVisitID(t *testing.T) {
	items := &loadoutAuthRecorder{}
	rig := newFieldRig(t, items)
	serverSide, _ := wsPair(t)
	wren, _, inbox := rig.inHubAt(t, "Wren", serverSide, 1960, 360)

	rig.enterMeadows(t, wren, serverSide, inbox)
	rig.server.handleReadError(serverSide, &websocket.CloseError{Code: websocket.CloseAbnormalClosure})

	settled := rig.settle.settled()
	require.Len(t, settled, 1)
	assert.Equal(t, []string{settled[0].ID.String()}, items.checkoutRunIDs(), "checked out once, under the visit's id")
}

// The pre-check before queueing or a solo run reads the loadout and checks
// nothing out. R13.
func TestCheckLoadout_ReadsAndChecksNothingOut(t *testing.T) {
	items := &loadoutAuthRecorder{}
	server := newTestServer(t, context.Background(), &MockAuthClient{}, NewMockQueueService(), &MockEventEmitter{}, items, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})

	require.NoError(t, server.CheckLoadout(context.Background(), &types.Player{ID: uuid.New()}))

	assert.Equal(t, 1, items.readCount())
	assert.Empty(t, items.checkoutRunIDs())
}

// A reconnect keeps the body the member has: reconnecting into a run or a
// field makes no checkout call. R18.
func TestReconnect_IntoARunOrField_ChecksNothingOut(t *testing.T) {
	tests := []struct {
		name string
		// seat puts the member's record in a world and returns that world
		seat func(t *testing.T, server *Server, record *types.Player) *game.Session
	}{
		{
			name: "run",
			seat: func(t *testing.T, server *Server, record *types.Player) *game.Session {
				return server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{record}})
			},
		},
		{
			name: "field",
			seat: func(t *testing.T, server *Server, record *types.Player) *game.Session {
				meadows, ok := server.FieldSession(game.FieldGentleMeadows)
				require.True(t, ok)
				gear, err := server.setupHandoffConnectingPlayer(context.Background(), record.ID, uuid.New(), "")
				require.NoError(t, err)
				_, err = meadows.SeatVisitor(record.ID, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: "Wren"}, uuid.New(), gear)
				require.NoError(t, err)
				server.setCurrentWorld(record, meadows.ID)
				return meadows
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			authClient := &oneMemberAuth{memberID: uuid.New()}
			items := &loadoutAuthRecorder{}
			server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, items, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
			route := newConnectRoute(t, server, authClient)

			route.connect(t, "token")
			record, ok := server.PlayerByID(authClient.memberID)
			require.True(t, ok)
			world := tt.seat(t, server, record)
			require.True(t, world.HasPlayer(authClient.memberID))
			checkedOut := len(items.checkoutRunIDs())
			require.Equal(t, 1, checkedOut, "seating checked out once")

			route.connect(t, "token")

			assert.Len(t, items.checkoutRunIDs(), checkedOut, "the reconnect checked nothing out")
			assert.True(t, world.HasPlayer(authClient.memberID), "and keeps the body they have")
			route.assertNoPanics(t)
		})
	}
}

// gatedCheckoutItems is items-service holding every checkout until released,
// recording each as it arrives.
type gatedCheckoutItems struct {
	loadoutAuthRecorder
	release chan struct{}
}

func (g *gatedCheckoutItems) CheckOutRunGear(ctx context.Context, req *itemspb.CheckOutRunGearRequest) (*itemspb.CheckOutRunGearResponse, error) {
	gear, err := g.loadoutAuthRecorder.CheckOutRunGear(ctx, req)
	select {
	case <-g.release:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return gear, err
}

// A second enter_field while the first is still checking out is refused with
// no checkout of its own: a second checkout would reclaim the first visit's
// live gear under a visit that never opens. Once the first has walked them in,
// they are no longer in the hub, and an enter is refused the same way.
// FS-18Z5F §C R13, R14; ADR-0032.
func TestEnterField_TwiceAtOnce_ChecksOutOnce(t *testing.T) {
	items := &gatedCheckoutItems{release: make(chan struct{})}
	rig := newFieldRig(t, items)
	wren, conn, _ := rig.atMeadowsGate(t, "Wren")
	rig.awaitAtMeadowsGate(t, wren)

	enter := func() <-chan error {
		done := make(chan error, 1)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), settle)
			defer cancel()
			_, err := rig.server.EnterField(ctx, conn, meadowsField)
			done <- err
		}()
		return done
	}

	first := enter()
	require.Eventually(t, func() bool { return len(items.checkoutRunIDs()) == 1 },
		settle, 5*time.Millisecond, "the first entry never reached its checkout")

	second := enter()
	var secondErr error
	select {
	case secondErr = <-second:
	case <-time.After(300 * time.Millisecond):
	}
	close(items.release)
	if secondErr == nil {
		secondErr = <-second
	}

	require.NoError(t, <-first, "the first entry walks them in")
	assert.ErrorIs(t, secondErr, errEnterFieldNotInHub, "the second is refused as a stale enter")
	assert.Len(t, items.checkoutRunIDs(), 1, "and checks nothing out")
	assert.True(t, rig.meadows.HasPlayer(wren.ID), "the first visit keeps its body")

	_, err := rig.server.EnterField(context.Background(), conn, meadowsField)
	assert.ErrorIs(t, err, errEnterFieldNotInHub, "an enter from the field is refused")
	assert.Len(t, items.checkoutRunIDs(), 1, "with no checkout")
}

// A handoff connection the run has no seat for is refused before any checkout:
// a stale or expired handoff must not re-tag the member's live gear into a run
// that then turns them away. FS-18Z5F §C R13; FS-K2HKP R24.
func TestHandoffConnect_NoSeat_ChecksNothingOut(t *testing.T) {
	tests := []struct {
		name string
		run  func(t *testing.T, server *Server, memberID uuid.UUID) *game.Session
	}{
		{
			name: "member not expected",
			run: func(_ *testing.T, server *Server, _ uuid.UUID) *game.Session {
				return runExpecting(server, uuid.New())
			},
		},
		{
			// a body here but no record of this pod naming the run: nothing to
			// reconnect to
			name: "seated, but not on record in the run",
			run: func(t *testing.T, server *Server, memberID uuid.UUID) *game.Session {
				run := runExpecting(server, memberID)
				_, err := run.SeatArrival(&types.Player{ID: memberID}, nil)
				require.NoError(t, err)
				return run
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			authClient := &oneMemberAuth{memberID: uuid.New()}
			items := &loadoutAuthRecorder{}
			server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, items, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
			route := newConnectRoute(t, server, authClient)
			run := tt.run(t, server, authClient.memberID)

			conn := route.dialHandoff(t, "token", run.ID.String())

			assert.Equal(t, auth.CloseCodeHandoffRefused, closeCodeOf(t, conn))
			route.awaitHandled(t)
			assert.Empty(t, items.checkoutRunIDs(), "refused with nothing checked out")
			route.assertNoPanics(t)
		})
	}
}

// A handoff connection from a member already seated in the run, whose record
// here names it, is a reconnect: they keep the body they have and nothing is
// checked out. FS-18Z5F §C R18.
func TestHandoffConnect_AlreadySeated_ReconnectsWithNoCheckout(t *testing.T) {
	authClient := &oneMemberAuth{memberID: uuid.New()}
	items := &loadoutAuthRecorder{}
	server := newTestServer(t, context.Background(), authClient, NewMockQueueService(), &MockEventEmitter{}, items, newFakeCharacters(), testPodID, testPodAddr, noopAnnouncer{})
	route := newConnectRoute(t, server, authClient)

	route.connect(t, "token")
	run := runExpecting(server, authClient.memberID)
	_, err := run.SeatArrival(&types.Player{ID: authClient.memberID}, nil)
	require.NoError(t, err)
	record, ok := server.PlayerByID(authClient.memberID)
	require.True(t, ok)
	server.setCurrentWorld(record, run.ID)

	conn := route.dialHandoff(t, "token", run.ID.String())
	route.awaitHandled(t)

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(settle)))
	var reconnected, announced types.Message
	require.NoError(t, conn.ReadJSON(&reconnected), "served, not closed")
	assert.Equal(t, "reconnected", reconnected.Action)
	require.NoError(t, conn.ReadJSON(&announced))
	assert.Equal(t, string(constants.ActionWorldEntered), announced.Action)
	assert.Equal(t, run.ID.String(), announced.Payload["session_id"], "announced the run they are in")

	assert.Empty(t, items.checkoutRunIDs(), "nothing checked out")
	assert.True(t, run.HasPlayer(authClient.memberID), "and they keep the body they have")
	mapped, _ := connectionsOf(server, authClient.memberID)
	assert.Equal(t, 1, mapped, "on the new connection")
	route.assertNoPanics(t)
}
