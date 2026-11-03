package gameserver

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The party courier: everything a party sends to, or hears from, another pod, through the pod
* inbox (FS-R82NV R9, R10; FS-NCC9J R5, R11). It knows letters and pods, not party rules: the
* registry decides what to say and to whom, the courier gets it there. Only the hub's loop touches
* it.
*
* Five letters: an invite for a player on that pod; a party_update for the members it holds,
* carrying the party as Redis answered so that pod's cache takes it too; a party_notice for one
* player there; a party_chat line for the members it holds (FS-XGW7H R10, in chat_party.go); and
* a whisper for one player there (FS-KCQ06 R8, in chat_whisper.go).
**/

// partyUpdateLetter is a party_update as it travels between pods: the party as Redis answered it,
// for the receiving pod's cache, and the update the addressed players there are shown.
type partyUpdateLetter struct {
	Party partystore.Party `json:"party"`
	// the change ended the party: the receiving pod lets it go
	Ended bool `json:"ended"`
	// a removed player's final update: told whatever its age
	Final   bool                   `json:"final"`
	To      []uuid.UUID            `json:"to"`
	Message map[string]interface{} `json:"message"`
}

// playerSender is how the courier reaches a player this pod holds.
type playerSender interface {
	SendMessageToPlayer(playerID uuid.UUID, msg types.Message) error
}

type partyCourier struct {
	// nil on a pod that reaches no other
	inbox  letterBox
	sender playerSender
	jobs   loopJobs
	// this pod: a player present here is told directly, never by letter
	podID string
	// told of each party_update letter that arrives
	onUpdate func(l partyUpdateLetter)
	// told of each party_chat letter that arrives, its addressees and its line (FS-XGW7H R13)
	onChat func(to []uuid.UUID, message map[string]interface{})
	// told of each whisper letter that arrives, its addressee and its line (FS-KCQ06 R8)
	onWhisper func(to uuid.UUID, message map[string]interface{})
}

func newPartyCourier(inbox letterBox, sender playerSender, jobs loopJobs, podID string, onUpdate func(partyUpdateLetter), onChat func(to []uuid.UUID, message map[string]interface{})) *partyCourier {
	return &partyCourier{inbox: inbox, sender: sender, jobs: jobs, podID: podID, onUpdate: onUpdate, onChat: onChat}
}

// tell gets an update to each recipient: those present here directly, and each other pod that
// presence says holds any of the rest one letter addressed to them. A recipient present nowhere is
// offline and hears nothing (FS-NCC9J R5). It returns the players here it told.
func (c *partyCourier) tell(recipients []uuid.UUID, here map[uuid.UUID]types.WorldType, where map[uuid.UUID]partypresence.Found, l partyUpdateLetter) map[uuid.UUID]struct{} {
	msg := types.Message{Action: string(constants.ActionPartyUpdate), Payload: l.Message}
	letters := make(map[string][]uuid.UUID)
	told := make(map[uuid.UUID]struct{})
	for _, id := range recipients {
		if _, present := here[id]; present {
			if err := c.sender.SendMessageToPlayer(id, msg); err != nil {
				slog.Warn("party update not delivered", "party_id", l.Party.ID, "player_id", id, "error", err)
			} else {
				told[id] = struct{}{}
			}
			continue
		}
		if found, present := where[id]; present && found.PodID != c.podID {
			letters[found.PodID] = append(letters[found.PodID], id)
		}
	}
	for podID, to := range letters {
		l.To = to
		c.sendUpdate(podID, l)
	}
	return told
}

// noticeAt sends a party_notice to a player on the pod presence found them on; one found on this
// pod is no longer here, and the notice is dropped.
func (c *partyCourier) noticeAt(found partypresence.Found, code constants.PartyNoticeCode, name string) {
	if found.PodID == c.podID {
		slog.Debug("party notice for a player gone from this pod dropped", "code", code, "player_id", found.PlayerID)
		return
	}
	c.sendNotice(found.PodID, found.PlayerID, code, name)
}

// open reports whether this pod can write to other pods' inboxes at all.
func (c *partyCourier) open() bool { return c.inbox != nil && c.inbox.open() }

