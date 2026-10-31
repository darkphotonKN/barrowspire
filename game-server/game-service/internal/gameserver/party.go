package gameserver

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
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
	IsQueued(ctx context.Context, playerID uuid.UUID) (bool, error)
}

// partyPointers is the Redis side of a party: the pointers other pods follow to
// it (FS-R82NV R3). partypointer.Redis in production.
type partyPointers interface {
	Point(ctx context.Context, partyID uuid.UUID, podID string, members []uuid.UUID) error
	ForgetParty(ctx context.Context, partyID uuid.UUID, members []uuid.UUID) error
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
	inviter uuid.UUID
	target  uuid.UUID
	// the target's character name, for the notices that answer the inviter
	targetName string
	sentAt     time.Time
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

// Pointer writes run on their own goroutine, in the order the loop queued them,
// so a slow Redis holds up only that goroutine. A full queue drops a write: a
// dropped point comes back at the next refresh, a dropped forget lapses by TTL.
const (
	partyPointerBuffer  = 256
	partyPointerTimeout = 2 * time.Second
)

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
}

// partyRegistry holds this pod's parties. Only the hub's loop touches its maps.
type partyRegistry struct {
	directory partyDirectory
	sender    partySender
	cfg       partyRegistryConfig

	parties  map[uuid.UUID]*party
	memberOf map[uuid.UUID]uuid.UUID // player id → party id
	invites  map[uuid.UUID]*partyInvite

	// when the pointers were last written in full
	lastRefresh time.Time
	// pointer writes waiting for the writer, in queue order
	writes chan func(ctx context.Context) error
	// closed once the writer has stopped, so the shutdown delete lands after
	// any write it was in the middle of
	writerDone chan struct{}
	// set once every party is dissolved at shutdown: party actions are ignored
	// from then on, since a party formed now would end with the pod
	closed bool
	// closed once every party is dissolved at shutdown
	dissolved chan struct{}
}

func newPartyRegistry(directory partyDirectory, sender partySender, cfg partyRegistryConfig) *partyRegistry {
	return &partyRegistry{
		directory: directory,
		sender:    sender,
		cfg:       cfg,

		parties:  make(map[uuid.UUID]*party),
		memberOf: make(map[uuid.UUID]uuid.UUID),
		invites:  make(map[uuid.UUID]*partyInvite),

		lastRefresh: cfg.now(),
		writes:      make(chan func(ctx context.Context) error, partyPointerBuffer),
		writerDone:  make(chan struct{}),
		dissolved:   make(chan struct{}),
	}
}

// start runs the pointer writer for the life of ctx. A registry with no Redis
// starts nothing.
func (r *partyRegistry) start(ctx context.Context) {
	if r.cfg.pointers == nil {
		return
	}
	go r.writeLoop(ctx)
}

// writeLoop is the pod's one pointer writer: each queued write in turn, each
// within partyPointerTimeout; one that fails is a Warn, and the next is tried.
func (r *partyRegistry) writeLoop(ctx context.Context) {
	defer close(r.writerDone)
	for {
		select {
		case <-ctx.Done():
			return
		case write := <-r.writes:
			writeCtx, cancel := context.WithTimeout(ctx, partyPointerTimeout)
			err := write(writeCtx)
			cancel()
			if err != nil && ctx.Err() == nil {
				slog.Warn("party pointer write failed", "error", err)
			}
		}
	}
}

// point queues writing p's pointers: on a change, and at every refresh.
func (r *partyRegistry) point(p *party) {
	if r.cfg.pointers == nil {
		return
	}
	partyID, members := p.id, p.memberIDs()
	r.queueWrite(func(ctx context.Context) error {
		return r.cfg.pointers.Point(ctx, partyID, r.cfg.podID, members)
	})
}

