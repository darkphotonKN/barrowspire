package gameserver

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* The party registry: this pod's side of every party one of its players is in. A party's state
* lives in Redis (FS-NCC9J R1, ADR-0036), not on any pod. The registry keeps the party cache (R4),
* each party as Redis last answered, and makes every change as one script, run off the hub's loop
* by one runner in the order asked, its outcome handed back to the loop. The loop never waits on Redis: who may act, and in what
* order the refusals come, is checked on the loop against the cache; the script makes the final
* check (R2); its answer updates the cache and tells the players.
*
* Only the hub's loop touches the registry's maps, so nothing in it needs a lock.
**/

// partyDirectory answers who this pod holds and where they stand.
type partyDirectory interface {
	// who a name or player id is among this pod's hub (FS-R82NV R12, same pod)
	HubSeatedPlayer(nameOrID string) (types.Player, bool)
	// everyone this pod holds, seated in any world: whose parties the cache keeps (R4, R6)
	SeatedPlayerIDs() []uuid.UUID
	// whether a player is inside a run, where accepting is refused locked (R14)
	InRun(playerID uuid.UUID) bool
	IsQueued(ctx context.Context, playerID uuid.UUID) (bool, error)
}

// partyStore is a party's state in Redis, every change one script: partystore.Redis in
// production (R1, R2).
type partyStore interface {
	Create(ctx context.Context, partyID uuid.UUID, creator partystore.Joiner, now time.Time) (partystore.CreateResult, error)
	Invite(ctx context.Context, a partystore.InviteArgs) (partystore.InviteResult, error)
	Withdraw(ctx context.Context, inviteID uuid.UUID, endIfAlone bool, now time.Time) (bool, error)
	Accept(ctx context.Context, a partystore.AcceptArgs) (partystore.AcceptResult, error)
	Decline(ctx context.Context, a partystore.DeclineArgs) (partystore.DeclineResult, error)
	Remove(ctx context.Context, a partystore.RemoveArgs) (partystore.RemoveResult, error)
	Transfer(ctx context.Context, partyID, leader, target uuid.UUID) (partystore.TransferResult, error)
	PartyOf(ctx context.Context, playerID uuid.UUID, now time.Time) (partystore.Party, bool, error)
	RefreshAll(ctx context.Context, ids []uuid.UUID, now time.Time) ([]partystore.Party, []uuid.UUID, error)
}

// presenceLookup finds a player seated in any pod's hub: partypresence.Redis in production.
type presenceLookup interface {
	Lookup(ctx context.Context, nameOrID string) (partypresence.Found, bool, error)
}

// letterBox is how letters reach other pods' inboxes (FS-R82NV R9, R10).
type letterBox interface {
	open() bool
	send(podID string, l letter, failed func())
	letters() <-chan letter
}

// partySender is how party messages reach players: a notice to the asking connection, a prompt
// or an update to a player by id.
type partySender interface {
	SendMessageToConn(conn *websocket.Conn, msg types.Message) error
	SendMessageToPlayer(playerID uuid.UUID, msg types.Message) error
}

// remoteInvite is an invite this pod delivered to one of its players from another pod: remembered
// for its minute so the decline's notice can be sent back to the pod the inviter sent it from
// (I-R82NV-3 decision 5; the presence index takes over in FS-NCC9J slice 3).
type remoteInvite struct {
	// the pod the inviter was on when they sent it: not the leader's pod once the lead passes
	inviterPod string
	target     uuid.UUID
	receivedAt time.Time
}

// partyTickInterval is how often the hub's loop ticks the registry.
const partyTickInterval = time.Second

// defaultPartySize is the party cap when the pod is given none. FS-R82NV R8.
const defaultPartySize = 2

// partyRefreshInterval is how often the cache re-reads every party it keeps (R4).
const partyRefreshInterval = 10 * time.Second

// partyCallTimeout bounds one script or read behind a party action.
const partyCallTimeout = 2 * time.Second

// partyWorkBuffer is how much finished work may wait for the hub's loop.
const partyWorkBuffer = 64

// partyRunBuffer is how many Redis calls may wait for the runner.
const partyRunBuffer = 256

// partyRegistryConfig is what a registry is built from.
type partyRegistryConfig struct {
	// this pod: where an inbox letter's answer comes back to, and what a prompt carries
	podID   string
	podAddr string
	// the most a party may hold, members and open invites together (R3)
	size int
	// what parties and invites are stamped with, and how invites expire (R12)
	now   func() time.Time
	newID func() uuid.UUID
	// when the hub's loop ticks the registry; nil, never
	ticks <-chan time.Time
	// where parties live; nil on a pod built without Redis, where every change is refused
	// unavailable (R8)
	store partyStore
	// the presence index invites look targets up in, and the inbox they reach other pods by; nil
	// on a pod that reaches no other
	presence presenceLookup
	inbox    letterBox
}

type partyRegistry struct {
	directory partyDirectory
	sender    partySender
	cfg       partyRegistryConfig

	// the party cache (R4): each party one of this pod's players is in, as Redis last answered
	parties  map[uuid.UUID]partystore.Party
	memberOf map[uuid.UUID]uuid.UUID // player id → party id, for every cached party's members
	// players seated here whose arrival read has succeeded (R6), and those whose read is under way;
	// a player in neither is read on the next tick, so a failed read is tried again
	arrived  map[uuid.UUID]struct{}
	arriving map[uuid.UUID]struct{}
	// invites delivered here from other pods
	remoteInvites map[uuid.UUID]remoteInvite
	// Redis calls waiting for the runner, in the order the loop asked for them
	runs chan func(ctx context.Context)
	// work finished off the loop and handed back to it
	work chan func()

	lastRefresh time.Time
	// set as the pod shuts down: party actions are ignored from then on
	closed bool
	done   chan struct{}
}

