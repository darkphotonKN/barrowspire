package gameserver

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* The party registry: every party whose party pod is this one, and the invites
* they have out. It runs on the message hub's loop, like the chat relay, so
* nothing in it needs a lock (FS-R82NV §Requirements 2). Nothing in it is
* stored: Redis holds only pointers to it (R3, R6).
*
* It depends on two narrow things, where this pod's players stand, and how a
* message reaches a player, so the cross-pod paths (the presence index, the pod
* inbox) replace only those when they arrive.
**/

// partyDirectory answers where this pod's players stand: who a name or player
// id is among the hub, whether a player is seated there, whether they are
// queued for the Spire. FS-R82NV §Requirements 12 (same pod; the presence
// index answers across pods), 16.
type partyDirectory interface {
	HubSeatedPlayer(nameOrID string) (types.Player, bool)
	InHub(playerID uuid.UUID) bool
	// how many are seated in this pod's hub, the count its cap is held to (FS-JEAVX)
	HubOccupancy() int
	IsQueued(ctx context.Context, playerID uuid.UUID) (bool, error)
}

// partyPointers is the Redis side of a party: the pointers other pods follow to
// it (FS-R82NV R3). partypointer.Redis in production.
type partyPointers interface {
	Point(ctx context.Context, partyID uuid.UUID, podID string, members []uuid.UUID) error
	ForgetParty(ctx context.Context, partyID uuid.UUID, members []uuid.UUID) error
	ForgetPlayers(ctx context.Context, players []uuid.UUID) error
	// whether a player is in a live party anywhere, and its pod (R3, R12)
	PartyPodOf(ctx context.Context, playerID uuid.UUID) (string, bool, error)
}

// presenceLookup finds a player seated in any pod's hub: partypresence.Redis in production (R7).
type presenceLookup interface {
	Lookup(ctx context.Context, nameOrID string) (partypresence.Found, bool, error)
}

// letterBox is how letters reach other pods' inboxes (R9, R10).
type letterBox interface {
	open() bool
	send(podID string, l letter, failed func())
	letters() <-chan letter
}

// partySender is how party messages reach players: a notice to the asking
// connection, a prompt or an update to a player by id.
type partySender interface {
	SendMessageToConn(conn *websocket.Conn, msg types.Message) error
	SendMessageToPlayer(playerID uuid.UUID, msg types.Message) error
}

// party is one party on this pod. FS-R82NV §Requirements 1.
type party struct {
	id        uuid.UUID
	leader    uuid.UUID
	members   []partyMember // join order
	createdAt time.Time
}

// partyMember is a member as the party shows them: who, and since when.
type partyMember struct {
	playerID uuid.UUID
	name     string
	class    string
	joinedAt time.Time
}

// partyInvite is an invite this pod's party has out, awaiting its target.
// FS-R82NV §Requirements 14.
type partyInvite struct {
	id      uuid.UUID
	partyID uuid.UUID
	target  uuid.UUID
	// the target's character name, for the notices that answer the inviter
	targetName string
	// the pod the target was found on; "" when seated in this hub
	targetPod string
	sentAt    time.Time
}

// remoteInvite is an invite this pod delivered to one of its players for a party on another
// pod: remembered for its minute so a decline can be sent back there (I-R82NV-3 decision 5).
type remoteInvite struct {
	partyPod   string
	target     uuid.UUID
	receivedAt time.Time
}

// partyInviteTTL is how long an invite stays open. FS-R82NV R14.
const partyInviteTTL = 60 * time.Second

// partyTickInterval is how often the registry sweeps its invites: an invite lapses
// within this much of its minute.
const partyTickInterval = time.Second

// defaultPartySize is the party cap when the pod is given none. FS-R82NV R8.
const defaultPartySize = 2

// partyRefreshInterval is how often the pod writes its parties' pointers again,
// a third of their TTL. FS-R82NV R3.
const partyRefreshInterval = 10 * time.Second

// partyDissolveTimeout bounds deleting every pointer at shutdown; whatever is
// not deleted by then lapses by TTL.
const partyDissolveTimeout = 2 * time.Second

// partyRegistryConfig is what a registry is built from.
type partyRegistryConfig struct {
	// this pod: what a party's pointer names, and where an invitee reconnects
	podID   string
	podAddr string
	// the most members a party may hold, pending accepts counted (R8, R12)
	size int
	// what parties and invites are stamped with
	now   func() time.Time
	newID func() uuid.UUID
	// when the hub's loop sweeps the registry; nil, never
	ticks <-chan time.Time
	// where the pointers are written; nil on a pod built without Redis
	pointers partyPointers
	// the pod's ordered Redis writer the pointer writes go through (redis_writer.go)
	writer *orderedWriter
	// the presence index invites look targets up in, and the inbox they reach other pods by;
	// nil on a pod that reaches no other
	presence presenceLookup
	inbox    letterBox
}