func (r *partyRegistry) queueWrite(write func(ctx context.Context) error) {
	select {
	case r.writes <- write:
	default:
		slog.Warn("party pointer write dropped: writer behind")
	}
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
		select {
		case <-r.writerDone:
		case <-deleteCtx.Done():
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
}

// stopped closes once dissolveAll has run.
func (r *partyRegistry) stopped() <-chan struct{} {
	return r.dissolved
}

// invite handles party_invite from inviter on conn: refused with a notice, or
// delivered to the target, the inviter's party created first if they have none.
// FS-R82NV §Requirements 4, 11–14.
func (r *partyRegistry) invite(ctx context.Context, inviter *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	// trimmed here, case-folded wherever a name is compared (Edge States "Name with different case")
	name, _ := payload["name"].(string)
	target, refusal := r.inviteTarget(ctx, inviter, strings.TrimSpace(name))
	if refusal != nil {
		slog.Debug("party invite refused", "player_id", inviter.ID, "code", refusal.code)
		r.notice(conn, refusal.code, refusal.name)
		return
	}

	at := r.cfg.now()
	p, formed := r.partyLedBy(inviter, at)
	inv := &partyInvite{id: r.cfg.newID(), partyID: p.id, inviter: inviter.ID, target: target.ID, targetName: target.Character.Name, sentAt: at}

	// delivered first, kept after: an invite nobody saw forms no party and
	// holds no place (code review 2026-11-01)
	if err := r.sender.SendMessageToPlayer(target.ID, types.Message{
		Action: string(constants.ActionPartyInvite),
		Payload: map[string]interface{}{
			"invite_id":      inv.id.String(),
			"party_id":       p.id.String(),
			"party_pod_addr": r.cfg.podAddr,
			"leader_name":    inviter.Character.Name,
			"member_count":   len(p.members),
			"size":           r.cfg.size,
			"expires_at":     at.Add(partyInviteTTL).UTC().Format(time.RFC3339),
		},
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

// inviteRefusal is why an invite was not sent, and the player it concerns for
// the client's copy (R36): "" when it is about the inviter themselves.
type inviteRefusal struct {
	code constants.PartyNoticeCode
	name string
}

// inviteTarget is whom inviter may invite under name, or the refusal. The
// inviter's own standing is checked first, since naming someone cannot cure
// it; then R12's list, in R12's order. FS-R82NV §Requirements 11, 12, 16.
func (r *partyRegistry) inviteTarget(ctx context.Context, inviter *types.Player, name string) (types.Player, *inviteRefusal) {
	refuse := func(code constants.PartyNoticeCode, about string) (types.Player, *inviteRefusal) {
		return types.Player{}, &inviteRefusal{code: code, name: about}
	}
	if !r.directory.InHub(inviter.ID) {
		return refuse(constants.PartyNoticeNotInHub, "")
	}
	p, inParty := r.partyOf(inviter.ID)
	if inParty && p.leader != inviter.ID {
		return refuse(constants.PartyNoticeNotLeader, "")
	}
	if r.queued(ctx, inviter.ID) {
		return refuse(constants.PartyNoticeQueued, "")
	}
	// a player with no party would lead one of one, never full at size two or more
	if inParty && len(p.members)+r.pendingFor(p.id) >= r.cfg.size {
		return refuse(constants.PartyNoticePartyFull, "")
	}
	if strings.EqualFold(name, inviter.Character.Name) || strings.EqualFold(name, inviter.ID.String()) {
		return refuse(constants.PartyNoticeSelf, "")
	}
	target, found := r.directory.HubSeatedPlayer(name)
	if !found {
		// nobody to take a proper name from: the name as the inviter typed it
		return refuse(constants.PartyNoticeNotFound, name)
	}
	if _, grouped := r.memberOf[target.ID]; grouped {
		return refuse(constants.PartyNoticeAlreadyInParty, target.Character.Name)
	}
	// pod_full never applies here: a target seated in this hub already holds
	// a seat on the party pod (I-R82NV-1 decision 2; cross-pod targets, slice 3)
	if inParty && r.inviteOpenTo(p.id, target.ID) {
		return refuse(constants.PartyNoticePending, target.Character.Name)
	}
	return target, nil
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
		return
	}
	if refusal := r.acceptRefusal(ctx, accepter); refusal != "" {
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

// acceptRefusal is why accepter cannot join a party now, in R16's order, or "".
func (r *partyRegistry) acceptRefusal(ctx context.Context, accepter *types.Player) constants.PartyNoticeCode {
	if !r.directory.InHub(accepter.ID) {
		return constants.PartyNoticeNotInHub
	}
	if _, grouped := r.memberOf[accepter.ID]; grouped {
		return constants.PartyNoticeAlreadyInParty
	}
	if r.queued(ctx, accepter.ID) {
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
		r.noticePlayer(inv.inviter, constants.PartyNoticeAlreadyInParty, inv.targetName)
	}
}

// decline handles party_decline from the invite's target: the invite is spent
// and the inviter told, by name. An unknown or spent id is ignored. FS-R82NV R15.
func (r *partyRegistry) decline(decliner *types.Player, payload map[string]interface{}) {
	inv, open := r.openInviteFor(decliner.ID, payload)
	if !open {
		return
	}
	delete(r.invites, inv.id)

	r.noticePlayer(inv.inviter, constants.PartyNoticeDeclined, inv.targetName)
}

// ticks is when the hub's loop should call tick.
func (r *partyRegistry) ticks() <-chan time.Time {
	return r.cfg.ticks
}

// tick lapses every invite whose minute has passed, telling each inviter by
// name. The target's client closes its prompt on its own clock. FS-R82NV R14.
func (r *partyRegistry) tick() {
	at := r.cfg.now()
	for id, inv := range r.invites {
		if at.Sub(inv.sentAt) < partyInviteTTL {
			continue
		}
		delete(r.invites, id)
		r.noticePlayer(inv.inviter, constants.PartyNoticeExpired, inv.targetName)
	}

	// the pointers are written again before they could lapse (R3)
	if at.Sub(r.lastRefresh) >= partyRefreshInterval {
		r.lastRefresh = at
		for _, p := range r.parties {
			r.point(p)
		}
	}
}

// openInviteFor is the open invite payload names, if it is addressed to target.
// Nothing trusts the id alone: an invite answers only to its own target
// (FS-R82NV Edge States "Unauthorized").
func (r *partyRegistry) openInviteFor(target uuid.UUID, payload map[string]interface{}) (*partyInvite, bool) {
	raw, _ := payload["invite_id"].(string)
	id, err := uuid.Parse(raw)
	if err != nil {
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
