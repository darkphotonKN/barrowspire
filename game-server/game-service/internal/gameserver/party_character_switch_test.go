package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Change: Changing character leaves the party (owner 2026-11-12: "組隊後 更換角色還會在隊伍中";
// amended the same day: "村莊組的隊伍 換角色就算離隊 但在選角色時有辦法知道他某個角色正在組隊 選了會離隊的提示通知嗎 按確認就離隊").
//
// Going back to the roster (leave_hub) keeps the party (C8). Choosing a character on the roster is
// the switch: the party's own character stays (C10); another takes the player out of their party
// exactly as party_leave would (C1's removal, C2, C3, C7): the others are told left, the lead passes
// to the earliest-joined if they led, the last one out ends the party, an open invite to them is
// spent as a decline, a ready check open for their party is cancelled left, naming them. While
// their party's run is under way on this pod another character is refused (C12). A player whose
// record is gone is compared by the party's record of them (C13). On the roster every connection
// is sent its party, locked while its run is under way here (C9).

// switchMidRunCopy is the words enter_hub is refused with when it would change character during a
// delve (FS-BDA7X R7), and while the party's run is under way (C12).
const switchMidRunCopy = "You cannot change character during a delve."

// toTheRoster sends leave_hub on conn, as the Esc menu's "Change character" does, and waits for
// world_left.
func toTheRoster(t *testing.T, rig *partyRig, conn *websocket.Conn, inbox *startSoloInbox) {
	t.Helper()
	leaveHubSend(rig.server, conn)
	leaveHubAwaitLeft(t, inbox)
}

// enterHubAs sends enter_hub naming character on conn, as the roster's ENTER THE TOWN does, and
// returns the answer: world_entered, or the refusal on enter_hub itself.
func enterHubAs(t *testing.T, rig *partyRig, conn *websocket.Conn, inbox *startSoloInbox, character types.CharacterInPlay) types.Message {
	t.Helper()
	sendEnterHub(rig.server, conn, map[string]interface{}{"characterId": character.ID.String()})
	reply, answered := inbox.await(string(constants.ActionWorldEntered), string(constants.ActionEnterHub))
	require.True(t, answered, "enter_hub was never answered")
	return reply
}

// enteredAs requires enter_hub as character to be accepted.
func enteredAs(t *testing.T, rig *partyRig, conn *websocket.Conn, inbox *startSoloInbox, character types.CharacterInPlay) {
	t.Helper()
	reply := enterHubAs(t, rig, conn, inbox, character)
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "%s is seated in the town", character.Name)
}

// assertEnterHubRefused requires reply to be enter_hub refused with text.
func assertEnterHubRefused(t *testing.T, reply types.Message, text string) {
	t.Helper()
	require.Equal(t, string(constants.ActionEnterHub), reply.Action, "refused on enter_hub itself, not with %q", reply.Action)
	require.NotNil(t, reply.Error, "enter_hub was accepted")
	assert.Equal(t, text, *reply.Error)
}

// assertOutOfTheParty requires player's pointer gone from Redis, and the party, if it stands,
// not to list them.
func assertOutOfTheParty(t *testing.T, rig *partyRig, player uuid.UUID, partyID string) {
	t.Helper()
	require.Eventually(t, func() bool { return !rig.mini.Exists(pointerKey(player)) }, startSoloSettle, 10*time.Millisecond,
		"the switcher's pointer to the party goes")
	if !rig.mini.Exists(partyKey(partyID)) {
		return
	}
	res, err := partystore.NewRedis(rig.client).PartyOf(context.Background(), uuid.MustParse(memberOfParty(t, rig, partyID)), rig.partyClock.now())
	require.NoError(t, err)
	for _, m := range res.Party.Members {
		assert.NotEqual(t, player, m.PlayerID, "the party no longer lists the switcher")
	}
}

// assertStillInTheParty requires player still a member of partyID in Redis, a little after
// whatever the hub did with their entry.
func assertStillInTheParty(t *testing.T, rig *partyRig, player uuid.UUID, partyID string) {
	t.Helper()
	time.Sleep(chatSilence)
	pointer, err := rig.mini.Get(pointerKey(player))
	require.NoError(t, err, "the pointer stays")
	assert.Equal(t, partyID, pointer)
	res, err := partystore.NewRedis(rig.client).PartyOf(context.Background(), player, rig.partyClock.now())
	require.NoError(t, err)
	assert.True(t, res.In, "the party still lists them")
}