// partyRegistry holds this pod's parties. Only the hub's loop touches its maps.
type partyRegistry struct {
	directory partyDirectory
	sender    partySender
	cfg       partyRegistryConfig

	parties  map[uuid.UUID]*party
	memberOf map[uuid.UUID]uuid.UUID // player id → party id
	invites  map[uuid.UUID]*partyInvite
	// invites whose party ended before they were answered, kept until their minute is up so an
	// accept hears party_gone rather than nothing (I-R82NV-2 decision 3)
	goneInvites map[uuid.UUID]*partyInvite
	// invites for parties on other pods, delivered here to their targets
	remoteInvites map[uuid.UUID]remoteInvite
	// work finished off the loop and handed back to it (a lookup's answer, a failed letter)
	work chan func()

	// when the pointers were last written in full
	lastRefresh time.Time
	// set once every party is dissolved at shutdown: party actions are ignored
	// from then on, since a party formed now would end with the pod
	closed bool
	// closed once every party is dissolved at shutdown
	dissolved chan struct{}
}

func newPartyRegistry(directory partyDirectory, sender partySender, cfg partyRegistryConfig) *partyRegistry {
	if cfg.writer == nil {
		cfg.writer = newOrderedWriter()
	}
	return &partyRegistry{
		directory: directory,
		sender:    sender,
		cfg:       cfg,

		parties:  make(map[uuid.UUID]*party),
		memberOf: make(map[uuid.UUID]uuid.UUID),
		invites:  make(map[uuid.UUID]*partyInvite),

		goneInvites:   make(map[uuid.UUID]*partyInvite),
		remoteInvites: make(map[uuid.UUID]remoteInvite),
		work:          make(chan func(), partyWorkBuffer),
		lastRefresh:   cfg.now(),
		dissolved:     make(chan struct{}),
	}
}

// point queues writing p's pointers: on a change, and at every refresh.
func (r *partyRegistry) point(p *party) {
	if r.cfg.pointers == nil {
		return
	}
	partyID, members := p.id, p.memberIDs()
	r.cfg.writer.queue(func(ctx context.Context) error {
		return r.cfg.pointers.Point(ctx, partyID, r.cfg.podID, members)
	})
}

// memberIDs are the party's members' player ids, in join order.
func (p *party) memberIDs() []uuid.UUID {
	ids := make([]uuid.UUID, len(p.members))
	for i, m := range p.members {
		ids[i] = m.playerID
	}
	return ids
}

// dissolveAll ends every party on this pod as it shuts down: each member is
// told with a final party_update (reason dissolved), the invites go with their
// parties, and every pointer is deleted here, on this goroutine, once the
// writer has stopped with the pod. ctx is the pod's, already ended: its values
// are kept, its cancellation is not. Called once, on the hub's loop. FS-R82NV R5.
func (r *partyRegistry) dissolveAll(ctx context.Context) {
	defer close(r.dissolved)
	r.closed = true

	// each member's final update: the party with nobody left, about them (R21)
	for _, p := range r.parties {
		for _, member := range p.memberIDs() {
			final := partyUpdate(p.id, p.leader, nil, r.cfg.size, constants.PartyUpdateDissolved, member)
			if err := r.sender.SendMessageToPlayer(member, final); err != nil {
				slog.Warn("final party update not delivered", "party_id", p.id, "player_id", member, "error", err)
			}
		}
	}

	if r.cfg.pointers != nil {
		deleteCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), partyDissolveTimeout)
		defer cancel()
		if r.cfg.writer.running() {
			// after any write the writer was in the middle of
			select {
			case <-r.cfg.writer.stopped():
			case <-deleteCtx.Done():
			}
		}
		for _, p := range r.parties {
			if err := r.cfg.pointers.ForgetParty(deleteCtx, p.id, p.memberIDs()); err != nil {
				slog.Warn("party pointers left to lapse at shutdown", "party_id", p.id, "error", err)
			}
		}
	}
	r.parties = make(map[uuid.UUID]*party)
	r.memberOf = make(map[uuid.UUID]uuid.UUID)
	r.invites = make(map[uuid.UUID]*partyInvite)
	r.goneInvites = make(map[uuid.UUID]*partyInvite)
	r.remoteInvites = make(map[uuid.UUID]remoteInvite)
}

// partyWorkBuffer is how much finished work may wait for the hub's loop.
const partyWorkBuffer = 64

// jobs is where work finished off the loop waits for it: the loop runs each.
func (r *partyRegistry) jobs() <-chan func() { return r.work }

// post hands work back to the loop, waiting for room unless the pod is going.
func (r *partyRegistry) post(ctx context.Context, job func()) {
	select {
	case r.work <- job:
	case <-ctx.Done():
	}
}

// postOrDrop hands work back to the loop if there is room; a full queue drops it.
func (r *partyRegistry) postOrDrop(job func()) {
	select {
	case r.work <- job:
	default:
		slog.Warn("party work dropped: hub loop behind")
	}
}

// stopped closes once dissolveAll has run.
func (r *partyRegistry) stopped() <-chan struct{} {
	return r.dissolved
}