func newPartyRegistry(directory partyDirectory, sender partySender, cfg partyRegistryConfig) *partyRegistry {
	return &partyRegistry{
		directory: directory,
		sender:    sender,
		cfg:       cfg,

		parties:       make(map[uuid.UUID]partystore.Party),
		memberOf:      make(map[uuid.UUID]uuid.UUID),
		arrived:       make(map[uuid.UUID]struct{}),
		arriving:      make(map[uuid.UUID]struct{}),
		remoteInvites: make(map[uuid.UUID]remoteInvite),
		runs:          make(chan func(ctx context.Context), partyRunBuffer),
		work:          make(chan func(), partyWorkBuffer),
		lastRefresh:   cfg.now(),
		done:          make(chan struct{}),
	}
}

// errPartyRunnerBehind refuses a Redis call the runner has no room for.
var errPartyRunnerBehind = errors.New("party runner behind")

// start runs the registry's runner for the life of ctx: the one goroutine that makes this pod's
// party calls to Redis, in the order the loop asked for them, so two actions sent one after the
// other on this pod reach Redis in that order (I-NCC9J-1 D1, amended).
func (r *partyRegistry) start(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case job := <-r.runs:
				job(ctx)
			}
		}
	}()
}

// offLoop queues call for the runner, bounded by partyCallTimeout, and hands its outcome to done
// back on the hub's loop, unless the pod has closed its parties meanwhile. Called on the loop,
// which never waits: a runner with no room answers done at once with errPartyRunnerBehind.
func offLoop[T any](ctx context.Context, r *partyRegistry, call func(ctx context.Context) (T, error), done func(T, error)) {
	job := func(runCtx context.Context) {
		callCtx, cancel := context.WithTimeout(runCtx, partyCallTimeout)
		res, err := call(callCtx)
		cancel()
		r.post(runCtx, func() {
			if r.closed {
				return
			}
			done(res, err)
		})
	}
	select {
	case r.runs <- job:
	default:
		slog.Warn("party redis call refused: runner behind")
		var zero T
		done(zero, errPartyRunnerBehind)
	}
}

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

// close stops the registry as the pod shuts down. Nothing is dissolved: a party outlives any pod
// (ADR-0036); this pod's players simply stop being seated here, and their parties live on in Redis.
func (r *partyRegistry) close() {
	if r.closed {
		return
	}
	r.closed = true
	close(r.done)
}

// stopped closes once the registry has closed.
func (r *partyRegistry) stopped() <-chan struct{} { return r.done }

// cachePut keeps p in the cache as Redis last answered it.
func (r *partyRegistry) cachePut(p partystore.Party) {
	r.cacheDrop(p.ID)
	r.parties[p.ID] = p
	for _, m := range p.Members {
		r.memberOf[m.PlayerID] = p.ID
	}
}

// cacheDrop lets go of a party: it ended, or this pod holds none of its members.
func (r *partyRegistry) cacheDrop(partyID uuid.UUID) {
	old, cached := r.parties[partyID]
	if !cached {
		return
	}
	delete(r.parties, partyID)
	for _, m := range old.Members {
		if r.memberOf[m.PlayerID] == partyID {
			delete(r.memberOf, m.PlayerID)
		}
	}
}

// forgetReservation drops one open invite from a cached party.
func (r *partyRegistry) forgetReservation(partyID, inviteID uuid.UUID) {
	p, cached := r.parties[partyID]
	if !cached {
		return
	}
	kept := make([]partystore.Reservation, 0, len(p.Reserved))
	for _, res := range p.Reserved {
		if res.InviteID != inviteID {
			kept = append(kept, res)
		}
	}
	p.Reserved = kept
	r.parties[partyID] = p
}

// partyOf is the cached party a player is a member of, if any.
func (r *partyRegistry) partyOf(playerID uuid.UUID) (partystore.Party, bool) {
	id, in := r.memberOf[playerID]
	if !in {
		return partystore.Party{}, false
	}
	p, cached := r.parties[id]
	return p, cached
}

// openReservations are a cached party's invites still within their minute.
func (r *partyRegistry) openReservations(p partystore.Party) []partystore.Reservation {
	at := r.cfg.now()
	open := make([]partystore.Reservation, 0, len(p.Reserved))
	for _, res := range p.Reserved {
		if at.Before(res.ExpiresAt) {
			open = append(open, res)
		}
	}
	return open
}

func joinerOf(player *types.Player) partystore.Joiner {
	return partystore.Joiner{PlayerID: player.ID, Name: player.Character.Name, Class: player.Character.Class}
}