// memberOfParty is the leader of partyID as Redis holds it, someone to read the party through.
func memberOfParty(t *testing.T, rig *partyRig, partyID string) string {
	t.Helper()
	leader := rig.mini.HGet(partyKey(partyID), "leader")
	require.NotEmpty(t, leader, "the party has a leader")
	return leader
}

// partyIDOf is player's party id, from their pointer.
func partyIDOf(t *testing.T, rig *partyRig, player uuid.UUID) string {
	t.Helper()
	partyID, err := rig.mini.Get(pointerKey(player))
	require.NoError(t, err, "in a party")
	return partyID
}

// aloneInAParty has player create a party alone, and returns its id.
func aloneInAParty(t *testing.T, rig *partyRig, player *types.Player, conn *websocket.Conn, inbox *startSoloInbox) string {
	t.Helper()
	sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
	awaitUpdate(t, inbox, "joined", player.ID, player.Character.Name)
	return partyIDOf(t, rig, player.ID)
}

// recordGone ends player's stay here as a reconnect grace running out does (their record deleted,
// their body gone), then connects them again fresh, on the roster, with no character on record.
// C13.
func recordGone(t *testing.T, rig *partyRig, player *types.Player, conn *websocket.Conn) (*websocket.Conn, *startSoloInbox) {
	t.Helper()
	_, hold, held := rig.server.holdForReconnect(conn)
	require.True(t, held)
	rig.server.cleanUpPlayerCompletely(player.ID, hold)
	_, onRecord := rig.server.PlayerByID(player.ID)
	require.False(t, onRecord, "the record is gone")

	record, reconnected := rig.server.connectPlayer(player.ID, player.Username, "token")
	require.False(t, reconnected, "connected fresh")
	require.Equal(t, uuid.Nil, record.Character.ID, "no character on record")
	fresh := &websocket.Conn{}
	_, mapped := rig.server.MapConnToPlayer(fresh, player.ID, make(chan interface{}, clientWriterBuffer))
	require.True(t, mapped)
	return fresh, startSoloListen(t, rig.server, fresh)
}

// awaitRosterSync waits for the party_update sync a player on the roster is sent about themselves. C9.
func awaitRosterSync(t *testing.T, inbox *startSoloInbox, player uuid.UUID, who string) types.Message {
	t.Helper()
	sync := awaitUpdate(t, inbox, "sync", player, who)
	_, carried := sync.Payload["locked"]
	require.True(t, carried, "%s: a roster sync says whether the party is locked", who)
	return sync
}

// --- C8: going back to the roster keeps the party ---

// A member goes back to the roster from the town or a field: world_left, and nothing else. Nobody
// is told anything, and the party in Redis still lists them.
func TestCharacterSwitch_LeaveHub_KeepsTheParty(t *testing.T) {
	for _, where := range []string{"the town", "a field"} {
		t.Run(where, func(t *testing.T) {
			rig := newPartyRig(t)
			_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
			var kaelen *types.Player
			var kaelenConn *websocket.Conn
			var kaelenInbox *startSoloInbox
			if where == "the town" {
				kaelen, kaelenConn, kaelenInbox = rig.inHub(t, "Kaelen")
			} else {
				kaelen, kaelenConn, kaelenInbox = rig.inMeadows(t, "Kaelen")
			}
			rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
			partyID := partyIDOf(t, rig, kaelen.ID)

			toTheRoster(t, rig, kaelenConn, kaelenInbox)

			assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody left")
			assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen: no last update")
			assertStillInTheParty(t, rig, kaelen.ID, partyID)
		})
	}
}

// An open invite to a player who goes back to the roster is not spent by it: the leader hears no
// decline. The switch spends it (C2, below).
func TestCharacterSwitch_LeaveHub_LeavesAnOpenInviteOpen(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	toTheRoster(t, rig, kaelenConn, kaelenInbox)

	assertNoParty(t, wrenInbox, partyNoticeAction, "Wren: no decline")
	ids, err := partystore.NewRedis(rig.client).InvitesTo(context.Background(), kaelen.ID)
	require.NoError(t, err)
	assert.Len(t, ids, 1, "the invite stays open")
}

