package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	grpcitems "github.com/darkphotonKN/barrowspire-server/game-service/grpc/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BJNYC §Requirements R1; §Acceptance Criteria row 1; §User Stories 13, 24. I-BJNYC-1.
//
// A party enters together, so the queue is closed to a party member. find_game
// from a player the pod's party cache knows as a member is refused with the
// party's words, after the no-character refusal and the resume of a member
// already in a run, ahead of the Spire-gate check and the gear read. A player
// in no party queues exactly as before.

// partyEntersTogetherCopy is the refusal, word for word. FS-BJNYC R1.
const partyEntersTogetherCopy = "Your party enters together."

// The Spire's door, where a player is seated to stand at it without the walk,
// and a spot in the hub well away from it.
const (
	spireGateX, spireGateY = 1000.0, 50.0
	awayFromGateX          = 600.0
	awayFromGateY          = 600.0
)

// partyEntryRig is a party rig whose items-service and queue the test picks:
// gear that cannot be read proves a refusal came before the gear read, and the
// counting queue proves nobody was asked to be queued.
type partyEntryRig struct {
	*partyRig
	joins *startSoloQueue
}

func newPartyEntryRig(t *testing.T, itemsClient grpcitems.ItemsClient, opts ...Option) *partyEntryRig {
	t.Helper()

	client, mini := testutil.NewRedis(t)
	characters := newFakeCharacters()
	partyClock := newChatClock()
	ticks := make(chan time.Time)
	queue := newStartSoloQueue()
	var server *Server
	t.Cleanup(func() { stopWorlds(server) })
	ctx, shutdown := context.WithCancel(context.Background())
	t.Cleanup(shutdown)
	server = newTestServer(t, ctx, &MockAuthClient{}, queue, &MockEventEmitter{}, itemsClient, characters, testPodID, testPodAddr, noopAnnouncer{},
		append([]Option{WithPartyStore(partystore.NewRedis(client)), WithPartyClock(partyClock.now), withPartyTicks(ticks)}, opts...)...,
	)
	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")
	meadows, ok := server.FieldSession(game.FieldGentleMeadows)
	require.True(t, ok, "the server builds the Meadows at startup")

	return &partyEntryRig{
		partyRig: &partyRig{
			chatRig:    &chatRig{server: server, clock: newChatClock(), hub: hub, meadows: meadows, characters: characters},
			mini:       mini,
			client:     client,
			partyClock: partyClock,
			ticks:      ticks,
			queue:      queue.mockQueueService,
			shutdown:   shutdown,
			conns:      make(map[uuid.UUID]*websocket.Conn),
			inboxes:    make(map[uuid.UUID]*startSoloInbox),
		},
		joins: queue,
	}
}

// standing seats a member in the hub, at the Spire's door or away from it,
// once the hub's tick has measured where they stand.
func (r *partyEntryRig) standing(t *testing.T, name string, atGate bool) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	x, y := awayFromGateX, awayFromGateY
	if atGate {
		x, y = spireGateX, spireGateY
	}
	player, conn, inbox := r.seated(t, name, r.hub, x, y)
	require.Eventually(t, func() bool {
		return r.hub.AtGate(player.ID, components.GateDestinationSpire) == atGate
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured %s where they were seated", name)

	return player, conn, inbox
}

// awaitPartyRefusal waits for find_game's answer and requires it to be the
// party refusal, on the error and in the payload.
func awaitPartyRefusal(t *testing.T, inbox *startSoloInbox, who string) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionFindGame))
	require.True(t, answered, "%s's find_game was never answered", who)
	require.Equal(t, string(constants.ActionFindGame), reply.Action, "%s was refused on find_game itself, not with %q", who, reply.Action)
	require.NotNil(t, reply.Error, "%s's find_game was accepted", who)
	assert.Equal(t, partyEntersTogetherCopy, *reply.Error, "%s: got %q", who, *reply.Error)
	assert.Equal(t, partyEntersTogetherCopy, reply.Payload["message"], "the same words on the error and in the payload")
}