// invite handles party_invite from inviter on conn: refused with a notice, or
// delivered to the target, the inviter's party created first if they have none.
// A target seated in this hub is answered at once; anyone else is looked up in
// the presence index off the loop, and the answer finishes the invite back on
// it (I-R82NV-3 decision 2). FS-R82NV §Requirements 4, 11–14.
func (r *partyRegistry) invite(ctx context.Context, inviter *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	// trimmed here, case-folded wherever a name is compared (Edge States "Name with different case")
	raw, _ := payload["name"].(string)
	name := strings.TrimSpace(raw)

	refusal := r.leadRefusal(inviter)
	if refusal == nil && r.queued(ctx, inviter.ID) {
		refusal = &inviteRefusal{code: constants.PartyNoticeQueued}
	}
	if refusal == nil {
		refusal = r.roomRefusal(inviter, name)
	}
	if refusal != nil {
		r.refuseInvite(conn, inviter.ID, refusal)
		return
	}

	if target, here := r.directory.HubSeatedPlayer(name); here {
		if refusal := r.targetRefusal(inviter, target.ID, target.Character.Name); refusal != nil {
			r.refuseInvite(conn, inviter.ID, refusal)
			return
		}
		r.inviteHere(inviter, conn, target)
		return
	}
	if r.cfg.presence == nil || r.cfg.inbox == nil || !r.cfg.inbox.open() {
		r.refuseInvite(conn, inviter.ID, &inviteRefusal{code: constants.PartyNoticeNotFound, name: name})
		return
	}
	go r.lookUp(ctx, inviter, conn, name)
}

// inviteHere delivers an invite to a target seated in this hub: delivered first,
// kept after, so an invite nobody saw forms no party and holds no place (code
// review 2026-11-01).
func (r *partyRegistry) inviteHere(inviter *types.Player, conn *websocket.Conn, target types.Player) {
	at := r.cfg.now()
	p, formed := r.partyLedBy(inviter, at)
	inv := &partyInvite{id: r.cfg.newID(), partyID: p.id, target: target.ID, targetName: target.Character.Name, sentAt: at}

	if err := r.sender.SendMessageToPlayer(target.ID, types.Message{
		Action:  string(constants.ActionPartyInvite),
		Payload: r.invitePayload(inv, p, inviter),
	}); err != nil {
		slog.Warn("party invite not delivered", "party_id", p.id, "target_id", target.ID, "error", err)
		r.notice(conn, constants.PartyNoticeDeliveryFailed, target.Character.Name)
		return
	}

	if formed {
		r.form(p)
	}
	r.invites[inv.id] = inv
	r.notice(conn, constants.PartyNoticeSent, target.Character.Name)
}

// invitePayload is what the target's client is shown (R13).
func (r *partyRegistry) invitePayload(inv *partyInvite, p *party, inviter *types.Player) map[string]interface{} {
	return map[string]interface{}{
		"invite_id":      inv.id.String(),
		"party_id":       p.id.String(),
		"party_pod_addr": r.cfg.podAddr,
		"leader_name":    inviter.Character.Name,
		"member_count":   len(p.members),
		"size":           r.cfg.size,
		"expires_at":     inv.sentAt.Add(partyInviteTTL).UTC().Format(time.RFC3339),
	}
}

// partyLookupTimeout bounds the presence and pointer reads behind one invite.
const partyLookupTimeout = 2 * time.Second

// lookedUp is what Redis said about an invite's target, read off the loop.
type lookedUp struct {
	found   partypresence.Found
	present bool
	grouped bool
	err     error
}

// lookUp reads the target's presence and party pointer off the loop, then hands
// the answer back to it. Runs on its own goroutine.
func (r *partyRegistry) lookUp(ctx context.Context, inviter *types.Player, conn *websocket.Conn, name string) {
	readCtx, cancel := context.WithTimeout(ctx, partyLookupTimeout)
	defer cancel()

	var res lookedUp
	res.found, res.present, res.err = r.cfg.presence.Lookup(readCtx, name)
	if res.err == nil && res.present && r.cfg.pointers != nil {
		_, res.grouped, res.err = r.cfg.pointers.PartyPodOf(readCtx, res.found.PlayerID)
	}
	r.post(ctx, func() { r.inviteThere(inviter, conn, name, res) })
}

