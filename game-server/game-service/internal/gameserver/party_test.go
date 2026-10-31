package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypointer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-R82NV §Requirements R1–R6, R8, R11–R17 (same pod), R21, R25. I-R82NV-1.
//
// A party is formed on the message hub's loop, like a chat line is relayed:
// the tests drive the hub as a client would, an action on the server channel
// routed on the sender's record, answered on each player's writer channel.

// The wire names, spelled out so a renamed constant cannot quietly move the
// contract the client reads.
const (
	partyInviteAction = "party_invite"
	partyNoticeAction = "party_notice"
)

// partyRig is a pod with its hub at hand, for players to form parties in. The
// registry reads a clock the test turns and sweeps only when the test ticks, so
// no test sleeps through an invite's minute.
type partyRig struct {
	*chatRig
	partyClock *chatClock
	ticks      chan time.Time
	queue      *mockQueueService
	// shutdown stops the pod as SIGTERM does: its context ends
	shutdown context.CancelFunc
	// players seated with inHubTracked, for table rows that pick one up again
	conns   map[uuid.UUID]*websocket.Conn
	inboxes map[uuid.UUID]*startSoloInbox
}

// newPartyRig builds the pod; opts add to the party clock and ticks, a party
// size for instance.
func newPartyRig(t *testing.T, opts ...Option) *partyRig {
	t.Helper()

	characters := newFakeCharacters()
	partyClock := newChatClock()
	ticks := make(chan time.Time)
	queue := NewMockQueueService()
	ctx, shutdown := context.WithCancel(context.Background())
	t.Cleanup(shutdown)
	server := newTestServer(t, ctx, &MockAuthClient{}, queue, &MockEventEmitter{}, &MockItemsClient{}, characters, testPodID, testPodAddr, noopAnnouncer{},
		append([]Option{WithPartyClock(partyClock.now), withPartyTicks(ticks)}, opts...)...,
	)
	hub, ok := server.HubSession()
	require.True(t, ok, "the server builds a hub at startup")
	meadows, ok := server.FieldSession(game.FieldGentleMeadows)
	require.True(t, ok, "the server builds the Meadows at startup")

	return &partyRig{
		chatRig:    &chatRig{server: server, clock: newChatClock(), hub: hub, meadows: meadows, characters: characters},
		partyClock: partyClock,
		ticks:      ticks,
		queue:      queue,
		shutdown:   shutdown,
		conns:      make(map[uuid.UUID]*websocket.Conn),
		inboxes:    make(map[uuid.UUID]*startSoloInbox),
	}
}

// inHubTracked is inHub, remembering the player's connection and inbox.
func (r *partyRig) inHubTracked(t *testing.T, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	player, conn, inbox := r.inHub(t, name)
	r.conns[player.ID] = conn
	r.inboxes[player.ID] = inbox
	return player, conn, inbox
}

// queued puts player in the Spire queue, alone, so no match pops.
func (r *partyRig) queued(t *testing.T, player *types.Player) {
	t.Helper()
	require.NoError(t, r.queue.PlayerJoinQueue(context.Background(), player))
}

// partied has leader invite member by name and member accept, and drains both
// inboxes of what that said.
func (r *partyRig) partied(t *testing.T, leaderConn *websocket.Conn, leaderInbox *startSoloInbox, memberName string, memberConn *websocket.Conn, memberInbox *startSoloInbox) {
	t.Helper()

	inviteID := r.invited(t, leaderConn, memberName, memberInbox)
	awaitParty(t, leaderInbox, partyNoticeAction, "the leader") // sent
	sendParty(r.server, memberConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	joined := awaitParty(t, memberInbox, partyUpdateAction, memberName)
	member := uuid.MustParse(joined.Payload["subject_id"].(string))
	awaitUpdateAbout(t, leaderInbox, member, "the leader")
}

// tick hands the registry one tick and returns once the hub's loop has taken it.
func (r *partyRig) tick() {
	r.ticks <- r.partyClock.now()
}

// sendParty sends a party action as the client does, routed on the sender's
// record: nothing in payload says who is asking (FS-R82NV Edge States "Unauthorized").
func sendParty(server *Server, conn *websocket.Conn, action string, payload map[string]interface{}) {
	server.serverChan <- types.ClientPackage{
		Conn:    conn,
		Message: types.Message{Action: action, Payload: payload},
	}
}

// awaitParty waits for one message of action on the inbox. Anything else the
// hub answers with, its "Unknown action" fallback included, is dropped, so a
// missing reply fails here rather than matching the wrong one.
func awaitParty(t *testing.T, inbox *startSoloInbox, action, who string) types.Message {
	t.Helper()

	reply, answered := inbox.await(action)
	require.True(t, answered, "%s never received %s", who, action)
	require.Nil(t, reply.Error, "a party message is not an error reply")

	return reply
}

// awaitUpdateAbout waits for the party_update about subject, dropping updates
// about anyone else (the leader's own, when the party formed).
func awaitUpdateAbout(t *testing.T, inbox *startSoloInbox, subject uuid.UUID, who string) types.Message {
	t.Helper()
	for {
		update := awaitParty(t, inbox, partyUpdateAction, who)
		if update.Payload["subject_id"] == subject.String() {
			return update
		}
	}
}

// A player with no party invites another seated in the same hub by name: the
// target is prompted with an invite naming the new party's leader, and the
// inviter is told it was sent. FS-R82NV R4, R12, R13.
func TestPartyInvite_SamePod_TargetPromptedInviterToldSent(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})

	invite := awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
	inviteID, _ := invite.Payload["invite_id"].(string)
	_, err := uuid.Parse(inviteID)
	assert.NoError(t, err, "the invite carries an id to answer it by")
	partyID, _ := invite.Payload["party_id"].(string)
	_, err = uuid.Parse(partyID)
	assert.NoError(t, err, "the first invite creates a party, minted here (R1, R4)")
	assert.Equal(t, "Wren", invite.Payload["leader_name"], "the inviter leads the new party (R4)")
	assert.EqualValues(t, 1, invite.Payload["member_count"], "a party of one: the leader alone")
	assert.Equal(t, testPodAddr, invite.Payload["party_pod_addr"], "the party lives on the pod that created it (R2)")

	sent := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "sent", sent.Payload["code"])
	assert.Equal(t, "Kaelen", sent.Payload["name"], "the notice names whom it was sent to (R13)")
}