// invite handles party_invite from inviter on conn: refused with a notice, or a slot reserved in
// the inviter's party (created if they have none) and the invite delivered to the target. A target
// seated in this hub is answered from the cache; anyone else is looked up in the presence index
// off the loop first. FS-NCC9J R9–R11.
func (r *partyRegistry) invite(ctx context.Context, inviter *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	// trimmed here, case-folded wherever a name is compared (FS-R82NV Edge States "Name with different case")
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
	if r.cfg.store == nil {
		r.refuse(conn, inviter.ID, constants.PartyNoticeUnavailable)
		return
	}

	if target, here := r.directory.HubSeatedPlayer(name); here {
		if refusal := r.targetRefusal(inviter, target.ID, target.Character.Name); refusal != nil {
			r.refuseInvite(conn, inviter.ID, refusal)
			return
		}
		r.sendInvite(ctx, inviter, conn, target.ID, target.Character.Name, "")
		return
	}
	if r.cfg.presence == nil || r.cfg.inbox == nil || !r.cfg.inbox.open() {
		r.refuseInvite(conn, inviter.ID, &inviteRefusal{code: constants.PartyNoticeNotFound, name: name})
		return
	}
	go r.lookUp(ctx, inviter, conn, name)
}

// partyLookupTimeout bounds the presence read behind one invite.
const partyLookupTimeout = 2 * time.Second

// lookUp reads the target's presence off the loop, then hands the answer back to it.
func (r *partyRegistry) lookUp(ctx context.Context, inviter *types.Player, conn *websocket.Conn, name string) {
	readCtx, cancel := context.WithTimeout(ctx, partyLookupTimeout)
	found, present, err := r.cfg.presence.Lookup(readCtx, name)
	cancel()
	r.post(ctx, func() { r.inviteThere(ctx, inviter, conn, name, found, present, err) })
}

// inviteThere finishes an invite whose target was looked up: the inviter's standing is checked
// again, since the loop went on while Redis answered, then the rest of R10's list.
func (r *partyRegistry) inviteThere(ctx context.Context, inviter *types.Player, conn *websocket.Conn, name string, found partypresence.Found, present bool, err error) {
	if r.closed {
		return
	}
	if err != nil {
		slog.Warn("party invite lookup failed", "player_id", inviter.ID, "error", err)
		r.refuseInvite(conn, inviter.ID, &inviteRefusal{code: constants.PartyNoticeDeliveryFailed, name: name})
		return
	}
	refusal := r.leadRefusal(inviter)
	if refusal == nil {
		refusal = r.roomRefusal(inviter, name)
	}
	// seated nowhere, or on this pod but out of its hub since the index was written
	if refusal == nil && (!present || found.PodID == r.cfg.podID) {
		refusal = &inviteRefusal{code: constants.PartyNoticeNotFound, name: name}
	}
	if refusal == nil {
		refusal = r.targetRefusal(inviter, found.PlayerID, found.Name)
	}
	if refusal != nil {
		r.refuseInvite(conn, inviter.ID, refusal)
		return
	}
	r.sendInvite(ctx, inviter, conn, found.PlayerID, found.Name, found.PodID)
}

// sendInvite runs the invite script off the loop; targetPod is "" for a target in this hub.
func (r *partyRegistry) sendInvite(ctx context.Context, inviter *types.Player, conn *websocket.Conn, targetID uuid.UUID, targetName, targetPod string) {
	args := partystore.InviteArgs{
		NewPartyID: r.cfg.newID(),
		Inviter:    joinerOf(inviter),
		InviteID:   r.cfg.newID(),
		TargetID:   targetID,
		TargetName: targetName,
		Size:       r.cfg.size,
		Now:        r.cfg.now(),
	}
	offLoop(ctx, r,
		func(c context.Context) (partystore.InviteResult, error) { return r.cfg.store.Invite(c, args) },
		func(res partystore.InviteResult, err error) { r.invited(ctx, inviter, conn, args, targetPod, res, err) },
	)
}

// invited delivers a written invite. A target in this hub is prompted at once; one that cannot be
// is withdrawn, with the party it created, so an invite nobody saw forms no party and holds no
// place (I-NCC9J-1 D6). The leader of a party the invite created hears of it only once it is
// delivered. A target on another pod gets a letter.
func (r *partyRegistry) invited(ctx context.Context, inviter *types.Player, conn *websocket.Conn, args partystore.InviteArgs, targetPod string, res partystore.InviteResult, err error) {
	if err != nil {
		slog.Warn("party invite not written", "player_id", inviter.ID, "error", err)
		r.refuse(conn, inviter.ID, constants.PartyNoticeUnavailable)
		return
	}
	if res.Refusal != "" {
		r.refuseInvite(conn, inviter.ID, refusalFor(res.Refusal, args.TargetName))
		return
	}
	r.cachePut(res.Party)
	prompt := types.Message{Action: string(constants.ActionPartyInvite), Payload: r.invitePayload(args, res.Party, inviter)}

	if targetPod == "" {
		if err := r.sender.SendMessageToPlayer(args.TargetID, prompt); err != nil {
			slog.Warn("party invite not delivered", "party_id", res.Party.ID, "target_id", args.TargetID, "error", err)
			// told once the slot is free in Redis, so their next invite meets it free
			r.withdraw(ctx, res.Party.ID, args.InviteID, res.Formed, func() {
				r.notice(conn, constants.PartyNoticeDeliveryFailed, args.TargetName)
			})
			return
		}
		if res.Formed {
			r.update(res.Party, constants.PartyUpdateJoined, res.Party.Leader)
		}
		r.notice(conn, constants.PartyNoticeSent, args.TargetName)
		return
	}

	if res.Formed {
		r.update(res.Party, constants.PartyUpdateJoined, res.Party.Leader)
	}
	prompt.Payload["inviter_pod_id"] = r.cfg.podID
	partyID, inviteID, targetName := res.Party.ID, args.InviteID, args.TargetName
	r.cfg.inbox.send(targetPod, letter{Kind: letterPartyInvite, ToPlayerID: args.TargetID.String(), Payload: prompt.Payload}, func() {
		r.postOrDrop(func() { r.undelivered(ctx, partyID, inviteID, targetName) })
	})
	r.notice(conn, constants.PartyNoticeSent, args.TargetName)
}