// inviteThere finishes an invite whose target was looked up: the inviter's
// standing is checked again, since the loop went on while Redis answered, then
// the rest of R12's list, then the invite goes to the target's pod inbox.
// FS-R82NV §Requirements 12, 13.
func (r *partyRegistry) inviteThere(inviter *types.Player, conn *websocket.Conn, name string, res lookedUp) {
	if r.closed {
		return
	}
	if res.err != nil {
		slog.Warn("party invite lookup failed", "player_id", inviter.ID, "error", res.err)
		r.refuseInvite(conn, inviter.ID, &inviteRefusal{code: constants.PartyNoticeDeliveryFailed, name: name})
		return
	}
	refusal := r.leadRefusal(inviter)
	if refusal == nil {
		refusal = r.roomRefusal(inviter, name)
	}
	// seated nowhere, or on this pod but out of its hub since the index was written
	if refusal == nil && (!res.present || res.found.PodID == r.cfg.podID) {
		refusal = &inviteRefusal{code: constants.PartyNoticeNotFound, name: name}
	}
	if refusal == nil && res.grouped {
		refusal = &inviteRefusal{code: constants.PartyNoticeAlreadyInParty, name: res.found.Name}
	}
	if refusal == nil {
		refusal = r.targetRefusal(inviter, res.found.PlayerID, res.found.Name)
	}
	if refusal != nil {
		r.refuseInvite(conn, inviter.ID, refusal)
		return
	}

	at := r.cfg.now()
	p, formed := r.partyLedBy(inviter, at)
	if formed {
		r.form(p)
	}
	inv := &partyInvite{id: r.cfg.newID(), partyID: p.id, target: res.found.PlayerID, targetName: res.found.Name, targetPod: res.found.PodID, sentAt: at}
	r.invites[inv.id] = inv

	payload := r.invitePayload(inv, p, inviter)
	payload["party_pod_id"] = r.cfg.podID
	inviteID := inv.id
	r.cfg.inbox.send(res.found.PodID, letter{Kind: letterPartyInvite, ToPlayerID: res.found.PlayerID.String(), Payload: payload}, func() {
		r.postOrDrop(func() { r.undelivered(inviteID) })
	})
	r.notice(conn, constants.PartyNoticeSent, res.found.Name)
}

// undelivered lets go of an invite whose letter was never published, telling
// whoever leads now. FS-R82NV R10.
func (r *partyRegistry) undelivered(inviteID uuid.UUID) {
	inv, open := r.invites[inviteID]
	if !open {
		return
	}
	delete(r.invites, inviteID)
	r.noticeLeader(inv, constants.PartyNoticeDeliveryFailed)
}

// inviteRefusal is why an invite was not sent, and the player it concerns for
// the client's copy (R36): "" when it is about the inviter themselves.
type inviteRefusal struct {
	code constants.PartyNoticeCode
	name string
}

func (r *partyRegistry) refuseInvite(conn *websocket.Conn, inviterID uuid.UUID, refusal *inviteRefusal) {
	slog.Debug("party invite refused", "player_id", inviterID, "code", refusal.code)
	r.notice(conn, refusal.code, refusal.name)
}

// leadRefusal is the inviter's own standing (R11, R12): seated in the hub, and
// leading their party if they have one. Checked first, since naming someone
// cannot cure it.
func (r *partyRegistry) leadRefusal(inviter *types.Player) *inviteRefusal {
	if !r.directory.InHub(inviter.ID) {
		return &inviteRefusal{code: constants.PartyNoticeNotInHub}
	}
	if p, inParty := r.partyOf(inviter.ID); inParty && p.leader != inviter.ID {
		return &inviteRefusal{code: constants.PartyNoticeNotLeader}
	}
	return nil
}

// roomRefusal is the head of R12's list, which needs no target: a full party,
// and naming yourself.
func (r *partyRegistry) roomRefusal(inviter *types.Player, name string) *inviteRefusal {
	// a player with no party would lead one of one, never full at size two or more
	if p, inParty := r.partyOf(inviter.ID); inParty && len(p.members)+r.pendingFor(p.id) >= r.cfg.size {
		return &inviteRefusal{code: constants.PartyNoticePartyFull}
	}
	if strings.EqualFold(name, inviter.Character.Name) || strings.EqualFold(name, inviter.ID.String()) {
		return &inviteRefusal{code: constants.PartyNoticeSelf}
	}
	return nil
}

// targetRefusal is the tail of R12's list for a found target: in a party here,
// no room on this pod for one more arrival, or already asked.
func (r *partyRegistry) targetRefusal(inviter *types.Player, targetID uuid.UUID, targetName string) *inviteRefusal {
	if _, grouped := r.memberOf[targetID]; grouped {
		return &inviteRefusal{code: constants.PartyNoticeAlreadyInParty, name: targetName}
	}
	// a target seated in this hub already holds a seat here (I-R82NV-1 decision 2);
	// one from another pod needs a seat, as does every arrival already invited
	if _, here := r.directory.HubSeatedPlayer(targetID.String()); !here &&
		r.directory.HubOccupancy()+r.pendingArrivals() >= constants.HubOccupancyCap {
		return &inviteRefusal{code: constants.PartyNoticePodFull}
	}
	if p, inParty := r.partyOf(inviter.ID); inParty && r.inviteOpenTo(p.id, targetID) {
		return &inviteRefusal{code: constants.PartyNoticePending, name: targetName}
	}
	return nil
}

// pendingArrivals counts open invites to players on other pods: each would take
// a hub seat here on arrival (R12 pod_full).
func (r *partyRegistry) pendingArrivals() int {
	n := 0
	for _, inv := range r.invites {
		if inv.targetPod != "" && inv.targetPod != r.cfg.podID {
			n++
		}
	}
	return n
}

// partyOf is the party player is a member of, if any.
func (r *partyRegistry) partyOf(playerID uuid.UUID) (*party, bool) {
	id, in := r.memberOf[playerID]
	if !in {
		return nil, false
	}
	return r.parties[id], true
}