const (
	partyAcceptAction = "party_accept"
	partyUpdateAction = "party_update"
)

// invited has inviter invite target by name and returns the invite id the
// target was prompted with.
func (r *partyRig) invited(t *testing.T, inviterConn *websocket.Conn, targetName string, targetInbox *startSoloInbox) string {
	t.Helper()

	sendParty(r.server, inviterConn, partyInviteAction, map[string]interface{}{"name": targetName})
	invite := awaitParty(t, targetInbox, partyInviteAction, targetName)
	inviteID, _ := invite.Payload["invite_id"].(string)
	require.NotEmpty(t, inviteID)

	return inviteID
}

// Accepting on the party pod itself adds the member at once, with no handoff:
// both members get the party as it now stands, leader marked, in join order.
// FS-R82NV R16 (same pod), R17, R21.
func TestPartyAccept_SamePod_BothGetUpdateWithTwoMembers(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})

	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox} {
		update := awaitUpdateAbout(t, inbox, kaelen.ID, who)
		assert.Equal(t, wren.ID.String(), update.Payload["leader_id"], "%s: the inviter leads", who)
		assert.EqualValues(t, 2, update.Payload["size"], "%s", who)
		assert.Equal(t, "joined", update.Payload["reason"], "%s", who)
		assert.Equal(t, kaelen.ID.String(), update.Payload["subject_id"], "%s: the update is about who joined", who)

		members, _ := update.Payload["members"].([]map[string]interface{})
		require.Len(t, members, 2, "%s", who)
		for i, want := range []*types.Player{wren, kaelen} {
			assert.Equal(t, want.ID.String(), members[i]["player_id"], "%s: members in join order", who)
			assert.Equal(t, want.Character.Name, members[i]["name"], "%s", who)
			assert.Equal(t, want.Character.Class, members[i]["class"], "%s", who)
			assert.Equal(t, "hub", members[i]["where"], "%s: every member stands in the hub for now", who)
			assert.Equal(t, true, members[i]["online"], "%s", who)
			assert.NotEmpty(t, members[i]["joined_at"], "%s", who)
		}
	}
	assertNoWorldHandoff(t, kaelenInbox)
}

// assertNoWorldHandoff fails if a world_handoff reaches the inbox within chatSilence.
func assertNoWorldHandoff(t *testing.T, inbox *startSoloInbox) {
	t.Helper()
	assertNoParty(t, inbox, "world_handoff", "a same-pod accepter")
}

const partyDeclineAction = "party_decline"

// Declining tells the inviter, by name, and spends the invite: accepting it
// afterwards does nothing. FS-R82NV R15; Edge States "Two accepts of the same invite".
func TestPartyDecline_SamePod_InviterToldDeclinedInviteSpent(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	sendParty(rig.server, kaelenConn, partyDeclineAction, map[string]interface{}{"invite_id": inviteID})

	declined := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "declined", declined.Payload["code"])
	assert.Equal(t, "Kaelen", declined.Payload["name"])

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen")
}

// assertNoParty fails if a message of action reaches the inbox within chatSilence.
func assertNoParty(t *testing.T, inbox *startSoloInbox, action, who string) {
	t.Helper()

	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == action {
				t.Fatalf("%s should get no %s; got %v", who, action, msg.Payload)
			}
		case <-deadline:
			return
		}
	}
}