// undelivered withdraws an invite whose letter was never published, telling whoever leads now.
// FS-NCC9J R11.
func (r *partyRegistry) undelivered(ctx context.Context, partyID, inviteID uuid.UUID, targetName string) {
	if r.closed {
		return
	}
	r.withdraw(ctx, partyID, inviteID, false, func() {
		if p, cached := r.parties[partyID]; cached {
			r.noticePlayer(p.Leader, constants.PartyNoticeDeliveryFailed, targetName)
		}
	})
}

// withdraw spends an undelivered invite in Redis, and the party with it when formed (the invite
// created it) and nothing else has come into it since (I-NCC9J-1 D6); the cache follows what
// Redis did, then then runs on the loop. An invite Redis could not withdraw lapses at its minute;
// a party it formed stands meanwhile, so its leader is told of it after all.
func (r *partyRegistry) withdraw(ctx context.Context, partyID, inviteID uuid.UUID, formed bool, then func()) {
	at := r.cfg.now()
	offLoop(ctx, r,
		func(c context.Context) (bool, error) { return r.cfg.store.Withdraw(c, inviteID, formed, at) },
		func(ended bool, err error) {
			switch {
			case err != nil:
				slog.Warn("party invite not withdrawn, left to lapse", "invite_id", inviteID, "error", err)
				then()
				if p, cached := r.parties[partyID]; cached && formed {
					r.update(p, constants.PartyUpdateJoined, p.Leader)
				}
			case ended:
				r.cacheDrop(partyID)
				then()
			default:
				r.forgetReservation(partyID, inviteID)
				then()
			}
		},
	)
}

// invitePayload is what the target's client is shown (FS-R82NV R13; size the cap). party_pod_addr
// is still sent for the client that reads it (I-NCC9J-1 D9).
func (r *partyRegistry) invitePayload(args partystore.InviteArgs, p partystore.Party, inviter *types.Player) map[string]interface{} {
	return map[string]interface{}{
		"invite_id":      args.InviteID.String(),
		"party_id":       p.ID.String(),
		"party_pod_addr": r.cfg.podAddr,
		"leader_name":    inviter.Character.Name,
		"member_count":   len(p.Members),
		"size":           r.cfg.size,
		"expires_at":     args.Now.Add(partystore.InviteTTL).UTC().Format(time.RFC3339),
	}
}

// inviteRefusal is why an invite was not sent, and the player it concerns for the client's copy:
// "" when it is about the inviter themselves.
type inviteRefusal struct {
	code constants.PartyNoticeCode
	name string
}

func (r *partyRegistry) refuseInvite(conn *websocket.Conn, inviterID uuid.UUID, refusal *inviteRefusal) {
	slog.Debug("party invite refused", "player_id", inviterID, "code", refusal.code)
	r.notice(conn, refusal.code, refusal.name)
}

// leadRefusal is the inviter's own standing: leading their party if they have one (R9).
func (r *partyRegistry) leadRefusal(inviter *types.Player) *inviteRefusal {
	if p, inParty := r.partyOf(inviter.ID); inParty && p.Leader != inviter.ID {
		return &inviteRefusal{code: constants.PartyNoticeNotLeader}
	}
	return nil
}

// roomRefusal is the head of R10's list, which needs no target: a full party, counting its open
// invites, and naming yourself.
func (r *partyRegistry) roomRefusal(inviter *types.Player, name string) *inviteRefusal {
	// a player with no party would lead one of one, never full at size two or more
	if p, inParty := r.partyOf(inviter.ID); inParty && len(p.Members)+len(r.openReservations(p)) >= r.cfg.size {
		return &inviteRefusal{code: constants.PartyNoticePartyFull}
	}
	if strings.EqualFold(name, inviter.Character.Name) || strings.EqualFold(name, inviter.ID.String()) {
		return &inviteRefusal{code: constants.PartyNoticeSelf}
	}
	return nil
}

// targetRefusal is the tail of R10's list, as far as the cache knows: the target in a party, or
// already asked. The script checks both again.
func (r *partyRegistry) targetRefusal(inviter *types.Player, targetID uuid.UUID, targetName string) *inviteRefusal {
	if _, grouped := r.memberOf[targetID]; grouped {
		return &inviteRefusal{code: constants.PartyNoticeAlreadyInParty, name: targetName}
	}
	if p, inParty := r.partyOf(inviter.ID); inParty {
		for _, res := range r.openReservations(p) {
			if res.TargetID == targetID {
				return &inviteRefusal{code: constants.PartyNoticePending, name: targetName}
			}
		}
	}
	return nil
}

// refusalFor is a script's refusal as the notice the asker gets; the target's name goes with the
// refusals that are about them.
func refusalFor(refusal partystore.Refusal, targetName string) *inviteRefusal {
	code := noticeFor(refusal)
	switch code {
	case constants.PartyNoticeAlreadyInParty, constants.PartyNoticePending:
		return &inviteRefusal{code: code, name: targetName}
	}
	return &inviteRefusal{code: code}
}