// pendingFor counts the party's open invites: each holds a place (R12).
func (r *partyRegistry) pendingFor(partyID uuid.UUID) int {
	n := 0
	for _, inv := range r.invites {
		if inv.partyID == partyID {
			n++
		}
	}
	return n
}

// inviteOpenTo reports whether the party has an open invite to target.
func (r *partyRegistry) inviteOpenTo(partyID, target uuid.UUID) bool {
	for _, inv := range r.invites {
		if inv.partyID == partyID && inv.target == target {
			return true
		}
	}
	return false
}

// queued reports whether player is in the Spire queue. An unreadable queue is
// not one they are in, as start_solo already treats it.
func (r *partyRegistry) queued(ctx context.Context, playerID uuid.UUID) bool {
	readCtx, cancel := context.WithTimeout(ctx, queueReadTimeout)
	defer cancel()
	queued, err := r.directory.IsQueued(readCtx, playerID)
	if err != nil {
		slog.Warn("Could not read queue entry for a party action, treating as not queued", "player_id", playerID, "error", err)
	}
	return queued
}

// accept handles party_accept from the invite's target. On the party pod itself
// the target is added at once, with no handoff. FS-R82NV §Requirements 16, 17.
func (r *partyRegistry) accept(ctx context.Context, accepter *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	inv, open := r.openInviteFor(accepter.ID, payload)
	if !open {
		if r.goneInviteFor(accepter.ID, payload) {
			slog.Debug("party accept refused", "player_id", accepter.ID, "code", constants.PartyNoticePartyGone)
			r.notice(conn, constants.PartyNoticePartyGone, "")
		}
		return
	}
	if refusal := r.joinRefusal(ctx, accepter); refusal != "" {
		// the invite stays open: they may accept once they can (R14)
		slog.Debug("party accept refused", "player_id", accepter.ID, "code", refusal)
		r.notice(conn, refusal, "")
		return
	}
	delete(r.invites, inv.id)
	r.voidInvitesTo(accepter.ID)

	p := r.parties[inv.partyID]
	p.members = append(p.members, partyMember{
		playerID: accepter.ID,
		name:     accepter.Character.Name,
		class:    accepter.Character.Class,
		joinedAt: r.cfg.now(),
	})
	r.memberOf[accepter.ID] = p.id
	r.point(p)

	r.update(p, constants.PartyUpdateJoined, accepter.ID)
}

// joinRefusal is why player cannot come into a party now, by accepting one
// (R16) or creating one (R4a), or "": not in the hub, already in a party,
// queued for the Spire, in that order.
func (r *partyRegistry) joinRefusal(ctx context.Context, player *types.Player) constants.PartyNoticeCode {
	if !r.directory.InHub(player.ID) {
		return constants.PartyNoticeNotInHub
	}
	if _, grouped := r.memberOf[player.ID]; grouped {
		return constants.PartyNoticeAlreadyInParty
	}
	if r.queued(ctx, player.ID) {
		return constants.PartyNoticeQueued
	}
	return ""
}

// voidInvitesTo spends every other invite to a player who just joined a party,
// telling each inviter why it is gone, so their place is freed at once rather
// than at the minute. FS-R82NV R17; Edge States "Concurrent".
func (r *partyRegistry) voidInvitesTo(target uuid.UUID) {
	for id, inv := range r.invites {
		if inv.target != target {
			continue
		}
		delete(r.invites, id)
		r.noticeLeader(inv, constants.PartyNoticeAlreadyInParty)
	}
}

// create handles party_create: the player leads a new party of one, formed
// as a first delivered invite forms one, and is told so. FS-R82NV R4a.
func (r *partyRegistry) create(ctx context.Context, creator *types.Player, conn *websocket.Conn) {
	if r.closed {
		return
	}
	if refusal := r.joinRefusal(ctx, creator); refusal != "" {
		r.refuse(conn, creator.ID, refusal)
		return
	}
	p, _ := r.partyLedBy(creator, r.cfg.now())
	r.form(p)
}

// leave handles party_leave: the member leaves and stays where they stand.
// FS-R82NV §Requirements 20.
func (r *partyRegistry) leave(ctx context.Context, leaver *types.Player, conn *websocket.Conn) {
	if r.closed {
		return
	}
	p, in := r.partyOf(leaver.ID)
	if !in {
		r.refuse(conn, leaver.ID, constants.PartyNoticeNotMember)
		return
	}
	if r.locked(ctx, p) {
		r.refuse(conn, leaver.ID, constants.PartyNoticeLocked)
		return
	}
	r.remove(p, leaver.ID, constants.PartyUpdateLeft)
}

// kick handles party_kick: the leader removes a member, who stays where they
// stand. FS-R82NV §Requirements 19.
func (r *partyRegistry) kick(ctx context.Context, leader *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	p, target, ok := r.leaderTargetOrRefuse(ctx, leader, conn, payload)
	if !ok {
		return
	}
	r.remove(p, target, constants.PartyUpdateKicked)
}

// transfer handles party_transfer: the leader hands the lead to a member.
// FS-R82NV §Requirements 19.
func (r *partyRegistry) transfer(ctx context.Context, leader *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	p, target, ok := r.leaderTargetOrRefuse(ctx, leader, conn, payload)
	if !ok {
		return
	}
	p.leader = target
	r.update(p, constants.PartyUpdateLeader, target)
}