// --- C10: the same character stays ---

// Back from the roster as the same character: no switch, the party keeps them.
func TestCharacterSwitch_FromTheRoster_SameCharacter_Stays(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	partyID := partyIDOf(t, rig, kaelen.ID)
	character := kaelen.Character
	toTheRoster(t, rig, kaelenConn, kaelenInbox)
	rig.tick()

	enteredAs(t, rig, kaelenConn, kaelenInbox, character)

	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody left")
	assertStillInTheParty(t, rig, kaelen.ID, partyID)
}

// The same character entered again with no leave_hub first is no switch either. C7, C10.
func TestCharacterSwitch_ByEnterHubAsTheSame_PartyStands(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)

	enteredAs(t, rig, kaelenConn, kaelenInbox, kaelen.Character)

	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody left")
	assert.True(t, rig.mini.Exists(pointerKey(kaelen.ID)), "Kaelen is still in the party")
}

// --- C11, C7: another character leaves the party as party_leave would ---

// From the roster as another character: seated as them, and out of the party: their last update
// the party without them, about them; the leader told they left; their pointer gone.
func TestCharacterSwitch_FromTheRoster_AnotherCharacter_LeavesTheParty(t *testing.T) {
	for _, where := range []string{"the town", "a field"} {
		t.Run(where, func(t *testing.T) {
			rig := newPartyRig(t)
			wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
			var kaelen *types.Player
			var kaelenConn *websocket.Conn
			var kaelenInbox *startSoloInbox
			if where == "the town" {
				kaelen, kaelenConn, kaelenInbox = rig.inHub(t, "Kaelen")
			} else {
				kaelen, kaelenConn, kaelenInbox = rig.inMeadows(t, "Kaelen")
			}
			rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
			partyID := partyIDOf(t, rig, kaelen.ID)
			toTheRoster(t, rig, kaelenConn, kaelenInbox)

			brannoc := rig.characters.give(kaelen.ID, "archer", "Brannoc", 1, 0)
			enteredAs(t, rig, kaelenConn, kaelenInbox, brannoc)

			final := awaitUpdate(t, kaelenInbox, "left", kaelen.ID, "Kaelen")
			assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, final), "his last update: the party without him")
			left := awaitUpdate(t, wrenInbox, "left", kaelen.ID, "Wren")
			assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, left), "Wren is told Kaelen left")
			assert.Equal(t, wren.ID.String(), left.Payload["leader_id"], "a member leaving passes no lead")
			assertOutOfTheParty(t, rig, kaelen.ID, partyID)
			assert.True(t, rig.mini.Exists(partyKey(partyID)), "the party stands with Wren")
		})
	}
}

// Entering the town as another character with no leave_hub first (the main menu reached by a
// reload or a second tab) is the same switch. C7.
func TestCharacterSwitch_ByEnterHubAsAnother_LeavesTheParty(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	partyID := partyIDOf(t, rig, kaelen.ID)

	brannoc := rig.characters.give(kaelen.ID, "archer", "Brannoc", 1, 0)
	enteredAs(t, rig, kaelenConn, kaelenInbox, brannoc)

	final := awaitUpdate(t, kaelenInbox, "left", kaelen.ID, "Kaelen")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, final), "his last update: the party without him")
	awaitUpdate(t, wrenInbox, "left", kaelen.ID, "Wren")
	assertOutOfTheParty(t, rig, kaelen.ID, partyID)
}

// The leader switches: the earliest-joined member who remains leads at once, as when a leader
// leaves (FS-R82NV R22). Everyone left hears who left, then who leads.
func TestCharacterSwitch_Leader_EarliestJoinedLeads(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	idris, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)
	partyID := partyIDOf(t, rig, wren.ID)
	toTheRoster(t, rig, wrenConn, wrenInbox)

	enteredAs(t, rig, wrenConn, wrenInbox, rig.characters.give(wren.ID, "mage", "Sorrel", 1, 0))

	final := awaitUpdate(t, wrenInbox, "left", wren.ID, "Wren")
	assert.Equal(t, []string{kaelen.ID.String(), idris.ID.String()}, memberIDsOf(t, final), "Wren's last update: the party without her")
	for who, inbox := range map[string]*startSoloInbox{"Kaelen": kaelenInbox, "Idris": idrisInbox} {
		awaitUpdate(t, inbox, "left", wren.ID, who)
		led := awaitUpdate(t, inbox, "leader", kaelen.ID, who)
		assert.Equal(t, kaelen.ID.String(), led.Payload["leader_id"], "%s: Kaelen joined first, so Kaelen leads", who)
	}
	assertOutOfTheParty(t, rig, wren.ID, partyID)
}