// sendInvite sends an invite prompt to a player on podID; failed runs on the loop if the letter
// could not be published, waiting for room there rather than being dropped, so the leader is
// always told (I-R82NV-3 review). ctx is the pod's: the wait ends with it.
func (c *partyCourier) sendInvite(ctx context.Context, podID string, targetID uuid.UUID, prompt map[string]interface{}, failed func()) {
	c.inbox.send(podID, letter{Kind: letterPartyInvite, ToPlayerID: targetID.String(), Payload: prompt}, func() {
		c.jobs.post(ctx, failed)
	})
}

// sendUpdate sends podID a party_update letter. One that cannot be published is only logged: that
// pod's cache, and its players, catch up on its next re-read (I-NCC9J-3 review).
func (c *partyCourier) sendUpdate(podID string, l partyUpdateLetter) {
	raw, err := json.Marshal(l)
	var payload map[string]interface{}
	if err == nil {
		err = json.Unmarshal(raw, &payload)
	}
	if err != nil {
		slog.Warn("party update letter not built", "party_id", l.Party.ID, "error", err)
		return
	}
	c.inbox.send(podID, letter{Kind: letterPartyUpdate, Payload: payload}, func() {
		slog.Warn("party update letter not sent", "party_id", l.Party.ID, "pod_id", podID)
	})
}

// sendNotice sends a party_notice to one player on podID.
func (c *partyCourier) sendNotice(podID string, playerID uuid.UUID, code constants.PartyNoticeCode, name string) {
	c.inbox.send(podID, letter{Kind: letterPartyNotice, ToPlayerID: playerID.String(), Payload: map[string]interface{}{
		"code": string(code),
		"name": name,
	}}, func() {
		slog.Warn("party notice letter not sent", "code", code, "pod_id", podID)
	})
}

// letters is where letters from other pods wait for the hub's loop.
func (c *partyCourier) letters() <-chan letter {
	if c.inbox == nil {
		return nil
	}
	return c.inbox.letters()
}

// receive handles one letter from another pod. A letter for a player not here is dropped.
func (c *partyCourier) receive(l letter) {
	switch l.Kind {
	case letterPartyInvite:
		c.receiveInvite(l)
	case letterPartyUpdate:
		c.receiveUpdate(l)
	case letterPartyNotice:
		c.receiveNotice(l)
	case letterPartyChat:
		c.receivePartyChat(l)
	case letterWhisper:
		c.receiveWhisper(l)
	default:
		slog.Debug("pod inbox letter of an unknown kind dropped", "kind", l.Kind)
	}
}

func (c *partyCourier) receiveInvite(l letter) {
	target, err := uuid.Parse(l.ToPlayerID)
	if _, idOK := inviteIDOf(l.Payload); err != nil || !idOK {
		slog.Warn("pod inbox invite skipped: incomplete")
		return
	}
	if err := c.sender.SendMessageToPlayer(target, types.Message{Action: string(constants.ActionPartyInvite), Payload: l.Payload}); err != nil {
		slog.Debug("pod inbox invite dropped: player not here", "player_id", target, "error", err)
	}
}

func (c *partyCourier) receiveUpdate(l letter) {
	raw, err := json.Marshal(l.Payload)
	var update partyUpdateLetter
	if err == nil {
		err = json.Unmarshal(raw, &update)
	}
	if err != nil || update.Party.ID == uuid.Nil || update.Message == nil {
		slog.Warn("pod inbox party update skipped: incomplete", "error", err)
		return
	}
	c.onUpdate(update)
}

func (c *partyCourier) receiveNotice(l letter) {
	target, err := uuid.Parse(l.ToPlayerID)
	code, _ := l.Payload["code"].(string)
	if err != nil || code == "" {
		slog.Warn("pod inbox party notice skipped: incomplete")
		return
	}
	name, _ := l.Payload["name"].(string)
	if err := c.sender.SendMessageToPlayer(target, partyNotice(constants.PartyNoticeCode(code), name)); err != nil {
		slog.Debug("pod inbox party notice dropped: player not here", "player_id", target, "error", err)
	}
}

// inviteIDOf is the invite id an answer names, if it names one.
func inviteIDOf(payload map[string]interface{}) (uuid.UUID, bool) {
	raw, _ := payload["invite_id"].(string)
	id, err := uuid.Parse(raw)
	return id, err == nil
}