// leaderTargetOrRefuse is the leader's party and the member payload's target_id
// names; or, having told the sender why not (R19), false. A leader naming
// themselves is ignored: the panel never offers it (I-R82NV-2 decision 4).
func (r *partyRegistry) leaderTargetOrRefuse(ctx context.Context, leader *types.Player, conn *websocket.Conn, payload map[string]interface{}) (*party, uuid.UUID, bool) {
	p, in := r.partyOf(leader.ID)
	if !in || p.leader != leader.ID {
		r.refuse(conn, leader.ID, constants.PartyNoticeNotLeader)
		return nil, uuid.Nil, false
	}
	if r.locked(ctx, p) {
		r.refuse(conn, leader.ID, constants.PartyNoticeLocked)
		return nil, uuid.Nil, false
	}
	raw, _ := payload["target_id"].(string)
	target, err := uuid.Parse(raw)
	if err != nil || !p.has(target) {
		r.refuse(conn, leader.ID, constants.PartyNoticeNotMember)
		return nil, uuid.Nil, false
	}
	if target == leader.ID {
		slog.Debug("party leader action naming the leader, ignored", "player_id", leader.ID)
		return nil, uuid.Nil, false
	}
	return p, target, true
}

// locked reports whether p is inside an instance, where leave, kick and
// transfer are refused. No party enters one yet: FS-BJNYC wires this, and may
// need ctx to ask the run.
func (r *partyRegistry) locked(_ context.Context, _ *party) bool {
	return false
}

// refuse answers a party action with why not, logged at Debug (R25).
func (r *partyRegistry) refuse(conn *websocket.Conn, playerID uuid.UUID, code constants.PartyNoticeCode) {
	slog.Debug("party action refused", "player_id", playerID, "code", code)
	r.notice(conn, code, "")
}

// has reports whether playerID is a member of p.
func (p *party) has(playerID uuid.UUID) bool {
	for _, m := range p.members {
		if m.playerID == playerID {
			return true
		}
	}
	return false
}

// remove takes playerID out of p, for reason. A leader who goes is succeeded at
// once by the earliest-joined member who remains (R22). The removed player gets
// their last update, the party without them, about them (R21); the rest hear
// why, then, if the lead passed, who leads.
func (r *partyRegistry) remove(p *party, playerID uuid.UUID, reason constants.PartyUpdateReason) {
	for i, m := range p.members {
		if m.playerID == playerID {
			p.members = append(p.members[:i], p.members[i+1:]...)
			break
		}
	}
	delete(r.memberOf, playerID)

	succeeded := p.leader == playerID && len(p.members) > 0
	if succeeded {
		// members are in join order: the first who remains joined earliest
		p.leader = p.members[0].playerID
	}

	final := partyUpdate(p.id, p.leader, p.members, r.cfg.size, reason, playerID)
	if err := r.sender.SendMessageToPlayer(playerID, final); err != nil {
		slog.Warn("final party update not delivered", "party_id", p.id, "player_id", playerID, "error", err)
	}
	if len(p.members) == 0 {
		r.end(p, playerID)
		return
	}
	r.forgetPlayer(playerID)
	r.update(p, reason, playerID)
	if succeeded {
		r.update(p, constants.PartyUpdateLeader, p.leader)
	}
}

// forgetPlayer queues deleting the pointer of a player who left a party that goes on.
func (r *partyRegistry) forgetPlayer(playerID uuid.UUID) {
	if r.cfg.pointers == nil {
		return
	}
	r.cfg.writer.queueMust(func(ctx context.Context) error {
		return r.cfg.pointers.ForgetPlayers(ctx, []uuid.UUID{playerID})
	})
}

// end lets go of a party whose last member, lastID, has gone: its pointers are
// deleted, and its open invites are kept as gone until their minute is up.
// FS-R82NV R3, R5.
func (r *partyRegistry) end(p *party, lastID uuid.UUID) {
	delete(r.parties, p.id)
	for id, inv := range r.invites {
		if inv.partyID == p.id {
			delete(r.invites, id)
			r.goneInvites[id] = inv
		}
	}
	if r.cfg.pointers == nil {
		return
	}
	partyID, members := p.id, []uuid.UUID{lastID}
	r.cfg.writer.queueMust(func(ctx context.Context) error {
		return r.cfg.pointers.ForgetParty(ctx, partyID, members)
	})
}

// decline handles party_decline from the invite's target: the invite is spent
// and the inviter told, by name. An unknown or spent id is ignored. FS-R82NV R15.
func (r *partyRegistry) decline(ctx context.Context, decliner *types.Player, payload map[string]interface{}) {
	inv, open := r.openInviteFor(decliner.ID, payload)
	if !open {
		r.declineThere(decliner, payload)
		return
	}
	delete(r.invites, inv.id)

	r.noticeLeader(inv, constants.PartyNoticeDeclined)
}

// ticks is when the hub's loop should call tick.
func (r *partyRegistry) ticks() <-chan time.Time {
	return r.cfg.ticks
}