// A party member's find_game is refused with the party's words and never
// reaches the gear read or the queue: whichever member asks, the leader
// included, and a party of just the leader too. The gear here cannot be read,
// so a gear read ahead of the party check would refuse with
// loadout_unavailable instead. FS-BJNYC R1; AC row 1; User Story 13.
func TestFindGame_PartyMember_IsRefusedBeforeGearAndQueue(t *testing.T) {
	tests := []struct {
		name string
		// forms the party at the door and returns who asks to queue
		form func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox)
	}{
		{
			name: "a member of a party of two",
			form: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				_, leaderConn, leaderInbox := rig.standing(t, "Wren", true)
				kaelen, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", true)
				rig.partied(t, leaderConn, leaderInbox, "Kaelen", kaelenConn, kaelenInbox)
				return kaelen, kaelenConn, kaelenInbox
			},
		},
		{
			name: "the leader of a party of two",
			form: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				wren, leaderConn, leaderInbox := rig.standing(t, "Wren", true)
				_, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", true)
				rig.partied(t, leaderConn, leaderInbox, "Kaelen", kaelenConn, kaelenInbox)
				return wren, leaderConn, leaderInbox
			},
		},
		{
			name: "a party of just the leader",
			form: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				wren, conn, inbox := rig.standing(t, "Wren", true)
				sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
				awaitUpdate(t, inbox, "joined", wren.ID, "Wren")
				return wren, conn, inbox
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyEntryRig(t, &failingLoadoutItems{})
			asker, conn, inbox := tt.form(t, rig)

			send(rig.server, conn, constants.ActionFindGame)

			awaitPartyRefusal(t, inbox, asker.Character.Name)
			assert.Zero(t, rig.joins.joinCalls(), "the queue was asked to take them")
			assert.False(t, rig.joins.holds(asker), "they were queued")
			assert.True(t, rig.hub.HasPlayer(asker.ID), "still standing in the hub")
		})
	}
}

// The party check reads the pod's party cache on the hub's loop and asks Redis
// nothing: with every Redis command failing, a party member is still refused
// in the party's words. FS-BJNYC R1 ("no Redis call").
func TestFindGame_PartyMember_RefusedWithRedisDown(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, conn, inbox := rig.standing(t, "Wren", true)
	sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
	awaitUpdate(t, inbox, "joined", wren.ID, "Wren")

	rig.mini.SetError("redis down")
	t.Cleanup(func() { rig.mini.SetError("") })

	send(rig.server, conn, constants.ActionFindGame)

	awaitPartyRefusal(t, inbox, "Wren")
	assert.Zero(t, rig.joins.joinCalls(), "the queue was asked to take them")
}