// An invite nobody answers expires after a minute: the inviter is told, by
// name, and the invite can no longer be accepted. The prompt says when.
// FS-R82NV R13, R14.
func TestPartyInvite_Unanswered_ExpiresAtSixtySeconds(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})
	invite := awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
	assert.Equal(t, "2026-10-31T09:31:15Z", invite.Payload["expires_at"], "sent at 09:30:15, open for sixty seconds")
	inviteID, _ := invite.Payload["invite_id"].(string)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	rig.partyClock.advance(59 * time.Second)
	rig.tick()
	assertNoParty(t, wrenInbox, partyNoticeAction, "Wren, a second early")

	rig.partyClock.advance(time.Second)
	rig.tick()
	expired := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "expired", expired.Payload["code"])
	assert.Equal(t, "Kaelen", expired.Payload["name"])

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen, accepting an expired invite")
}

// Every refusal an invite can meet, each a party_notice by code, in order: the
// sender's own standing first (in the hub, the leader, not queued), then R12's
// list. Rows that would meet two refusals prove the earlier one wins. Nothing
// reaches the named target. FS-R82NV R11, R12, R16; Edge States "Invitee is in
// a field or run", "Invitee is queued".
func TestPartyInvite_Refusals_InOrder(t *testing.T) {
	tests := []struct {
		name string
		opts []Option
		// arrange seats whoever the row needs and returns the inviter's
		// connection and inbox, and the name the inviter will send
		arrange  func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string)
		wantCode string
		// the name the notice carries for the client's copy (R36); "" for none
		wantName string
	}{
		{
			name: "not in the hub: inviter in a field",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := r.inMeadows(t, "Wren")
				r.inHub(t, "Kaelen")
				return conn, inbox, "Kaelen"
			},
			wantCode: "not_in_hub",
		},
		{
			name: "not the leader, ahead of a full party",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, wrenConn, wrenInbox := r.inHub(t, "Wren")
				_, kaelenConn, kaelenInbox := r.inHub(t, "Kaelen")
				r.inHub(t, "Idris")
				r.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
				return kaelenConn, kaelenInbox, "Idris"
			},
			wantCode: "not_leader",
		},
		{
			name: "inviter queued for the Spire",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				wren, conn, inbox := r.inHub(t, "Wren")
				r.inHub(t, "Kaelen")
				r.queued(t, wren)
				return conn, inbox, "Kaelen"
			},
			wantCode: "queued",
		},
		{
			name: "party full counting a pending invite, ahead of naming yourself",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := r.inHub(t, "Wren")
				_, _, kaelenInbox := r.inHub(t, "Kaelen")
				r.invited(t, conn, "Kaelen", kaelenInbox)
				awaitParty(t, inbox, partyNoticeAction, "Wren") // sent
				return conn, inbox, "Wren"
			},
			wantCode: "party_full",
		},
		{
			name: "naming yourself",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := r.inHub(t, "Wren")
				return conn, inbox, "Wren"
			},
			wantCode: "self",
		},
		{
			name: "naming yourself by player id",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				wren, conn, inbox := r.inHub(t, "Wren")
				return conn, inbox, wren.ID.String()
			},
			wantCode: "self",
		},
		{
			name: "no such name",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := r.inHub(t, "Wren")
				return conn, inbox, " Nobody "
			},
			wantCode: "not_found",
			wantName: "Nobody",
		},
		{
			name: "target busy in a field",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := r.inHub(t, "Wren")
				r.inMeadows(t, "Kaelen")
				return conn, inbox, "Kaelen"
			},
			wantCode: "not_found",
			wantName: "Kaelen",
		},
		{
			name: "target already in a party",
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := r.inHub(t, "Wren")
				_, idrisConn, idrisInbox := r.inHub(t, "Idris")
				_, kaelenConn, kaelenInbox := r.inHub(t, "Kaelen")
				r.partied(t, idrisConn, idrisInbox, "Kaelen", kaelenConn, kaelenInbox)
				return conn, inbox, "kaelen"
			},
			wantCode: "already_in_party",
			wantName: "Kaelen",
		},
		{
			// at size 2 a pending invite fills the party, so pending needs room
			name: "an invite to them is still open",
			opts: []Option{WithPartySize(3)},
			arrange: func(t *testing.T, r *partyRig) (*websocket.Conn, *startSoloInbox, string) {
				_, conn, inbox := r.inHub(t, "Wren")
				_, _, kaelenInbox := r.inHub(t, "Kaelen")
				r.invited(t, conn, "Kaelen", kaelenInbox)
				awaitParty(t, inbox, partyNoticeAction, "Wren") // sent
				return conn, inbox, "Kaelen"
			},
			wantCode: "pending",
			wantName: "Kaelen",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRig(t, tt.opts...)
			conn, inbox, name := tt.arrange(t, rig)

			sendParty(rig.server, conn, partyInviteAction, map[string]interface{}{"name": name})

			refused := awaitParty(t, inbox, partyNoticeAction, "the inviter")
			assert.Equal(t, tt.wantCode, refused.Payload["code"])
			if tt.wantName == "" {
				assert.NotContains(t, refused.Payload, "name", "a refusal about the inviter names nobody")
			} else {
				assert.Equal(t, tt.wantName, refused.Payload["name"],
					"a refusal about the target names them: as typed when nobody has that name, as their character otherwise")
			}
		})
	}
}