// tick lapses every invite whose minute has passed, telling each inviter by
// name. The target's client closes its prompt on its own clock. FS-R82NV R14.
func (r *partyRegistry) tick() {
	at := r.cfg.now()
	// deletes a full queue deferred go first, ahead of this tick's writes
	r.cfg.writer.flush()
	for id, inv := range r.invites {
		if at.Sub(inv.sentAt) < partyInviteTTL {
			continue
		}
		delete(r.invites, id)
		r.noticeLeader(inv, constants.PartyNoticeExpired)
	}

	// a delivered remote invite is forgotten once its minute is up
	for id, remote := range r.remoteInvites {
		if at.Sub(remote.receivedAt) >= partyInviteTTL {
			delete(r.remoteInvites, id)
		}
	}

	// a gone invite is forgotten once its minute would have run out
	for id, inv := range r.goneInvites {
		if at.Sub(inv.sentAt) >= partyInviteTTL {
			delete(r.goneInvites, id)
		}
	}

	// the pointers are written again before they could lapse (R3)
	if at.Sub(r.lastRefresh) >= partyRefreshInterval {
		r.lastRefresh = at
		for _, p := range r.parties {
			r.point(p)
		}
	}
}

// declineThere sends a decline back to the pod whose party sent the invite, if
// this pod delivered it to decliner. FS-R82NV R15.
func (r *partyRegistry) declineThere(decliner *types.Player, payload map[string]interface{}) {
	id, ok := inviteIDOf(payload)
	if !ok {
		return
	}
	remote, held := r.remoteInvites[id]
	if !held || remote.target != decliner.ID || r.cfg.inbox == nil {
		return
	}
	delete(r.remoteInvites, id)
	r.cfg.inbox.send(remote.partyPod, letter{Kind: letterPartyReply, Payload: map[string]interface{}{
		"invite_id": id.String(),
		"declined":  true,
	}}, func() {
		slog.Warn("party decline not sent back", "invite_id", id)
	})
}

// letters is where letters from other pods wait for the hub's loop.
func (r *partyRegistry) letters() <-chan letter {
	if r.cfg.inbox == nil {
		return nil
	}
	return r.cfg.inbox.letters()
}

// receive handles one letter from another pod (R9, R13, R15): an invite for a
// player this pod holds is delivered to them, a reply to one of this pod's
// invites is answered. A letter for a player not here is dropped.
func (r *partyRegistry) receive(l letter) {
	switch l.Kind {
	case letterPartyInvite:
		r.receiveInvite(l)
	case letterPartyReply:
		r.receiveReply(l)
	default:
		slog.Debug("pod inbox letter of an unknown kind dropped", "kind", l.Kind)
	}
}

func (r *partyRegistry) receiveInvite(l letter) {
	target, err := uuid.Parse(l.ToPlayerID)
	id, idOK := inviteIDOf(l.Payload)
	partyPod, _ := l.Payload["party_pod_id"].(string)
	if err != nil || !idOK || partyPod == "" {
		slog.Warn("pod inbox invite skipped: incomplete")
		return
	}
	shown := make(map[string]interface{}, len(l.Payload))
	for k, v := range l.Payload {
		if k != "party_pod_id" {
			shown[k] = v
		}
	}
	if err := r.sender.SendMessageToPlayer(target, types.Message{Action: string(constants.ActionPartyInvite), Payload: shown}); err != nil {
		slog.Debug("pod inbox invite dropped: player not here", "player_id", target, "error", err)
		return
	}
	r.remoteInvites[id] = remoteInvite{partyPod: partyPod, target: target, receivedAt: r.cfg.now()}
}

func (r *partyRegistry) receiveReply(l letter) {
	id, ok := inviteIDOf(l.Payload)
	if !ok {
		return
	}
	inv, open := r.invites[id]
	if !open {
		return
	}
	if declined, _ := l.Payload["declined"].(bool); declined {
		delete(r.invites, id)
		r.noticeLeader(inv, constants.PartyNoticeDeclined)
	}
}

// goneInviteFor reports whether payload names an invite to target whose party
// has ended within the invite's minute.
func (r *partyRegistry) goneInviteFor(target uuid.UUID, payload map[string]interface{}) bool {
	id, ok := inviteIDOf(payload)
	if !ok {
		return false
	}
	inv, gone := r.goneInvites[id]
	return gone && inv.target == target
}

// inviteIDOf is the invite id an answer names, if it names one.
func inviteIDOf(payload map[string]interface{}) (uuid.UUID, bool) {
	raw, _ := payload["invite_id"].(string)
	id, err := uuid.Parse(raw)
	return id, err == nil
}

// openInviteFor is the open invite payload names, if it is addressed to target.
// Nothing trusts the id alone: an invite answers only to its own target
// (FS-R82NV Edge States "Unauthorized").
func (r *partyRegistry) openInviteFor(target uuid.UUID, payload map[string]interface{}) (*partyInvite, bool) {
	id, ok := inviteIDOf(payload)
	if !ok {
		return nil, false
	}
	inv, open := r.invites[id]
	if !open || inv.target != target {
		return nil, false
	}
	return inv, true
}