// The last member switches from the roster, the party held by no pod's cache by then (nobody of
// it seated here): read from Redis, it ends with them, its keys gone.
func TestCharacterSwitch_LastMember_EndsTheParty(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	partyID := aloneInAParty(t, rig, wren, wrenConn, wrenInbox)
	toTheRoster(t, rig, wrenConn, wrenInbox)
	rig.tick() // the cache lets the party go: none of it is seated here

	enteredAs(t, rig, wrenConn, wrenInbox, rig.characters.give(wren.ID, "mage", "Sorrel", 1, 0))

	final := awaitUpdate(t, wrenInbox, "left", wren.ID, "Wren")
	assert.Empty(t, memberIDsOf(t, final), "nobody is left")
	require.Eventually(t, func() bool { return !rig.mini.Exists(partyKey(partyID)) }, startSoloSettle, 10*time.Millisecond,
		"the party is gone")
	assert.False(t, rig.mini.Exists(pointerKey(wren.ID)), "so is Wren's pointer")
}

// An open invite to the player who switches is spent as their decline would spend it: the leader
// is told declined, by the old character's name, the slot frees, and the invite accepted
// afterwards, as the new character, joins nobody. C2.
func TestCharacterSwitch_OpenInviteToTheSwitcher_Spent(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent
	toTheRoster(t, rig, kaelenConn, kaelenInbox)

	brannoc := rig.characters.give(kaelen.ID, "archer", "Brannoc", 1, 0)
	enteredAs(t, rig, kaelenConn, kaelenInbox, brannoc)

	declined := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "declined", declined.Payload["code"])
	assert.Equal(t, "Kaelen", declined.Payload["name"], "named as the character the invite was sent to")
	ended := awaitUpdate(t, wrenInbox, "invite_ended", kaelen.ID, "Wren")
	assert.Empty(t, listOf(t, ended, "reserved"), "the slot frees")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, ended))

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody joins on the spent invite")
	assert.False(t, rig.mini.Exists(pointerKey(kaelen.ID)), "Brannoc is in no party")
}

// Whoever the switcher comes back as starts in no party: seated, the arrival read (R6) shows them
// a party listing nobody. C5.
func TestCharacterSwitch_NewCharacterStartsWithNoParty(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick() // both read on arrival, so a second read is what a new seat does
	toTheRoster(t, rig, kaelenConn, kaelenInbox)
	rig.tick() // the cache sees Kaelen seated nowhere
	awaitRosterSync(t, kaelenInbox, kaelen.ID, "Kaelen")

	brannoc := rig.characters.give(kaelen.ID, "archer", "Brannoc", 1, 0)
	enteredAs(t, rig, kaelenConn, kaelenInbox, brannoc)
	awaitUpdate(t, kaelenInbox, "left", kaelen.ID, "Kaelen") // the last update the switch sent
	rig.tick()

	update := awaitParty(t, kaelenInbox, partyUpdateAction, "Brannoc")
	assert.Empty(t, memberIDsOf(t, update), "Brannoc is shown no party")
	assert.False(t, rig.mini.Exists(pointerKey(kaelen.ID)), "Brannoc has no pointer")
}