// An accept is refused when the accepter could not join now: out of the hub,
// queued for the Spire (a move would strand their queue entry), or already in
// a party. The invite stays open for when they can. FS-R82NV R16; Edge States
// "Invitee is queued for the Spire".
func TestPartyAccept_Refusals(t *testing.T) {
	tests := []struct {
		name string
		// arrange turns Kaelen, holding Wren's invite, into someone who cannot join
		arrange  func(t *testing.T, r *partyRig, kaelen *types.Player, kaelenConn *websocket.Conn, kaelenInbox *startSoloInbox)
		wantCode string
	}{
		{
			name: "accepter walked into a field",
			arrange: func(t *testing.T, r *partyRig, kaelen *types.Player, _ *websocket.Conn, _ *startSoloInbox) {
				r.hub.RemovePlayer(kaelen.ID.String())
				r.meadows.AddPlayerAt(kaelen.ID, kaelen.Character, "", 200, 200)
				r.server.setCurrentWorld(kaelen, r.meadows.ID)
			},
			wantCode: "not_in_hub",
		},
		{
			name: "accepter queued for the Spire",
			arrange: func(t *testing.T, r *partyRig, kaelen *types.Player, _ *websocket.Conn, _ *startSoloInbox) {
				r.queued(t, kaelen)
			},
			wantCode: "queued",
		},
		{
			// joining another party would void the invite instead (R17); leading
			// one's own is how an open invite meets a grouped accepter
			name: "accepter leads a party of their own meanwhile",
			arrange: func(t *testing.T, r *partyRig, _ *types.Player, kaelenConn *websocket.Conn, kaelenInbox *startSoloInbox) {
				_, _, idrisInbox := r.inHub(t, "Idris")
				r.invited(t, kaelenConn, "Idris", idrisInbox)
				awaitParty(t, kaelenInbox, partyNoticeAction, "Kaelen") // sent
			},
			wantCode: "already_in_party",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRig(t)
			_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
			kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
			inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
			awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

			tt.arrange(t, rig, kaelen, kaelenConn, kaelenInbox)
			sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})

			refused := awaitParty(t, kaelenInbox, partyNoticeAction, "Kaelen")
			assert.Equal(t, tt.wantCode, refused.Payload["code"])
			assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody joined")
		})
	}
}

// Two parties invite one player; the first accept wins, and the accept voids
// the other invite, so accepting it later does nothing and its inviter's
// place is freed. FS-R82NV R14, R17; Edge States "Concurrent".
func TestPartyAccept_VoidsTheAcceptersOtherInvites(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, _, oriInbox := rig.inHub(t, "Ori")
	fromWren := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	fromIdris := rig.invited(t, idrisConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren")   // sent
	awaitParty(t, idrisInbox, partyNoticeAction, "Idris") // sent

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": fromWren})
	awaitParty(t, kaelenInbox, partyUpdateAction, "Kaelen")
	voided := awaitParty(t, idrisInbox, partyNoticeAction, "Idris")
	assert.Equal(t, "already_in_party", voided.Payload["code"], "Idris learns why the invite is gone (user story 7)")
	assert.Equal(t, "Kaelen", voided.Payload["name"])

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": fromIdris})
	assertNoParty(t, idrisInbox, partyUpdateAction, "Idris: Kaelen joined Wren instead")

	// Idris's party of one has room again: the voided invite no longer holds a place
	rig.invited(t, idrisConn, "Ori", oriInbox)
}

// A name is found whatever its case and surrounding spaces, and so is naming
// yourself. FS-R82NV R12; Edge States "Name with different case or trailing spaces".
func TestPartyInvite_NameIgnoresCaseAndSpaces(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "  wREN "})
	self := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "self", self.Payload["code"])

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": " kAELEN  "})
	awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
}

// newPointedPartyRig is a party rig whose pointers land on a miniredis.
func newPointedPartyRig(t *testing.T) (*partyRig, *miniredis.Miniredis) {
	t.Helper()
	client, mini := testutil.NewRedis(t)
	return newPartyRig(t, WithPartyPointers(partypointer.NewRedis(client))), mini
}

// pointerWait bounds how long a test waits for the pointer writer, which runs
// off the hub's loop.
const pointerWait = 2 * time.Second

// awaitPointer waits until key holds want with the full TTL.
func awaitPointer(t *testing.T, mini *miniredis.Miniredis, key, want string) {
	t.Helper()
	require.Eventually(t, func() bool {
		got, err := mini.Get(key)
		return err == nil && got == want && mini.TTL(key) == partypointer.TTL
	}, pointerWait, 10*time.Millisecond, "%s should point at %s with the full TTL", key, want)
}