// noticeFor maps a script's refusal to its party_notice code.
func noticeFor(refusal partystore.Refusal) constants.PartyNoticeCode {
	switch refusal {
	case partystore.RefusalNotLeader:
		return constants.PartyNoticeNotLeader
	case partystore.RefusalPartyFull:
		return constants.PartyNoticePartyFull
	case partystore.RefusalAlreadyInParty:
		return constants.PartyNoticeAlreadyInParty
	case partystore.RefusalPending:
		return constants.PartyNoticePending
	case partystore.RefusalExpired:
		return constants.PartyNoticeExpired
	case partystore.RefusalPartyGone:
		return constants.PartyNoticePartyGone
	case partystore.RefusalNotMember:
		return constants.PartyNoticeNotMember
	}
	return constants.PartyNoticeUnavailable
}

// queued reports whether player is in the Spire queue. An unreadable queue is not one they are
// in, as start_solo already treats it.
func (r *partyRegistry) queued(ctx context.Context, playerID uuid.UUID) bool {
	readCtx, cancel := context.WithTimeout(ctx, queueReadTimeout)
	defer cancel()
	queued, err := r.directory.IsQueued(readCtx, playerID)
	if err != nil {
		slog.Warn("Could not read queue entry for a party action, treating as not queued", "player_id", playerID, "error", err)
	}
	return queued
}

// accept handles party_accept from the invite's target: they become a member where they stand,
// on any world but a run, and nobody moves. FS-NCC9J R14.
func (r *partyRegistry) accept(ctx context.Context, accepter *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	inviteID, ok := inviteIDOf(payload)
	if !ok {
		return
	}
	if refusal := r.acceptRefusal(ctx, accepter); refusal != "" {
		// the invite stays open: they may accept once they can
		r.refuse(conn, accepter.ID, refusal)
		return
	}
	if r.cfg.store == nil {
		r.refuse(conn, accepter.ID, constants.PartyNoticeUnavailable)
		return
	}
	args := partystore.AcceptArgs{InviteID: inviteID, Accepter: joinerOf(accepter), Now: r.cfg.now()}
	offLoop(ctx, r,
		func(c context.Context) (partystore.AcceptResult, error) { return r.cfg.store.Accept(c, args) },
		func(res partystore.AcceptResult, err error) { r.accepted(conn, accepter, res, err) },
	)
}

// acceptRefusal is why player cannot accept now, as far as the cache knows, or "": already in a
// party, queued for the Spire, inside a run (R14).
func (r *partyRegistry) acceptRefusal(ctx context.Context, player *types.Player) constants.PartyNoticeCode {
	if _, grouped := r.memberOf[player.ID]; grouped {
		return constants.PartyNoticeAlreadyInParty
	}
	if r.queued(ctx, player.ID) {
		return constants.PartyNoticeQueued
	}
	// until FS-BJNYC gives every run a party (ADR-0035)
	if r.directory.InRun(player.ID) {
		return constants.PartyNoticeLocked
	}
	return ""
}

// accepted tells everyone an accept's outcome: the accepter why not, or every member the party
// as it now stands, and each leader whose invite to them it voided why it is gone.
func (r *partyRegistry) accepted(conn *websocket.Conn, accepter *types.Player, res partystore.AcceptResult, err error) {
	if err != nil {
		slog.Warn("party accept not written", "player_id", accepter.ID, "error", err)
		r.refuse(conn, accepter.ID, constants.PartyNoticeUnavailable)
		return
	}
	switch res.Refusal {
	case "":
	case partystore.RefusalNoInvite:
		// not theirs, or answered already: ignored (Edge States "Unauthorized", "Concurrent accepts")
		slog.Debug("party accept of no open invite ignored", "player_id", accepter.ID)
		return
	default:
		r.refuse(conn, accepter.ID, noticeFor(res.Refusal))
		return
	}
	r.cachePut(res.Party)
	for _, v := range res.Voided {
		r.forgetReservation(v.PartyID, v.InviteID)
		r.noticePlayer(v.LeaderID, constants.PartyNoticeAlreadyInParty, v.TargetName)
	}
	r.update(res.Party, constants.PartyUpdateJoined, accepter.ID)
}

// create handles party_create: the player leads a new party of one, from any world. FS-NCC9J R15.
func (r *partyRegistry) create(ctx context.Context, creator *types.Player, conn *websocket.Conn) {
	if r.closed {
		return
	}
	if _, grouped := r.memberOf[creator.ID]; grouped {
		r.refuse(conn, creator.ID, constants.PartyNoticeAlreadyInParty)
		return
	}
	if r.queued(ctx, creator.ID) {
		r.refuse(conn, creator.ID, constants.PartyNoticeQueued)
		return
	}
	if r.cfg.store == nil {
		r.refuse(conn, creator.ID, constants.PartyNoticeUnavailable)
		return
	}
	partyID, joiner, at := r.cfg.newID(), joinerOf(creator), r.cfg.now()
	offLoop(ctx, r,
		func(c context.Context) (partystore.CreateResult, error) {
			return r.cfg.store.Create(c, partyID, joiner, at)
		},
		func(res partystore.CreateResult, err error) {
			if r.failedOrRefused(conn, creator.ID, "party not created", res.Refusal, err) {
				return
			}
			r.cachePut(res.Party)
			r.update(res.Party, constants.PartyUpdateJoined, creator.ID)
		},
	)
}

// leave handles party_leave: the member leaves and stays where they stand. FS-R82NV R20.
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
	r.removeMember(ctx, conn, leaver.ID, partystore.RemoveArgs{PartyID: p.ID, PlayerID: leaver.ID}, constants.PartyUpdateLeft)
}