// find_game's refusals come in order: no character, then the resume of a
// member already in a run, then the party, then the Spire's door. Each row
// meets every later guard too, so only the earliest can answer. A player in no
// party at the door is queued as before. FS-BJNYC R1; AC row 1; User Story 24.
func TestFindGame_PartyCheck_InGuardOrder(t *testing.T) {
	tests := []struct {
		name string
		// builds the asker and returns them; the rig's gear reads fine
		setup func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox)
		// the answer's action, and its error (empty: no error)
		wantAction string
		wantError  string
		wantQueued bool
	}{
		{
			name: "no character, in a party, away from the door: the no-character refusal",
			setup: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				conn := &websocket.Conn{}
				nobody := &types.Player{ID: uuid.New(), Username: "Nobody"}
				registerTestConn(rig.server, conn, nobody)
				_, err := rig.server.JoinHub(conn, types.CharacterInPlay{})
				require.NoError(t, err)
				inbox := startSoloListen(t, rig.server, conn)

				// the party is written straight to Redis and read on arrival
				// by the cache; with no character they are shown nothing, so
				// the cache's published membership says when it holds them
				partyID := uuid.New()
				created, err := partystore.NewRedis(rig.client).Create(context.Background(), partyID, partystore.Joiner{PlayerID: nobody.ID, Name: "Nobody", Class: "warrior"}, rig.partyClock.now())
				require.NoError(t, err)
				require.Empty(t, created.Refusal)
				rig.tick()
				require.Eventually(t, func() bool {
					return rig.server.partyMembership.Snapshot()[nobody.ID] == partyID
				}, startSoloSettle, 10*time.Millisecond, "the cache never read their party on arrival")
				return nobody, conn, inbox
			},
			wantAction: string(constants.ActionFindGame),
			wantError:  startSoloNoCharacterCopy,
		},
		{
			name: "in a party and already in a run: resumed",
			setup: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				_, leaderConn, leaderInbox := rig.standing(t, "Wren", false)
				kaelen, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", false)
				rig.partied(t, leaderConn, leaderInbox, "Kaelen", kaelenConn, kaelenInbox)
				rig.intoRun(t, kaelen)
				return kaelen, kaelenConn, kaelenInbox
			},
			wantAction: string(constants.ActionWorldEntered),
		},
		{
			name: "in a party, away from the door: the party refusal",
			setup: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				wren, conn, inbox := rig.standing(t, "Wren", false)
				sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
				awaitUpdate(t, inbox, "joined", wren.ID, "Wren")
				return wren, conn, inbox
			},
			wantAction: string(constants.ActionFindGame),
			wantError:  partyEntersTogetherCopy,
		},
		{
			name: "in no party, away from the door: the gate refusal",
			setup: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				return rig.standing(t, "Wren", false)
			},
			wantAction: string(constants.ActionFindGame),
			wantError:  spireGateRefusalCopy,
		},
		{
			name: "in no party, at the door: queued as before",
			setup: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				return rig.standing(t, "Wren", true)
			},
			wantAction: string(constants.ActionFindGame),
			wantQueued: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyEntryRig(t, &MockItemsClient{})
			asker, conn, inbox := tt.setup(t, rig)

			send(rig.server, conn, constants.ActionFindGame)

			reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionFindGame))
			require.True(t, answered, "find_game was never answered")
			require.Equal(t, tt.wantAction, reply.Action, "answered with %q, error %q", reply.Action, startSoloErrorOf(reply))
			if tt.wantError == "" {
				assert.Nil(t, reply.Error, "refused: %q", startSoloErrorOf(reply))
			} else {
				require.NotNil(t, reply.Error, "accepted")
				assert.Equal(t, tt.wantError, *reply.Error)
			}
			if tt.wantQueued {
				assert.Equal(t, 1, rig.joins.joinCalls(), "the queue was asked once")
				assert.True(t, rig.joins.holds(asker), "queued")
			} else {
				assert.Zero(t, rig.joins.joinCalls(), "the queue was asked to take them")
			}
		})
	}
}

// FS-BJNYC §Requirements R2; §Acceptance Criteria row 3; §User Stories 14, 16, 24. I-BJNYC-3.
//
// start_solo from a party member, a party of just the leader included, is
// refused with the party's words in find_game's place: after the no-character
// refusal and the resume, ahead of the Spire's door and the gear read. The gear
// here cannot be read, and the asker stands away from the door, so a later
// guard answering first would say something else.
func TestStartSolo_PartyMember_IsRefusedBeforeGateAndGear(t *testing.T) {
	tests := []struct {
		name string
		form func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox)
	}{
		{
			name: "a member of a party of two",
			form: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				_, leaderConn, leaderInbox := rig.standing(t, "Wren", false)
				kaelen, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", false)
				rig.partied(t, leaderConn, leaderInbox, "Kaelen", kaelenConn, kaelenInbox)
				return kaelen, kaelenConn, kaelenInbox
			},
		},
		{
			name: "a party of just the leader",
			form: func(t *testing.T, rig *partyEntryRig) (*types.Player, *websocket.Conn, *startSoloInbox) {
				wren, conn, inbox := rig.standing(t, "Wren", false)
				sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
				awaitUpdate(t, inbox, "joined", wren.ID, "Wren")
				return wren, conn, inbox
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyEntryRig(t, &failingLoadoutItems{})
			asker, conn, inbox := tt.form(t, rig)

			startSoloSend(rig.server, conn)

			startSoloAssertRefused(t, inbox, partyEntersTogetherCopy)
			assert.True(t, rig.hub.HasPlayer(asker.ID), "still standing in the hub")
		})
	}
}