// A party's pointers appear as it forms: the party to this pod, each member to
// the party, each for 30 s. FS-R82NV R3; I-R82NV-1 AC "Both Redis pointers
// appear on join with a TTL".
func TestPartyPointers_WrittenAsThePartyForms(t *testing.T) {
	rig, mini := newPointedPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")

	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	update := awaitParty(t, wrenInbox, partyUpdateAction, "Wren")
	partyID, _ := update.Payload["party_id"].(string)

	awaitPointer(t, mini, "party:"+partyID, testPodID)
	awaitPointer(t, mini, "player:"+wren.ID.String()+":party", partyID)
	awaitPointer(t, mini, "player:"+kaelen.ID.String()+":party", partyID)
}

// Every ten seconds the pod writes its parties' pointers again, so they never
// lapse while it lives. FS-R82NV R3.
func TestPartyPointers_RefreshedEveryTenSeconds(t *testing.T) {
	rig, mini := newPointedPartyRig(t)
	wren, wrenConn, _ := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")
	invite := func() string {
		sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})
		msg := awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
		partyID, _ := msg.Payload["party_id"].(string)
		return partyID
	}
	partyID := invite()
	leaderKey := "player:" + wren.ID.String() + ":party"
	awaitPointer(t, mini, leaderKey, partyID)

	mini.FastForward(20 * time.Second)
	rig.partyClock.advance(9 * time.Second)
	rig.tick()
	assert.Never(t, func() bool { return mini.TTL(leaderKey) == partypointer.TTL }, 200*time.Millisecond, 10*time.Millisecond,
		"nine seconds on, nothing is refreshed yet")

	rig.partyClock.advance(time.Second)
	rig.tick()
	awaitPointer(t, mini, leaderKey, partyID)
	awaitPointer(t, mini, "party:"+partyID, testPodID)
}

// A pod shutting down gracefully dissolves every party on it: each member gets
// a final party_update with reason dissolved, open invites go with the party,
// and every pointer is deleted before the pod reports it has stopped.
// FS-R82NV R5; Edge States "Pod graceful shutdown"; I-R82NV-1 AC "vanish when
// the party ends".
func TestPartyShutdown_DissolvesEveryPartyAndForgetsItsPointers(t *testing.T) {
	rig, mini := newPointedPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	keys := []string{"player:" + wren.ID.String() + ":party", "player:" + kaelen.ID.String() + ":party"}
	for _, key := range keys {
		require.Eventually(t, func() bool { return mini.Exists(key) }, pointerWait, 10*time.Millisecond)
	}
	partyID, err := mini.Get(keys[0])
	require.NoError(t, err)
	keys = append(keys, "party:"+partyID)

	rig.shutdown()

	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox} {
		final := awaitParty(t, inbox, partyUpdateAction, who)
		assert.Equal(t, "dissolved", final.Payload["reason"], "%s", who)
		assert.Equal(t, partyID, final.Payload["party_id"], "%s", who)
		assert.Empty(t, final.Payload["members"], "%s: nobody is left in it", who)
	}
	select {
	case <-rig.server.PartiesDissolved():
	case <-time.After(pointerWait):
		t.Fatal("the pod never reported its parties dissolved")
	}
	for _, key := range keys {
		assert.False(t, mini.Exists(key), "%s is deleted before the pod reports it stopped", key)
	}
}

// An invite answers only to its own target: anyone else sending its id, to
// accept or to decline, is ignored, and the invite stays open for its target.
// FS-R82NV Edge States "Unauthorized".
func TestPartyInvite_AnsweredOnlyByItsTarget(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	sendParty(rig.server, idrisConn, partyDeclineAction, map[string]interface{}{"invite_id": inviteID})
	sendParty(rig.server, idrisConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	assertNoParty(t, wrenInbox, partyNoticeAction, "Wren: Idris cannot decline for Kaelen")
	assertNoParty(t, idrisInbox, partyUpdateAction, "Idris: not their invite")

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	awaitParty(t, kaelenInbox, partyUpdateAction, "Kaelen, the target, still can")
}

// The first invite makes the inviter the leader of a party of one, and they are
// told so at once, like any other change, so their client shows a party before
// anyone answers. Both the prompt and the update carry the party's cap as size,
// for the client's "(<n>/<size>)". FS-R82NV R4, R13, R21, R32; I-R82NV-1 notes.
func TestPartyInvite_FirstInviteTellsTheNewLeader(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})
	invite := awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
	assert.EqualValues(t, 1, invite.Payload["member_count"])
	assert.EqualValues(t, 3, invite.Payload["size"], "the prompt shows the cap: (1/3)")

	formed := awaitParty(t, wrenInbox, partyUpdateAction, "Wren")
	assert.EqualValues(t, 3, formed.Payload["size"], "size is the cap, not the count; the count is len(members)")
	assert.Equal(t, wren.ID.String(), formed.Payload["leader_id"])
	assert.Equal(t, "joined", formed.Payload["reason"])
	assert.Equal(t, wren.ID.String(), formed.Payload["subject_id"], "the update is about the leader joining their own party")
	members, _ := formed.Payload["members"].([]map[string]interface{})
	require.Len(t, members, 1)
	assert.Equal(t, wren.ID.String(), members[0]["player_id"])
}