// kick handles party_kick: the leader removes a member, who stays where they stand. FS-R82NV R19.
func (r *partyRegistry) kick(ctx context.Context, leader *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	p, target, ok := r.leaderTargetOrRefuse(ctx, leader, conn, payload)
	if !ok {
		return
	}
	r.removeMember(ctx, conn, leader.ID, partystore.RemoveArgs{PartyID: p.ID, PlayerID: target, Kicker: leader.ID}, constants.PartyUpdateKicked)
}

// transfer handles party_transfer: the leader hands the lead to a member. FS-R82NV R19.
func (r *partyRegistry) transfer(ctx context.Context, leader *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	p, target, ok := r.leaderTargetOrRefuse(ctx, leader, conn, payload)
	if !ok {
		return
	}
	if r.cfg.store == nil {
		r.refuse(conn, leader.ID, constants.PartyNoticeUnavailable)
		return
	}
	partyID := p.ID
	offLoop(ctx, r,
		func(c context.Context) (partystore.TransferResult, error) {
			return r.cfg.store.Transfer(c, partyID, leader.ID, target)
		},
		func(res partystore.TransferResult, err error) {
			if r.failedOrRefused(conn, leader.ID, "party lead not transferred", res.Refusal, err) {
				return
			}
			r.cachePut(res.Party)
			r.update(res.Party, constants.PartyUpdateLeader, target)
		},
	)
}

// leaderTargetOrRefuse is the leader's party and the member payload's target_id names; or, having
// told the sender why not, false. A leader naming themselves is ignored: the panel never offers it.
func (r *partyRegistry) leaderTargetOrRefuse(ctx context.Context, leader *types.Player, conn *websocket.Conn, payload map[string]interface{}) (partystore.Party, uuid.UUID, bool) {
	p, in := r.partyOf(leader.ID)
	if !in || p.Leader != leader.ID {
		r.refuse(conn, leader.ID, constants.PartyNoticeNotLeader)
		return partystore.Party{}, uuid.Nil, false
	}
	if r.locked(ctx, p) {
		r.refuse(conn, leader.ID, constants.PartyNoticeLocked)
		return partystore.Party{}, uuid.Nil, false
	}
	raw, _ := payload["target_id"].(string)
	target, err := uuid.Parse(raw)
	if err != nil || !hasMember(p, target) {
		r.refuse(conn, leader.ID, constants.PartyNoticeNotMember)
		return partystore.Party{}, uuid.Nil, false
	}
	if target == leader.ID {
		slog.Debug("party leader action naming the leader, ignored", "player_id", leader.ID)
		return partystore.Party{}, uuid.Nil, false
	}
	return p, target, true
}

// locked reports whether p is inside an instance, where leave, kick and transfer are refused. No
// party enters one yet: FS-BJNYC wires this, and may need ctx to ask the run.
func (r *partyRegistry) locked(_ context.Context, _ partystore.Party) bool {
	return false
}

// failedOrRefused reports whether a script did not write, having told the asker why: Redis could
// not be reached (unavailable, logged at Warn as what), or the final check refused (R2, R8, R22).
func (r *partyRegistry) failedOrRefused(conn *websocket.Conn, playerID uuid.UUID, what string, refusal partystore.Refusal, err error) bool {
	if err != nil {
		slog.Warn(what, "player_id", playerID, "error", err)
		r.refuse(conn, playerID, constants.PartyNoticeUnavailable)
		return true
	}
	if refusal != "" {
		r.refuse(conn, playerID, noticeFor(refusal))
		return true
	}
	return false
}

// refuse answers a party action with why not, logged at Debug (R22).
func (r *partyRegistry) refuse(conn *websocket.Conn, playerID uuid.UUID, code constants.PartyNoticeCode) {
	slog.Debug("party action refused", "player_id", playerID, "code", code)
	r.notice(conn, code, "")
}

func hasMember(p partystore.Party, playerID uuid.UUID) bool {
	for _, m := range p.Members {
		if m.PlayerID == playerID {
			return true
		}
	}
	return false
}

// removeMember runs the removal script off the loop. A leader who goes is succeeded at once by
// the earliest-joined member who remains (FS-R82NV R22). The removed player gets their last
// update, the party without them, about them (R21); the rest hear why, then, if the lead passed,
// who leads.
func (r *partyRegistry) removeMember(ctx context.Context, conn *websocket.Conn, askerID uuid.UUID, args partystore.RemoveArgs, reason constants.PartyUpdateReason) {
	if r.cfg.store == nil {
		r.refuse(conn, askerID, constants.PartyNoticeUnavailable)
		return
	}
	offLoop(ctx, r,
		func(c context.Context) (partystore.RemoveResult, error) { return r.cfg.store.Remove(c, args) },
		func(res partystore.RemoveResult, err error) {
			if r.failedOrRefused(conn, askerID, "party member not removed", res.Refusal, err) {
				return
			}
			r.removed(args, res, reason)
		},
	)
}

func (r *partyRegistry) removed(args partystore.RemoveArgs, res partystore.RemoveResult, reason constants.PartyUpdateReason) {
	removed := args.PlayerID
	if res.Ended {
		// the last member: the party with nobody left, about them
		final := partyUpdate(args.PartyID, removed, nil, r.cfg.size, reason, removed)
		if err := r.sender.SendMessageToPlayer(removed, final); err != nil {
			slog.Warn("final party update not delivered", "party_id", args.PartyID, "player_id", removed, "error", err)
		}
		r.cacheDrop(args.PartyID)
		return
	}

	r.cachePut(res.Party)
	final := partyUpdate(res.Party.ID, res.Party.Leader, res.Party.Members, r.cfg.size, reason, removed)
	if err := r.sender.SendMessageToPlayer(removed, final); err != nil {
		slog.Warn("final party update not delivered", "party_id", res.Party.ID, "player_id", removed, "error", err)
	}
	r.update(res.Party, reason, removed)
	if res.Succeeded {
		r.update(res.Party, constants.PartyUpdateLeader, res.Party.Leader)
	}
}