// A member who switches while their party's ready check is open cancels it, left, naming them
// (FS-BJNYC R10), with no tick needed; and is out of the party. C3.
func TestCharacterSwitch_DuringAReadyCheck_CancelledLeft(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreeParty(t, rig)
	before := startSoloSessionCount(rig.server)
	sendEnter(rig.server, p.wrenConn)
	open := awaitReadyCheck(t, p.wrenInbox, "Wren")
	awaitReadyCheck(t, p.kaelenInbox, "Kaelen")
	awaitReadyCheck(t, p.marlInbox, "Marl")

	enteredAs(t, rig.partyRig, p.marlConn, p.marlInbox, rig.characters.give(p.marl.ID, "archer", "Brannoc", 1, 0))

	cancelled := awaitReadyOutcome(t, p.wrenInbox, "Wren", "cancelled")
	assert.Equal(t, open.checkID, cancelled.checkID)
	assert.Equal(t, "left", cancelled.reason)
	assert.Equal(t, []string{"Marl"}, cancelled.names)
	awaitUpdate(t, p.kaelenInbox, "left", p.marl.ID, "Kaelen")
	assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
}

// --- C4, C12: while the party's run is under way ---

// Inside the party's run leave_hub is refused as before. Back in the town early it is accepted
// (C8): the roster can be reached, the party standing. From there another character is refused
// with the mid-run words and the party stands; the same character goes back in, still a member.
func TestCharacterSwitch_WhileThePartysRunIsUnderWay(t *testing.T) {
	t.Run("inside the run, leave_hub is refused", func(t *testing.T) {
		rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
		p := newThreeParty(t, rig)
		run := intoItsRun(t, rig, p)

		leaveHubSend(rig.server, p.kaelenConn)

		leaveHubAssertRefused(t, p.kaelenInbox, leaveHubInRunCopy)
		now, _ := rig.server.currentWorldOf(p.kaelen.ID)
		assert.Equal(t, run.ID, now, "Kaelen stays in the run")
		assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(partyInRedis(t, rig, p.wren.ID)), "the party stands as it went down")
	})

	t.Run("back in the town early, to the roster and back", func(t *testing.T) {
		rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
		p := newThreeParty(t, rig)
		intoItsRun(t, rig, p)
		backInTownEarly(t, rig, p.kaelen)
		character := p.kaelen.Character

		toTheRoster(t, rig.partyRig, p.kaelenConn, p.kaelenInbox)
		brannoc := rig.characters.give(p.kaelen.ID, "archer", "Brannoc", 1, 0)
		assertEnterHubRefused(t, enterHubAs(t, rig.partyRig, p.kaelenConn, p.kaelenInbox, brannoc), switchMidRunCopy)

		record, _ := rig.server.PlayerByID(p.kaelen.ID)
		assert.Equal(t, character.ID, record.Character.ID, "still the character he went down as")
		assert.False(t, rig.hub.HasPlayer(p.kaelen.ID), "still on the roster")
		assertNoParty(t, p.wrenInbox, partyUpdateAction, "Wren: nobody left")
		assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(partyInRedis(t, rig, p.wren.ID)), "the party stands")

		enteredAs(t, rig.partyRig, p.kaelenConn, p.kaelenInbox, character)
		assertNoParty(t, p.wrenInbox, partyUpdateAction, "Wren: nobody left")
		assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(partyInRedis(t, rig, p.wren.ID)), "the party stands")
	})
}

// Back in the town early, entering as another character straight away, with no leave_hub, is
// refused the same. C7, C12.
func TestCharacterSwitch_ByEnterHubBackInTownEarly_Refused(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreeParty(t, rig)
	intoItsRun(t, rig, p)
	backInTownEarly(t, rig, p.kaelen)
	character := p.kaelen.Character

	brannoc := rig.characters.give(p.kaelen.ID, "archer", "Brannoc", 1, 0)
	assertEnterHubRefused(t, enterHubAs(t, rig.partyRig, p.kaelenConn, p.kaelenInbox, brannoc), switchMidRunCopy)

	record, _ := rig.server.PlayerByID(p.kaelen.ID)
	assert.Equal(t, character.ID, record.Character.ID, "still the character he went down as")
	assertNoParty(t, p.wrenInbox, partyUpdateAction, "Wren: nobody left")
	assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(partyInRedis(t, rig, p.wren.ID)), "the party stands")
}

// A queued member's leave_hub is refused as before, and they stay in their party.
func TestCharacterSwitch_Queued_RefusedPartyStands(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.queued(t, kaelen)

	leaveHubSend(rig.server, kaelenConn)

	leaveHubAssertRefused(t, kaelenInbox, leaveHubQueuedCopy)
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody left")
	assert.True(t, rig.mini.Exists(pointerKey(kaelen.ID)), "Kaelen is still in the party")
}