// stalled seats a member in the hub whose writer queue is full and never
// drained: anything sent to them now is refused, as for a client that stopped
// reading.
func (r *partyRig) stalled(t *testing.T, name string) *types.Player {
	t.Helper()

	conn := &websocket.Conn{}
	player := &types.Player{ID: uuid.New(), Username: name + "-account"}
	player.Character = r.characters.give(player.ID, "warrior", name, 3, 900)
	writer := registerTestConn(r.server, conn, player)
	for len(writer) < cap(writer) {
		writer <- types.Message{Action: "filler"}
	}
	r.hub.AddPlayerAt(player.ID, player.Character, "", 600, 600)
	r.server.setCurrentWorld(player, r.hub.ID)

	return player
}

// An invite that cannot reach its target is not kept: the inviter is told it
// was not delivered, no party is formed for it, and it holds no place, so the
// next invite goes out at once. FS-R82NV R10 (its notice, on this pod).
func TestPartyInvite_UndeliveredIsNotKept(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	rig.stalled(t, "Kaelen")
	_, _, idrisInbox := rig.inHub(t, "Idris")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})

	failed := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "delivery_failed", failed.Payload["code"])
	assert.Equal(t, "Kaelen", failed.Payload["name"])
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: no party formed for an invite nobody saw")

	// at size 2 a kept invite would fill the party; this one goes out
	rig.invited(t, wrenConn, "Idris", idrisInbox)
}

// Dissolving the parties at shutdown does not stop the hub: it keeps routing
// for the rest of the drain, so runs still in play keep moving and readers
// never block on it. Party actions from then on are ignored: the pod is going,
// and a party formed now would end with it. FS-R82NV R5; code review 2026-11-01.
func TestPartyShutdown_HubKeepsRoutingPartiesClosed(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	rig.shutdown()
	select {
	case <-rig.server.PartiesDissolved():
	case <-time.After(pointerWait):
		t.Fatal("the pod never reported its parties dissolved")
	}

	sendChat(rig.server, wrenConn, "area", "still here")
	awaitChat(t, kaelenInbox, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})
	assertNoParty(t, kaelenInbox, partyInviteAction, "Kaelen, invited by a closing pod")
	assertNoParty(t, wrenInbox, partyNoticeAction, "Wren, on a closing pod")
}

const (
	partyLeaveAction    = "party_leave"
	partyKickAction     = "party_kick"
	partyTransferAction = "party_transfer"
)

// awaitUpdate waits for the party_update with reason about subject, dropping
// any other update on the way.
func awaitUpdate(t *testing.T, inbox *startSoloInbox, reason string, subject uuid.UUID, who string) types.Message {
	t.Helper()
	for {
		update := awaitParty(t, inbox, partyUpdateAction, who)
		if update.Payload["reason"] == reason && update.Payload["subject_id"] == subject.String() {
			return update
		}
	}
}

// memberIDsOf are the player ids an update lists, in order.
func memberIDsOf(t *testing.T, update types.Message) []string {
	t.Helper()
	members, ok := update.Payload["members"].([]map[string]interface{})
	require.True(t, ok, "members is a list")
	ids := make([]string, len(members))
	for i, m := range members {
		ids[i], _ = m["player_id"].(string)
	}
	return ids
}

// When the leader leaves, the earliest-joined member who remains leads at once.
// The party hears two updates: who left, then who leads. The leaver's last
// update is the party without them, about them. FS-R82NV R20, R21, R22.
func TestPartyLeave_LeaderLeaves_EarliestJoinedLeads(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	idris, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)

	sendParty(rig.server, wrenConn, partyLeaveAction, map[string]interface{}{})

	final := awaitUpdate(t, wrenInbox, "left", wren.ID, "Wren")
	assert.Equal(t, []string{kaelen.ID.String(), idris.ID.String()}, memberIDsOf(t, final), "Wren's last update: the party without her")

	for who, inbox := range map[string]*startSoloInbox{"Kaelen": kaelenInbox, "Idris": idrisInbox} {
		left := awaitUpdate(t, inbox, "left", wren.ID, who)
		assert.Equal(t, []string{kaelen.ID.String(), idris.ID.String()}, memberIDsOf(t, left), "%s", who)
		led := awaitUpdate(t, inbox, "leader", kaelen.ID, who)
		assert.Equal(t, kaelen.ID.String(), led.Payload["leader_id"], "%s: Kaelen joined first, so Kaelen leads", who)
	}
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren, gone from the party")
}