// decline handles party_decline from the invite's target: the invite is spent, its slot frees,
// and whoever leads now is told, by name. An unknown, someone else's or expired id is ignored.
// FS-NCC9J R13.
func (r *partyRegistry) decline(ctx context.Context, decliner *types.Player, conn *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	inviteID, ok := inviteIDOf(payload)
	if !ok {
		return
	}
	if r.cfg.store == nil {
		r.refuse(conn, decliner.ID, constants.PartyNoticeUnavailable)
		return
	}
	// a decline of an invite from another pod is told there (FS-NCC9J slice 3 looks the leader up);
	// where it came from is kept until a decline lands, so one Redis refused can be tried again
	remote, held := r.remoteInvites[inviteID]
	fromThere := held && remote.target == decliner.ID
	args := partystore.DeclineArgs{InviteID: inviteID, DeclinerID: decliner.ID, Now: r.cfg.now()}
	offLoop(ctx, r,
		func(c context.Context) (partystore.DeclineResult, error) { return r.cfg.store.Decline(c, args) },
		func(res partystore.DeclineResult, err error) {
			if err != nil {
				slog.Warn("party decline not written", "player_id", decliner.ID, "error", err)
				r.refuse(conn, decliner.ID, constants.PartyNoticeUnavailable)
				return
			}
			if res.Refusal != "" {
				slog.Debug("party decline of no open invite ignored", "player_id", decliner.ID)
				return
			}
			if fromThere {
				delete(r.remoteInvites, inviteID)
				r.declineThere(remote.inviterPod, inviteID, res)
				return
			}
			r.forgetReservation(res.Party.ID, inviteID)
			r.noticePlayer(res.Party.Leader, constants.PartyNoticeDeclined, res.TargetName)
		},
	)
}

// declineThere tells the pod that sent the invite it was declined, so its leader hears.
func (r *partyRegistry) declineThere(inviterPod string, inviteID uuid.UUID, res partystore.DeclineResult) {
	if r.cfg.inbox == nil {
		return
	}
	r.cfg.inbox.send(inviterPod, letter{Kind: letterPartyReply, Payload: map[string]interface{}{
		"invite_id": inviteID.String(),
		"party_id":  res.Party.ID.String(),
		"leader_id": res.Party.Leader.String(),
		"name":      res.TargetName,
		"declined":  true,
	}}, func() {
		slog.Warn("party decline not sent back", "invite_id", inviteID)
	})
}

// ticks is when the hub's loop should call tick.
func (r *partyRegistry) ticks() <-chan time.Time {
	return r.cfg.ticks
}

// tick keeps the cache: open invites past their minute leave it, with no notice (R12; the leader's
// client says so); a seated player not yet read is read on arrival (R6), again each tick until a
// read succeeds; a party none of whose members is seated here is let go; and every party left is
// re-read every ten seconds (R4).
func (r *partyRegistry) tick(ctx context.Context) {
	if r.closed {
		return
	}
	at := r.cfg.now()
	for id, p := range r.parties {
		p.Reserved = r.openReservations(p)
		r.parties[id] = p
	}
	for id, remote := range r.remoteInvites {
		if at.Sub(remote.receivedAt) >= partystore.InviteTTL {
			delete(r.remoteInvites, id)
		}
	}

	seated := make(map[uuid.UUID]struct{})
	for _, id := range r.directory.SeatedPlayerIDs() {
		seated[id] = struct{}{}
	}
	for id := range r.arrived {
		if _, still := seated[id]; !still {
			delete(r.arrived, id)
		}
	}
	for id := range seated {
		_, done := r.arrived[id]
		_, underWay := r.arriving[id]
		if !done && !underWay {
			r.arrive(ctx, id)
		}
	}
	for id, p := range r.parties {
		if !anySeated(p, seated) {
			r.cacheDrop(id)
		}
	}

	if at.Sub(r.lastRefresh) >= partyRefreshInterval {
		r.lastRefresh = at
		r.refreshAll(ctx)
	}
}

func anySeated(p partystore.Party, seated map[uuid.UUID]struct{}) bool {
	for _, m := range p.Members {
		if _, here := seated[m.PlayerID]; here {
			return true
		}
	}
	return false
}

// arrive reads the party of a player newly seated here and sends them all of it, so a letter
// missed while they moved costs nothing (R6). Only a read that succeeds marks them arrived; one
// that fails, or that the runner had no room for, leaves them to be read on the next tick.
func (r *partyRegistry) arrive(ctx context.Context, playerID uuid.UUID) {
	if r.cfg.store == nil {
		return
	}
	r.arriving[playerID] = struct{}{}
	at := r.cfg.now()
	type read struct {
		party partystore.Party
		in    bool
	}
	offLoop(ctx, r,
		func(c context.Context) (read, error) {
			p, in, err := r.cfg.store.PartyOf(c, playerID, at)
			return read{party: p, in: in}, err
		},
		func(res read, err error) {
			delete(r.arriving, playerID)
			if err != nil {
				slog.Warn("party not read on arrival, tried again next tick", "player_id", playerID, "error", err)
				return
			}
			r.arrived[playerID] = struct{}{}
			if !res.in {
				return
			}
			r.cachePut(res.party)
			onArrival := partyUpdate(res.party.ID, res.party.Leader, res.party.Members, r.cfg.size, constants.PartyUpdateSync, playerID)
			if err := r.sender.SendMessageToPlayer(playerID, onArrival); err != nil {
				slog.Warn("party update on arrival not delivered", "party_id", res.party.ID, "player_id", playerID, "error", err)
			}
		},
	)
}

