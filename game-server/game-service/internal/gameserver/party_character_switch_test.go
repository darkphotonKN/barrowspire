package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Change: Changing character leaves the party (owner 2026-11-12: "組隊後 更換角色還會在隊伍中").
//
// Changing character is leave_hub, from the town or a field: the player goes back to the roster.
// It takes them out of their party exactly as party_leave would: the others are told left, the
// lead passes to the earliest-joined if they led, the last one out ends the party. An open invite
// to them is spent as a decline would spend it, and a ready check open for their party is
// cancelled left, naming them (FS-BJNYC R10). Inside a run leave_hub is refused as before; back
// in the town while their party's run is still under way it is refused as party_leave is there,
// and the party stands. Whoever they come back as starts in no party.

// notWhileDelvingCopy is the party lock's own words (FS-NCC9J R9), which a character switch the
// lock holds is refused with.
const notWhileDelvingCopy = "Not while delving."

// switchCharacter sends leave_hub on conn, as the Esc menu's "Change character" does, and waits
// for world_left.
func switchCharacter(t *testing.T, rig *partyRig, conn *websocket.Conn, inbox *startSoloInbox) {
	t.Helper()
	leaveHubSend(rig.server, conn)
	leaveHubAwaitLeft(t, inbox)
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

// memberOfParty is the leader of partyID as Redis holds it, someone to read the party through.
func memberOfParty(t *testing.T, rig *partyRig, partyID string) string {
	t.Helper()
	leader := rig.mini.HGet(partyKey(partyID), "leader")
	require.NotEmpty(t, leader, "the party has a leader")
	return leader
}

// A member changes character from the town: their last update is the party without them, about
// them; the leader is told they left; their pointer goes. The switcher is not refused anything.
func TestCharacterSwitch_FromTheTown_MemberLeavesTheParty(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	partyID, err := rig.mini.Get(pointerKey(kaelen.ID))
	require.NoError(t, err)

	switchCharacter(t, rig, kaelenConn, kaelenInbox)

	final := awaitUpdate(t, kaelenInbox, "left", kaelen.ID, "Kaelen")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, final), "Kaelen's last update: the party without him")
	left := awaitUpdate(t, wrenInbox, "left", kaelen.ID, "Wren")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, left), "Wren is told Kaelen left")
	assert.Equal(t, wren.ID.String(), left.Payload["leader_id"], "a member leaving passes no lead")
	assertOutOfTheParty(t, rig, kaelen.ID, partyID)
	assert.True(t, rig.mini.Exists(partyKey(partyID)), "the party stands with Wren")
}

// The same from a field: leave_hub there settles the visit and takes them to the roster
// (FS-X2F2H R18), and out of the party with it.
func TestCharacterSwitch_FromAField_MemberLeavesTheParty(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inMeadows(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	partyID, err := rig.mini.Get(pointerKey(kaelen.ID))
	require.NoError(t, err)

	switchCharacter(t, rig, kaelenConn, kaelenInbox)

	awaitUpdate(t, kaelenInbox, "left", kaelen.ID, "Kaelen")
	left := awaitUpdate(t, wrenInbox, "left", kaelen.ID, "Wren")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, left))
	assertOutOfTheParty(t, rig, kaelen.ID, partyID)
}

// The leader changes character: the earliest-joined member who remains leads at once, as when a
// leader leaves (FS-R82NV R22). Everyone left hears who left, then who leads.
func TestCharacterSwitch_Leader_EarliestJoinedLeads(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	idris, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)
	partyID, err := rig.mini.Get(pointerKey(wren.ID))
	require.NoError(t, err)

	switchCharacter(t, rig, wrenConn, wrenInbox)

	final := awaitUpdate(t, wrenInbox, "left", wren.ID, "Wren")
	assert.Equal(t, []string{kaelen.ID.String(), idris.ID.String()}, memberIDsOf(t, final), "Wren's last update: the party without her")
	for who, inbox := range map[string]*startSoloInbox{"Kaelen": kaelenInbox, "Idris": idrisInbox} {
		awaitUpdate(t, inbox, "left", wren.ID, who)
		led := awaitUpdate(t, inbox, "leader", kaelen.ID, who)
		assert.Equal(t, kaelen.ID.String(), led.Payload["leader_id"], "%s: Kaelen joined first, so Kaelen leads", who)
	}
	assertOutOfTheParty(t, rig, wren.ID, partyID)
}

// The last member changes character: the party ends with them, its keys go.
func TestCharacterSwitch_LastMember_EndsTheParty(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	sendParty(rig.server, wrenConn, partyCreateAction, map[string]interface{}{})
	awaitUpdate(t, wrenInbox, "joined", wren.ID, "Wren")
	partyID, err := rig.mini.Get(pointerKey(wren.ID))
	require.NoError(t, err)

	switchCharacter(t, rig, wrenConn, wrenInbox)

	final := awaitUpdate(t, wrenInbox, "left", wren.ID, "Wren")
	assert.Empty(t, memberIDsOf(t, final), "nobody is left")
	require.Eventually(t, func() bool { return !rig.mini.Exists(partyKey(partyID)) }, startSoloSettle, 10*time.Millisecond,
		"the party is gone")
	assert.False(t, rig.mini.Exists(pointerKey(wren.ID)), "so is Wren's pointer")
}