// A member whose party is in its run reaches the roster another way than the Esc menu (a page
// reloaded after a drop, a second tab): the server puts them back in the run their record names,
// and an enter_hub as another character is refused. Nobody leaves the party and no second body is
// seated. FS-MCYWK; FS-BDA7X R7; C7. Pins today's behaviour.
func TestCharacterSwitch_HeldInTheRun_BackToTheRunNeverAnother(t *testing.T) {
	for _, how := range []string{"dropped and back within the grace", "a second tab"} {
		t.Run(how, func(t *testing.T) {
			rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
			p := newThreeParty(t, rig)
			run := intoItsRun(t, rig, p)
			if how == "dropped and back within the grace" {
				_, _, held := rig.server.holdForReconnect(p.kaelenConn)
				require.True(t, held)
			}

			// the new connection, as the handler serves it: the record found, its world announced
			record, reconnected := rig.server.connectPlayer(p.kaelen.ID, "Kaelen-account", "token")
			require.True(t, reconnected, "a member on record here reconnects in place")
			msgChan := make(chan interface{}, clientWriterBuffer)
			rig.server.announceCurrentWorld(msgChan, &record)
			conn := &websocket.Conn{}
			_, mapped := rig.server.MapConnToPlayer(conn, p.kaelen.ID, msgChan)
			require.True(t, mapped)
			inbox := startSoloListen(t, rig.server, conn)
			entered := awaitParty(t, inbox, string(constants.ActionWorldEntered), "Kaelen")
			assert.Equal(t, run.ID.String(), entered.Payload["session_id"], "announced the run he is held in")

			brannoc := rig.characters.give(p.kaelen.ID, "archer", "Brannoc", 1, 0)
			assertEnterHubRefused(t, enterHubAs(t, rig.partyRig, conn, inbox, brannoc), switchMidRunCopy)
			leaveHubSend(rig.server, conn)
			leaveHubAssertRefused(t, inbox, leaveHubInRunCopy)

			now, _ := rig.server.currentWorldOf(p.kaelen.ID)
			assert.Equal(t, run.ID, now, "still in the run")
			assert.False(t, rig.hub.HasPlayer(p.kaelen.ID), "no body in the town")
			assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(partyInRedis(t, rig, p.wren.ID)), "the party stands")
		})
	}
}

// --- C13: a player whose record is gone is compared by the party's record ---

// A member whose record was deleted comes back fresh, no character on record. Their entry is
// compared with the name the party holds for them: the same character stays, another leaves.
// Whether this pod's cache holds the party (a teammate seated here) or not (a party of one, read
// from Redis once they are seated).
func TestCharacterSwitch_RecordGone_ComparedByThePartyRecord(t *testing.T) {
	for _, tt := range []struct {
		name    string
		alone   bool
		another bool
	}{
		{name: "the party cached here, the same character", another: false},
		{name: "the party cached here, another character", another: true},
		{name: "the party read from Redis, the same character", alone: true, another: false},
		{name: "the party read from Redis, another character", alone: true, another: true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyRig(t)
			kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
			var partyID string
			var wrenInbox *startSoloInbox
			if tt.alone {
				partyID = aloneInAParty(t, rig, kaelen, kaelenConn, kaelenInbox)
			} else {
				var wrenConn *websocket.Conn
				_, wrenConn, wrenInbox = rig.inHub(t, "Wren")
				rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
				partyID = partyIDOf(t, rig, kaelen.ID)
			}
			character := kaelen.Character

			conn, inbox := recordGone(t, rig, kaelen, kaelenConn)
			rig.tick() // nobody of a party of one is seated here now: the cache lets it go

			entering := character
			if tt.another {
				entering = rig.characters.give(kaelen.ID, "archer", "Brannoc", 1, 0)
			}
			enteredAs(t, rig, conn, inbox, entering)

			if !tt.another {
				assertStillInTheParty(t, rig, kaelen.ID, partyID)
				return
			}
			final := awaitUpdate(t, inbox, "left", kaelen.ID, "Kaelen")
			assert.NotContains(t, memberIDsOf(t, final), kaelen.ID.String(), "his last update no longer lists him")
			assertOutOfTheParty(t, rig, kaelen.ID, partyID)
			if wrenInbox != nil {
				awaitUpdate(t, wrenInbox, "left", kaelen.ID, "Wren")
			}
		})
	}
}