// The last member leaving ends the party: both pointers go, and an invite it
// had out answers an accept with party_gone instead of silence. FS-R82NV R5,
// R16, R20; I-R82NV-2 decision 3.
func TestPartyLeave_LastMemberEndsTheParty(t *testing.T) {
	rig, mini := newPointedPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})
	invite := awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
	partyID, _ := invite.Payload["party_id"].(string)
	inviteID, _ := invite.Payload["invite_id"].(string)
	awaitPointer(t, mini, "party:"+partyID, testPodID)

	sendParty(rig.server, wrenConn, partyLeaveAction, map[string]interface{}{})

	final := awaitUpdate(t, wrenInbox, "left", wren.ID, "Wren")
	assert.Empty(t, memberIDsOf(t, final), "nobody is left")
	for _, key := range []string{"party:" + partyID, "player:" + wren.ID.String() + ":party"} {
		require.Eventually(t, func() bool { return !mini.Exists(key) }, pointerWait, 10*time.Millisecond, "%s is deleted", key)
	}

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	gone := awaitParty(t, kaelenInbox, partyNoticeAction, "Kaelen")
	assert.Equal(t, "party_gone", gone.Payload["code"])
	assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen: there is no party to join")
}

// A member who leaves a party that goes on loses only their own pointer; the
// party's, and the rest's, stay. FS-R82NV R3, R20.
func TestPartyLeave_MemberLeaves_OnlyTheirPointerGoes(t *testing.T) {
	rig, mini := newPointedPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	kaelenKey := "player:" + kaelen.ID.String() + ":party"
	require.Eventually(t, func() bool { return mini.Exists(kaelenKey) }, pointerWait, 10*time.Millisecond)
	partyID, err := mini.Get(kaelenKey)
	require.NoError(t, err)

	sendParty(rig.server, kaelenConn, partyLeaveAction, map[string]interface{}{})

	left := awaitUpdate(t, wrenInbox, "left", kaelen.ID, "Wren")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, left))
	assert.Equal(t, wren.ID.String(), left.Payload["leader_id"], "a member leaving passes no lead")
	require.Eventually(t, func() bool { return !mini.Exists(kaelenKey) }, pointerWait, 10*time.Millisecond, "Kaelen's pointer goes")
	assert.True(t, mini.Exists("party:"+partyID), "the party's stays")
	assert.True(t, mini.Exists("player:"+wren.ID.String()+":party"), "Wren's stays")
}

// The leader kicks a member: they are out, told so in their last update, and
// stay where they stand; everyone left hears who was kicked. FS-R82NV R19, R21.
func TestPartyKick_LeaderKicksAMember(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	idris, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)

	sendParty(rig.server, wrenConn, partyKickAction, map[string]interface{}{"target_id": kaelen.ID.String()})

	final := awaitUpdate(t, kaelenInbox, "kicked", kaelen.ID, "Kaelen")
	assert.Equal(t, []string{wren.ID.String(), idris.ID.String()}, memberIDsOf(t, final), "Kaelen's last update: the party without him")
	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Idris": idrisInbox} {
		kicked := awaitUpdate(t, inbox, "kicked", kaelen.ID, who)
		assert.Equal(t, []string{wren.ID.String(), idris.ID.String()}, memberIDsOf(t, kicked), "%s", who)
		assert.Equal(t, wren.ID.String(), kicked.Payload["leader_id"], "%s", who)
	}
	hub, _ := rig.server.HubSession()
	assert.True(t, hub.HasPlayer(kaelen.ID), "a kicked member stays where they stand")
}

// The leader hands the lead to a member; everyone hears who leads now.
// FS-R82NV R19.
func TestPartyTransfer_LeaderHandsTheLead(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)

	sendParty(rig.server, wrenConn, partyTransferAction, map[string]interface{}{"target_id": kaelen.ID.String()})

	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox} {
		led := awaitUpdate(t, inbox, "leader", kaelen.ID, who)
		assert.Equal(t, kaelen.ID.String(), led.Payload["leader_id"], "%s", who)
		assert.Equal(t, []string{wren.ID.String(), kaelen.ID.String()}, memberIDsOf(t, led), "%s: nobody leaves", who)
	}
}