// An open invite to the player who changes character is spent as their decline would spend it:
// the leader is told declined, by the old character's name, the slot frees, and the invite
// accepted afterwards, as whoever they came back as, joins nobody.
func TestCharacterSwitch_OpenInviteToTheSwitcher_Spent(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent

	switchCharacter(t, rig, kaelenConn, kaelenInbox)

	declined := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "declined", declined.Payload["code"])
	assert.Equal(t, "Kaelen", declined.Payload["name"], "named as the character the invite was sent to")
	ended := awaitUpdate(t, wrenInbox, "invite_ended", kaelen.ID, "Wren")
	assert.Empty(t, listOf(t, ended, "reserved"), "the slot frees")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, ended))

	brannoc := rig.characters.give(kaelen.ID, "archer", "Brannoc", 1, 0)
	sendEnterHub(rig.server, kaelenConn, map[string]interface{}{"characterId": brannoc.ID.String()})
	awaitParty(t, kaelenInbox, string(constants.ActionWorldEntered), "Brannoc")
	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: nobody joins on the spent invite")
	assert.False(t, rig.mini.Exists(pointerKey(kaelen.ID)), "Brannoc is in no party")
}

// Whoever the switcher comes back as starts in no party: seated again, the arrival read
// (FS-NCC9J R6) shows them a party listing nobody, and the leader's party still lacks them.
func TestCharacterSwitch_NewCharacterStartsWithNoParty(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick() // both read on arrival, so a second read is what a new seat does
	switchCharacter(t, rig, kaelenConn, kaelenInbox)
	rig.tick() // the cache sees Kaelen seated nowhere

	brannoc := rig.characters.give(kaelen.ID, "archer", "Brannoc", 1, 0)
	sendEnterHub(rig.server, kaelenConn, map[string]interface{}{"characterId": brannoc.ID.String()})
	awaitParty(t, kaelenInbox, string(constants.ActionWorldEntered), "Brannoc")
	rig.tick()

	for {
		update := awaitParty(t, kaelenInbox, partyUpdateAction, "Brannoc")
		if update.Payload["reason"] == "left" {
			continue // the last update the switch sent, if it was still on its way
		}
		assert.Empty(t, memberIDsOf(t, update), "Brannoc is shown no party")
		break
	}
	assert.False(t, rig.mini.Exists(pointerKey(kaelen.ID)), "Brannoc has no pointer")
}

// A member who changes character while their party's ready check is open cancels it, left, naming
// them, as going back to the roster does (FS-BJNYC R10), with no tick needed; and is out of the
// party.
func TestCharacterSwitch_DuringAReadyCheck_CancelledLeft(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreeParty(t, rig)
	before := startSoloSessionCount(rig.server)
	sendEnter(rig.server, p.wrenConn)
	open := awaitReadyCheck(t, p.wrenInbox, "Wren")
	awaitReadyCheck(t, p.kaelenInbox, "Kaelen")
	awaitReadyCheck(t, p.marlInbox, "Marl")

	switchCharacter(t, rig.partyRig, p.marlConn, p.marlInbox)

	cancelled := awaitReadyOutcome(t, p.wrenInbox, "Wren", "cancelled")
	assert.Equal(t, open.checkID, cancelled.checkID)
	assert.Equal(t, "left", cancelled.reason)
	assert.Equal(t, []string{"Marl"}, cancelled.names)
	awaitUpdate(t, p.kaelenInbox, "left", p.marl.ID, "Kaelen")
	assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
}

// While the party's run is under way a character switch follows party_leave there: inside the run
// leave_hub is refused as before; back in the town early it is refused with the party lock's
// words. Either way they stay where they stand, and the party stands as it went down.
func TestCharacterSwitch_WhileThePartysRunIsUnderWay_Refused(t *testing.T) {
	for _, tt := range []struct {
		where string
		copy  string
	}{
		{where: "inside the run", copy: leaveHubInRunCopy},
		{where: "back in the town early", copy: notWhileDelvingCopy},
	} {
		t.Run(tt.where, func(t *testing.T) {
			rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
			p := newThreeParty(t, rig)
			intoItsRun(t, rig, p)
			if tt.where == "back in the town early" {
				backInTownEarly(t, rig, p.kaelen)
			}
			world, _ := rig.server.currentWorldOf(p.kaelen.ID)

			leaveHubSend(rig.server, p.kaelenConn)

			leaveHubAssertRefused(t, p.kaelenInbox, tt.copy)
			now, _ := rig.server.currentWorldOf(p.kaelen.ID)
			assert.Equal(t, world, now, "Kaelen stays where he stands")
			assertNoParty(t, p.wrenInbox, partyUpdateAction, "Wren: nobody left")
			party := partyInRedis(t, rig, p.wren.ID)
			assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(party), "the party stands as it went down")
		})
	}
}

// A switch that goes nowhere changes nobody's party: a queued member's leave_hub is refused as
// before, and they stay in their party.
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