// The disconnect-death gap: a member whose reconnect grace ran out in the party's run (their
// record deleted, their body gone) comes back fresh while the run is under way. Another character
// is refused with the mid-run words, the party standing; the same character goes into the town,
// still a member.
func TestCharacterSwitch_RecordGoneInTheRun_ComparedByThePartyRecord(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreeParty(t, rig)
	intoItsRun(t, rig, p)
	character := p.kaelen.Character

	conn, inbox := recordGone(t, rig.partyRig, p.kaelen, p.kaelenConn)
	brannoc := rig.characters.give(p.kaelen.ID, "archer", "Brannoc", 1, 0)
	assertEnterHubRefused(t, enterHubAs(t, rig.partyRig, conn, inbox, brannoc), switchMidRunCopy)
	assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(partyInRedis(t, rig, p.wren.ID)), "the party stands")

	enteredAs(t, rig.partyRig, conn, inbox, character)
	assertNoParty(t, p.wrenInbox, partyUpdateAction, "Wren: nobody left")
	assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(partyInRedis(t, rig, p.wren.ID)), "the party stands")
}

// --- C9: the roster is sent the party ---

// A player on the roster is sent their party on the next tick: after leave_hub, or connected
// fresh with their record gone. It lists them by the names the party holds, not locked.
func TestRoster_IsSentTheParty(t *testing.T) {
	for _, how := range []string{"after leave_hub", "connected fresh"} {
		t.Run(how, func(t *testing.T) {
			rig := newPartyRig(t)
			wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
			kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
			rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
			inbox := kaelenInbox
			if how == "after leave_hub" {
				toTheRoster(t, rig, kaelenConn, kaelenInbox)
			} else {
				_, inbox = recordGone(t, rig, kaelen, kaelenConn)
			}

			rig.tick()

			sync := awaitRosterSync(t, inbox, kaelen.ID, "Kaelen")
			assert.Equal(t, []string{wren.ID.String(), kaelen.ID.String()}, memberIDsOf(t, sync), "the party, him in it")
			assert.Equal(t, false, sync.Payload["locked"])
			names := []string{}
			for _, m := range listOf(t, sync, "members") {
				names = append(names, m["name"].(string))
			}
			assert.Equal(t, []string{"Wren", "Kaelen"}, names, "by the names the party holds: the roster marks Kaelen's card")
		})
	}
}

// A player on the roster in no party is sent the update listing nobody.
func TestRoster_NoParty_SentTheUpdateListingNobody(t *testing.T) {
	rig := newPartyRig(t)
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	toTheRoster(t, rig, kaelenConn, kaelenInbox)

	rig.tick()

	sync := awaitRosterSync(t, kaelenInbox, kaelen.ID, "Kaelen")
	assertNoPartyUpdate(t, sync, kaelen.ID, "Kaelen")
	assert.Equal(t, false, sync.Payload["locked"])
}

// While the party's run is under way here the roster is told locked, and is not told again until
// something changes; once the run ends, the next read tells it unlocked. C9, C12.
func TestRoster_LockedWhileThePartysRunIsUnderWay(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreeParty(t, rig)
	run := intoItsRun(t, rig, p)
	backInTownEarly(t, rig, p.kaelen)
	toTheRoster(t, rig.partyRig, p.kaelenConn, p.kaelenInbox)

	rig.tick()
	sync := awaitRosterSync(t, p.kaelenInbox, p.kaelen.ID, "Kaelen")
	assert.Equal(t, true, sync.Payload["locked"], "the party's run is under way here")

	rig.partyClock.advance(partyRefreshInterval)
	rig.tick()
	assertNoParty(t, p.kaelenInbox, partyUpdateAction, "Kaelen: nothing changed")

	endRun(t, rig, run)
	rig.tick() // the registry sees the run gone
	rig.partyClock.advance(partyRefreshInterval)
	rig.tick()
	unlocked := awaitRosterSync(t, p.kaelenInbox, p.kaelen.ID, "Kaelen")
	assert.Equal(t, false, unlocked.Payload["locked"], "the run is over")
}
