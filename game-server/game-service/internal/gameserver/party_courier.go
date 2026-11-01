package gameserver

import (
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The party courier: everything a party sends to, or hears from, another pod, through the pod
* inbox (FS-R82NV R9, R10; FS-NCC9J R5, R11). It knows letters and pods, not party rules: the
* registry decides what to say, the courier gets it there. Only the hub's loop touches it.
**/

// remoteInvite is an invite this pod delivered to one of its players from another pod: remembered
// for its minute so the decline's notice can be sent back to the pod the inviter sent it from
// (I-R82NV-3 decision 5).
type remoteInvite struct {
	// the pod the inviter was on when they sent it: not the leader's pod once the lead passes
	inviterPod string
	target     uuid.UUID
	receivedAt time.Time
}

type partyCourier struct {
	// nil on a pod that reaches no other
	inbox  letterBox
	sender partySender
	podID  string
	now    func() time.Time
	jobs   loopJobs
	// told of a decline of one of this pod's invites, by letter
	onDeclined func(partyID, inviteID, leader uuid.UUID, targetName string)

	// invites delivered here from other pods
	remoteInvites map[uuid.UUID]remoteInvite
}

func newPartyCourier(inbox letterBox, sender partySender, podID string, now func() time.Time, jobs loopJobs) *partyCourier {
	return &partyCourier{
		inbox:         inbox,
		sender:        sender,
		podID:         podID,
		now:           now,
		jobs:          jobs,
		remoteInvites: make(map[uuid.UUID]remoteInvite),
	}
}

// open reports whether this pod can write to other pods' inboxes at all.
func (c *partyCourier) open() bool { return c.inbox != nil && c.inbox.open() }

// sendInvite sends an invite prompt to a player on targetPod; failed runs on the loop if the
// letter could not be published.
func (c *partyCourier) sendInvite(targetPod string, targetID uuid.UUID, prompt map[string]interface{}, failed func()) {
	payload := make(map[string]interface{}, len(prompt)+1)
	for k, v := range prompt {
		payload[k] = v
	}
	payload["inviter_pod_id"] = c.podID
	c.inbox.send(targetPod, letter{Kind: letterPartyInvite, ToPlayerID: targetID.String(), Payload: payload}, func() {
		c.jobs.postOrDrop(failed)
	})
}

// fromThere is where a delivered invite came from, if it came from another pod to decliner.
func (c *partyCourier) fromThere(inviteID, decliner uuid.UUID) (string, bool) {
	remote, held := c.remoteInvites[inviteID]
	if !held || remote.target != decliner {
		return "", false
	}
	return remote.inviterPod, true
}

// declineThere tells the pod that sent the invite it was declined, so its leader hears.
func (c *partyCourier) declineThere(inviterPod string, inviteID uuid.UUID, res partystore.DeclineResult) {
	delete(c.remoteInvites, inviteID)
	if c.inbox == nil {
		return
	}
	c.inbox.send(inviterPod, letter{Kind: letterPartyReply, Payload: map[string]interface{}{
		"invite_id": inviteID.String(),
		"party_id":  res.Party.ID.String(),
		"leader_id": res.Party.Leader.String(),
		"name":      res.TargetName,
		"declined":  true,
	}}, func() {
		slog.Warn("party decline not sent back", "invite_id", inviteID)
	})
}

// tick forgets each delivered invite once its minute is up.
func (c *partyCourier) tick() {
	at := c.now()
	for id, remote := range c.remoteInvites {
		if at.Sub(remote.receivedAt) >= partystore.InviteTTL {
			delete(c.remoteInvites, id)
		}
	}
}

// letters is where letters from other pods wait for the hub's loop.
func (c *partyCourier) letters() <-chan letter {
	if c.inbox == nil {
		return nil
	}
	return c.inbox.letters()
}

// receive handles one letter from another pod: an invite for a player this pod holds is delivered
// to them, a decline of one of this pod's invites is handed to onDeclined. A letter for a player
// not here is dropped.
func (c *partyCourier) receive(l letter) {
	switch l.Kind {
	case letterPartyInvite:
		c.receiveInvite(l)
	case letterPartyReply:
		c.receiveReply(l)
	default:
		slog.Debug("pod inbox letter of an unknown kind dropped", "kind", l.Kind)
	}
}

func (c *partyCourier) receiveInvite(l letter) {
	target, err := uuid.Parse(l.ToPlayerID)
	id, idOK := inviteIDOf(l.Payload)
	inviterPod, _ := l.Payload["inviter_pod_id"].(string)
	if err != nil || !idOK || inviterPod == "" {
		slog.Warn("pod inbox invite skipped: incomplete")
		return
	}
	shown := make(map[string]interface{}, len(l.Payload))
	for k, v := range l.Payload {
		if k != "inviter_pod_id" {
			shown[k] = v
		}
	}
	if err := c.sender.SendMessageToPlayer(target, types.Message{Action: string(constants.ActionPartyInvite), Payload: shown}); err != nil {
		slog.Debug("pod inbox invite dropped: player not here", "player_id", target, "error", err)
		return
	}
	c.remoteInvites[id] = remoteInvite{inviterPod: inviterPod, target: target, receivedAt: c.now()}
}

func (c *partyCourier) receiveReply(l letter) {
	if declined, _ := l.Payload["declined"].(bool); !declined {
		return
	}
	inviteID, ok := inviteIDOf(l.Payload)
	if !ok {
		return
	}
	rawParty, _ := l.Payload["party_id"].(string)
	rawLeader, _ := l.Payload["leader_id"].(string)
	name, _ := l.Payload["name"].(string)
	partyID, partyErr := uuid.Parse(rawParty)
	leader, leaderErr := uuid.Parse(rawLeader)
	if partyErr != nil || leaderErr != nil {
		slog.Warn("pod inbox reply skipped: incomplete")
		return
	}
	c.onDeclined(partyID, inviteID, leader, name)
}

// inviteIDOf is the invite id an answer names, if it names one.
func inviteIDOf(payload map[string]interface{}) (uuid.UUID, bool) {
	raw, _ := payload["invite_id"].(string)
	id, err := uuid.Parse(raw)
	return id, err == nil
}