// refreshAll re-reads every cached party from Redis in one trip, through the runner like any
// other call: a party Redis no longer has has ended, and is let go (R4).
func (r *partyRegistry) refreshAll(ctx context.Context) {
	if r.cfg.store == nil || len(r.parties) == 0 {
		return
	}
	ids := make([]uuid.UUID, 0, len(r.parties))
	for id := range r.parties {
		ids = append(ids, id)
	}
	at := r.cfg.now()
	type refreshed struct {
		parties []partystore.Party
		gone    []uuid.UUID
	}
	offLoop(ctx, r,
		func(c context.Context) (refreshed, error) {
			parties, gone, err := r.cfg.store.RefreshAll(c, ids, at)
			return refreshed{parties: parties, gone: gone}, err
		},
		func(res refreshed, err error) {
			if err != nil {
				slog.Warn("party cache not refreshed", "parties", len(ids), "error", err)
				return
			}
			for _, id := range res.gone {
				r.cacheDrop(id)
			}
			for _, p := range res.parties {
				// a party let go while the read was under way stays let go
				if _, still := r.parties[p.ID]; still {
					r.cachePut(p)
				}
			}
		},
	)
}

// letters is where letters from other pods wait for the hub's loop.
func (r *partyRegistry) letters() <-chan letter {
	if r.cfg.inbox == nil {
		return nil
	}
	return r.cfg.inbox.letters()
}

// receive handles one letter from another pod: an invite for a player this pod holds is delivered
// to them, a decline of one of this pod's invites is told to its leader. A letter for a player
// not here is dropped.
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
	if err := r.sender.SendMessageToPlayer(target, types.Message{Action: string(constants.ActionPartyInvite), Payload: shown}); err != nil {
		slog.Debug("pod inbox invite dropped: player not here", "player_id", target, "error", err)
		return
	}
	r.remoteInvites[id] = remoteInvite{inviterPod: inviterPod, target: target, receivedAt: r.cfg.now()}
}

func (r *partyRegistry) receiveReply(l letter) {
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
	r.forgetReservation(partyID, inviteID)
	r.noticePlayer(leader, constants.PartyNoticeDeclined, name)
}

// inviteIDOf is the invite id an answer names, if it names one.
func inviteIDOf(payload map[string]interface{}) (uuid.UUID, bool) {
	raw, _ := payload["invite_id"].(string)
	id, err := uuid.Parse(raw)
	return id, err == nil
}

// update sends the party as it now stands to every member this pod holds: why, and whom it is
// about. Members elsewhere hear by letter once FS-NCC9J slice 3 fans out. FS-R82NV R21.
func (r *partyRegistry) update(p partystore.Party, reason constants.PartyUpdateReason, subject uuid.UUID) {
	msg := partyUpdate(p.ID, p.Leader, p.Members, r.cfg.size, reason, subject)
	for _, m := range p.Members {
		if err := r.sender.SendMessageToPlayer(m.PlayerID, msg); err != nil {
			slog.Warn("party update not delivered", "party_id", p.ID, "player_id", m.PlayerID, "error", err)
		}
	}
}

// partyUpdate is a party_update: the party as it stands, why, and whom it is about. size is the
// party's cap, not its count (that is len(members)), so the client can show "(<n>/<size>)".
// FS-R82NV R21, R32.
func partyUpdate(partyID, leader uuid.UUID, membersNow []partystore.Member, size int, reason constants.PartyUpdateReason, subject uuid.UUID) types.Message {
	members := make([]map[string]interface{}, len(membersNow))
	for i, m := range membersNow {
		members[i] = map[string]interface{}{
			"player_id": m.PlayerID.String(),
			"name":      m.Name,
			"class":     m.Class,
			"joined_at": m.JoinedAt.UTC().Format(time.RFC3339),
			// where and online arrive with FS-NCC9J R21 (slices 3, 4)
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

// notice tells one connection something about its party, by code; name is the player it
// concerns, when there is one. The client owns the words.
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

// WithPartyClock stamps parties and invites from now instead of the wall clock, and expires
// invites by it. FS-NCC9J R12.
func WithPartyClock(now func() time.Time) Option {
	return func(o *bootOptions) { o.partyNow = now }
}

// WithPartySize caps every party at size, members and open invites together. FS-R82NV R8.
func WithPartySize(size int) Option {
	return func(o *bootOptions) { o.partySize = size }
}

// WithPartyStore keeps parties in store, the pod's Redis in production. Without it every party
// change is refused unavailable. FS-NCC9J R1, R8.
func WithPartyStore(store partyStore) Option {
	return func(o *bootOptions) { o.partyStore = store }
}

// withPartyTicks ticks the registry when the test sends on ticks, instead of every second.
func withPartyTicks(ticks <-chan time.Time) Option {
	return func(o *bootOptions) { o.partyTicks = ticks }
}