// update sends the party as it now stands to every member: why, and whom it is
// about. FS-R82NV §Requirements 21.
func (r *partyRegistry) update(p *party, reason constants.PartyUpdateReason, subject uuid.UUID) {
	msg := partyUpdate(p.id, p.leader, p.members, r.cfg.size, reason, subject)
	for _, m := range p.members {
		if err := r.sender.SendMessageToPlayer(m.playerID, msg); err != nil {
			slog.Warn("party update not delivered", "party_id", p.id, "player_id", m.playerID, "error", err)
		}
	}
}

// partyUpdate is a party_update: the party as it stands, why, and whom it is
// about. size is the party's cap, not its count (that is len(members)), so the
// client can show "(<n>/<size>)". FS-R82NV R21, R32; I-R82NV-1 notes.
func partyUpdate(partyID, leader uuid.UUID, membersNow []partyMember, size int, reason constants.PartyUpdateReason, subject uuid.UUID) types.Message {
	members := make([]map[string]interface{}, len(membersNow))
	for i, m := range membersNow {
		members[i] = map[string]interface{}{
			"player_id": m.playerID.String(),
			"name":      m.name,
			"class":     m.class,
			"joined_at": m.joinedAt.UTC().Format(time.RFC3339),
			// every member stands in the hub until world switches are tracked (R23)
			"where":  "hub",
			"online": true,
		}
	}
	return types.Message{
		Action: string(constants.ActionPartyUpdate),
		Payload: map[string]interface{}{
			"party_id":   partyID.String(),
			"leader_id":  leader.String(),
			"members":    members,
			"size":       size,
			"reason":     string(reason),
			"subject_id": subject.String(),
		},
	}
}

// partyLedBy is the inviter's party, or a new one with them as its leader and
// only member, not yet formed: there is no separate create action, and a party
// forms only once its first invite is delivered (form). FS-R82NV R4.
func (r *partyRegistry) partyLedBy(inviter *types.Player, at time.Time) (p *party, formed bool) {
	if p, in := r.partyOf(inviter.ID); in {
		return p, false
	}
	return &party{
		id:        r.cfg.newID(),
		leader:    inviter.ID,
		members:   []partyMember{{playerID: inviter.ID, name: inviter.Character.Name, class: inviter.Character.Class, joinedAt: at}},
		createdAt: at,
	}, true
}

// form records a new party on this pod, writes its pointers, and tells its
// leader they lead it. FS-R82NV R3, R4, R21.
func (r *partyRegistry) form(p *party) {
	r.parties[p.id] = p
	r.memberOf[p.leader] = p.id
	r.point(p)
	r.update(p, constants.PartyUpdateJoined, p.leader)
}

// notice tells one connection something about its party, by code; name is the
// player it concerns, when there is one. The client owns the words (R12).
func (r *partyRegistry) notice(conn *websocket.Conn, code constants.PartyNoticeCode, name string) {
	if err := r.sender.SendMessageToConn(conn, partyNotice(code, name)); err != nil {
		slog.Warn("party notice not delivered", "code", code, "error", err)
	}
}

// noticeLeader tells the party that sent inv how it was answered, by the
// target's name. An invite is the party's, not its sender's: whoever leads now
// hears it (I-R82NV-2 decision 2).
func (r *partyRegistry) noticeLeader(inv *partyInvite, code constants.PartyNoticeCode) {
	p, live := r.parties[inv.partyID]
	if !live {
		return
	}
	r.noticePlayer(p.leader, code, inv.targetName)
}

// noticePlayer is notice for a player who is not the one asking, by id.
func (r *partyRegistry) noticePlayer(playerID uuid.UUID, code constants.PartyNoticeCode, name string) {
	if err := r.sender.SendMessageToPlayer(playerID, partyNotice(code, name)); err != nil {
		slog.Warn("party notice not delivered", "code", code, "player_id", playerID, "error", err)
	}
}

func partyNotice(code constants.PartyNoticeCode, name string) types.Message {
	payload := map[string]interface{}{"code": string(code)}
	if name != "" {
		payload["name"] = name
	}
	return types.Message{Action: string(constants.ActionPartyNotice), Payload: payload}
}

// WithPartyClock stamps parties and invites from now instead of the wall clock,
// and lapses invites by it. FS-R82NV R14.
func WithPartyClock(now func() time.Time) Option {
	return func(o *bootOptions) { o.partyNow = now }
}

// WithPartySize caps every party at size members, pending accepts counted.
// FS-R82NV R8.
func WithPartySize(size int) Option {
	return func(o *bootOptions) { o.partySize = size }
}

// WithPartyPointers writes each party's pointers through pointers, the pod's
// Redis in production. FS-R82NV R3.
func WithPartyPointers(pointers partyPointers) Option {
	return func(o *bootOptions) { o.partyPointers = pointers }
}

// withPartyTicks sweeps the registry when the test sends on ticks, instead of
// every second.
func withPartyTicks(ticks <-chan time.Time) Option {
	return func(o *bootOptions) { o.partyTicks = ticks }
}