// Every refusal of leave, kick and transfer, each a party_notice by code to the
// sender; a leader naming themselves is ignored. FS-R82NV R19, R20; Edge States
// "Empty", "Unauthorized"; I-R82NV-2 decision 4.
func TestPartyMembership_Refusals(t *testing.T) {
	tests := []struct {
		name string
		// arrange forms Wren (leader) + Kaelen and returns who sends what
		arrange func(r *partyRig, wren, kaelen, idris *types.Player) (sender *websocket.Conn, inbox *startSoloInbox, action string, payload map[string]interface{})
		// "" means nothing comes back at all
		wantCode string
	}{
		{
			name: "leave with no party",
			arrange: func(r *partyRig, _, _, idris *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[idris.ID], r.inboxes[idris.ID], partyLeaveAction, map[string]interface{}{}
			},
			wantCode: "not_member",
		},
		{
			name: "kick by a member who does not lead",
			arrange: func(r *partyRig, wren, kaelen, _ *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[kaelen.ID], r.inboxes[kaelen.ID], partyKickAction, map[string]interface{}{"target_id": wren.ID.String()}
			},
			wantCode: "not_leader",
		},
		{
			name: "transfer by a member who does not lead",
			arrange: func(r *partyRig, wren, kaelen, _ *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[kaelen.ID], r.inboxes[kaelen.ID], partyTransferAction, map[string]interface{}{"target_id": kaelen.ID.String()}
			},
			wantCode: "not_leader",
		},
		{
			name: "kick by a player with no party",
			arrange: func(r *partyRig, _, kaelen, idris *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[idris.ID], r.inboxes[idris.ID], partyKickAction, map[string]interface{}{"target_id": kaelen.ID.String()}
			},
			wantCode: "not_leader",
		},
		{
			name: "kick a player outside the party",
			arrange: func(r *partyRig, wren, _, idris *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[wren.ID], r.inboxes[wren.ID], partyKickAction, map[string]interface{}{"target_id": idris.ID.String()}
			},
			wantCode: "not_member",
		},
		{
			name: "transfer to a player outside the party",
			arrange: func(r *partyRig, wren, _, idris *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[wren.ID], r.inboxes[wren.ID], partyTransferAction, map[string]interface{}{"target_id": idris.ID.String()}
			},
			wantCode: "not_member",
		},
		{
			name: "kick a target that is no player id",
			arrange: func(r *partyRig, wren, _, _ *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[wren.ID], r.inboxes[wren.ID], partyKickAction, map[string]interface{}{"target_id": "nobody"}
			},
			wantCode: "not_member",
		},
		{
			name: "the leader kicking themselves is ignored",
			arrange: func(r *partyRig, wren, _, _ *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[wren.ID], r.inboxes[wren.ID], partyKickAction, map[string]interface{}{"target_id": wren.ID.String()}
			},
		},
		{
			name: "the leader handing the lead to themselves is ignored",
			arrange: func(r *partyRig, wren, _, _ *types.Player) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return r.conns[wren.ID], r.inboxes[wren.ID], partyTransferAction, map[string]interface{}{"target_id": wren.ID.String()}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRig(t)
			wren, wrenConn, wrenInbox := rig.inHubTracked(t, "Wren")
			kaelen, kaelenConn, kaelenInbox := rig.inHubTracked(t, "Kaelen")
			idris, _, _ := rig.inHubTracked(t, "Idris")
			rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)

			conn, inbox, action, payload := tt.arrange(rig, wren, kaelen, idris)
			sendParty(rig.server, conn, action, payload)

			if tt.wantCode == "" {
				assertNoParty(t, inbox, partyNoticeAction, "the sender")
				assertNoParty(t, inbox, partyUpdateAction, "the sender: nothing changed")
				return
			}
			refused := awaitParty(t, inbox, partyNoticeAction, "the sender")
			assert.Equal(t, tt.wantCode, refused.Payload["code"])
			assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nothing changed")
		})
	}
}

// A kick and a leave of the same member arrive together: the first wins, the
// second finds no such member. FS-R82NV Edge States "Concurrent".
func TestPartyKickAndLeave_FirstWinsSecondNotMember(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)

	sendParty(rig.server, wrenConn, partyKickAction, map[string]interface{}{"target_id": kaelen.ID.String()})
	sendParty(rig.server, kaelenConn, partyLeaveAction, map[string]interface{}{})

	awaitUpdate(t, kaelenInbox, "kicked", kaelen.ID, "Kaelen")
	late := awaitParty(t, kaelenInbox, partyNoticeAction, "Kaelen")
	assert.Equal(t, "not_member", late.Payload["code"], "the leave came second: Kaelen is no longer a member")
}

// An invite is the party's, not the inviter's: after the lead passes it still
// stands, and its answer goes to whoever leads now. I-R82NV-2 decision 2.
func TestPartyInvite_AnswerGoesToTheCurrentLeader(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	inviteID := rig.invited(t, wrenConn, "Idris", idrisInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent
	sendParty(rig.server, wrenConn, partyTransferAction, map[string]interface{}{"target_id": kaelen.ID.String()})
	awaitUpdate(t, kaelenInbox, "leader", kaelen.ID, "Kaelen")

	sendParty(rig.server, idrisConn, partyDeclineAction, map[string]interface{}{"invite_id": inviteID})

	declined := awaitParty(t, kaelenInbox, partyNoticeAction, "Kaelen, who leads now")
	assert.Equal(t, "declined", declined.Payload["code"])
	assert.Equal(t, "Idris", declined.Payload["name"])
	assertNoParty(t, wrenInbox, partyNoticeAction, "Wren, who no longer leads")
}
