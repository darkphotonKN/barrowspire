package gameserver

import (
	"context"
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
	// who a name or player id is among the players seated here, in any world (R11, same pod)
	SeatedPlayer(nameOrID string) (types.Player, bool)
	// every player this pod holds, and the world each stands in: who hears an update here (R5)
	PresentPlayers() []presentPlayer
	// everyone this pod holds, seated in any world, and the connection each is seated on: whose
	// parties the cache keeps and whose screens it reconciles (R4, R6)
	SeatedConns() map[uuid.UUID]*websocket.Conn
	// whether a player is inside a run, where accepting is refused locked (R14)
	InRun(playerID uuid.UUID) bool
	// a traveller let go over conn, and kept after all when the travel did not take them (R19)
	LetGo(playerID uuid.UUID, conn *websocket.Conn)
	TakeBack(playerID uuid.UUID, conn *websocket.Conn)
	IsQueued(ctx context.Context, playerID uuid.UUID) (bool, error)
}

// partyStore is a party's state in Redis, every change one script: partystore.Redis in
// production (R1, R2).
type partyStore interface {
	Create(ctx context.Context, partyID uuid.UUID, creator partystore.Joiner, now time.Time) (partystore.CreateResult, error)
	Invite(ctx context.Context, a partystore.InviteArgs) (partystore.InviteResult, error)
	Withdraw(ctx context.Context, inviteID uuid.UUID, endIfAlone bool, now time.Time) (partystore.WithdrawResult, error)
	Accept(ctx context.Context, a partystore.AcceptArgs) (partystore.AcceptResult, error)
	Decline(ctx context.Context, a partystore.DeclineArgs) (partystore.DeclineResult, error)
	Remove(ctx context.Context, a partystore.RemoveArgs) (partystore.RemoveResult, error)
	Transfer(ctx context.Context, partyID, leader, target uuid.UUID) (partystore.TransferResult, error)
	// what the party cache reads with: the registry hands the store to it
	partyReader
	// what the server reads as a player enters the hub, to let one joining their leader past the
	// cap (FS-NCC9J R20)
	partyLeaders
}

// presenceLookup finds players present on any pod: partypresence.Redis in production (R7).
type presenceLookup interface {
	Lookup(ctx context.Context, nameOrID string) (partypresence.Found, bool, error)
	// where each of these players stands, in one trip; an absent one is left out (R5)
	LookupIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]partypresence.Found, error)
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

// partyTickInterval is how often the hub's loop ticks the registry.
const partyTickInterval = time.Second

// defaultPartySize is the party cap when the pod is given none. FS-R82NV R8.
const defaultPartySize = 2

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
	// how full each pod's hub is, read before a travel; nil checks no pod's room (FS-NCC9J R18)
	occupancy hubOccupancyReader
}

type partyRegistry struct {
	directory partyDirectory
	sender    partySender
	cfg       partyRegistryConfig

	run     *partyRunner
	cache   *partyCache
	courier *partyCourier

	// travellers this pod has let go (R19), with the connection and until when: one still here on
	// it once the window passes was not taken by the travel, and is taken back
	letGo map[uuid.UUID]travelLetGo
	// travellers whose press is being read off the loop: a second press meanwhile is ignored
	travelReads map[uuid.UUID]struct{}

	// set as the pod shuts down: party actions are ignored from then on
	closed bool
	done   chan struct{}
}

func newPartyRegistry(directory partyDirectory, sender partySender, jobs loopJobs, cfg partyRegistryConfig) *partyRegistry {
	r := &partyRegistry{
		directory:   directory,
		sender:      sender,
		cfg:         cfg,
		run:         newPartyRunner(jobs),
		letGo:       make(map[uuid.UUID]travelLetGo),
		travelReads: make(map[uuid.UUID]struct{}),
		done:        make(chan struct{}),
	}
	r.courier = newPartyCourier(cfg.inbox, sender, jobs, cfg.podID, r.heardUpdate)
	var reader partyReader
	if cfg.store != nil {
		reader = cfg.store
	}
	r.cache = newPartyCache(reader, r.run, directory, cfg.now, r.show, r.swept)
	return r
}

// start runs the registry's runner for the life of ctx.
func (r *partyRegistry) start(ctx context.Context) { r.run.start(ctx) }

// close stops the registry as the pod shuts down. Nothing is dissolved: a party outlives any pod
// (ADR-0036); this pod's players simply stop being seated here, and their parties live on in Redis.
func (r *partyRegistry) close() {
	if r.closed {
		return
	}
	r.closed = true
	r.run.stop()
	close(r.done)
}

// stopped closes once the registry has closed.
func (r *partyRegistry) stopped() <-chan struct{} { return r.done }

func joinerOf(player *types.Player) partystore.Joiner {
	return partystore.Joiner{PlayerID: player.ID, Name: player.Character.Name, Class: player.Character.Class}
}

// invite handles party_invite from inviter on conn: refused with a notice, or a slot reserved in
// the inviter's party (created if they have none) and the invite delivered to the target. A target
// connected to this pod, in any world, is answered from the cache; anyone else is looked up in the
// presence index off the loop first. FS-NCC9J R9–R11.
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

	if target, here := r.directory.SeatedPlayer(name); here {
		if refusal := r.targetRefusal(inviter, target.ID, target.Character.Name); refusal != nil {
			r.refuseInvite(conn, inviter.ID, refusal)
			return
		}
		r.sendInvite(ctx, inviter, conn, target.ID, target.Character.Name, "")
		return
	}
	if r.cfg.presence == nil || !r.courier.open() {
		r.refuseInvite(conn, inviter.ID, &inviteRefusal{code: constants.PartyNoticeNotFound, name: name})
		return
	}
	r.lookUp(ctx, inviter, conn, name)
}

// lookedUp is what was read off the loop for an invite to a target on another pod: where the
// target stands, and whether the inviter has joined the Spire queue meanwhile.
type lookedUp struct {
	found   partypresence.Found
	present bool
	queued  bool
	err     error
}

// lookUp reads the target's presence, and the inviter's queue entry again, on the runner, then
// hands the answer back to the loop: the loop never waits on Redis, and the invite keeps its place
// among this pod's party calls, so a leave sent after it reaches Redis after it (I-NCC9J-3 review).
func (r *partyRegistry) lookUp(ctx context.Context, inviter *types.Player, conn *websocket.Conn, name string) {
	onRunner(ctx, r.run,
		func(c context.Context) (lookedUp, error) {
			var res lookedUp
			res.found, res.present, res.err = r.cfg.presence.Lookup(c, name)
			queued, err := r.directory.IsQueued(c, inviter.ID)
			if err != nil {
				slog.Warn("Could not read queue entry for a party invite, treating as not queued", "player_id", inviter.ID, "error", err)
			}
			res.queued = queued
			return res, nil
		},
		func(res lookedUp, err error) {
			if err != nil {
				res.err = err
			}
			r.inviteThere(ctx, inviter, conn, name, res)
		},
	)
}

// inviteThere finishes an invite whose target was looked up: the inviter's standing is checked
// again, since the loop went on while Redis answered, then the rest of R10's list.
func (r *partyRegistry) inviteThere(ctx context.Context, inviter *types.Player, conn *websocket.Conn, name string, res lookedUp) {
	if r.closed {
		return
	}
	found, present := res.found, res.present
	if res.err != nil {
		slog.Warn("party invite lookup failed", "player_id", inviter.ID, "error", res.err)
		r.refuseInvite(conn, inviter.ID, &inviteRefusal{code: constants.PartyNoticeDeliveryFailed, name: name})
		return
	}
	refusal := r.leadRefusal(inviter)
	if refusal == nil && res.queued {
		refusal = &inviteRefusal{code: constants.PartyNoticeQueued}
	}
	if refusal == nil {
		refusal = r.roomRefusal(inviter, name)
	}
	// present nowhere, or named as on this pod though it no longer holds them (the index lags)
	if refusal == nil && (!present || found.PodID == r.cfg.podID) {
		refusal = &inviteRefusal{code: constants.PartyNoticeNotFound, name: name}
	}
	// a target on another pod: this pod's cache never holds their party, so pending is left to
	// the script, which checks already_in_party first, as R10 orders them (I-NCC9J-3 review)
	if refusal == nil {
		refusal = r.groupedRefusal(found.PlayerID, found.Name)
	}
	if refusal != nil {
		r.refuseInvite(conn, inviter.ID, refusal)
		return
	}
	r.sendInvite(ctx, inviter, conn, found.PlayerID, found.Name, found.PodID)
}

// sendInvite runs the invite script off the loop; targetPod is "" for a target this pod holds.
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
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.InviteResult, error) { return r.cfg.store.Invite(c, args) },
		func(res partystore.InviteResult, err error) { r.invited(ctx, inviter, conn, args, targetPod, res, err) },
	)
}

// invited delivers a written invite. A target this pod holds is prompted at once; one that cannot
// be is withdrawn, with the party it created, so an invite nobody saw forms no party and holds no
// place (I-NCC9J-1 D6). The leader of a party the invite created hears of it only once it is
// delivered. A target on another pod gets a letter. Every member hears of the new reserved slot.
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
	r.cache.put(res.Party)
	prompt := types.Message{Action: string(constants.ActionPartyInvite), Payload: r.invitePayload(args, res.Party, inviter)}

	if targetPod == "" {
		if err := r.sender.SendMessageToPlayer(args.TargetID, prompt); err != nil {
			slog.Warn("party invite not delivered", "party_id", res.Party.ID, "target_id", args.TargetID, "error", err)
			// told once the slot is free in Redis, so their next invite meets it free
			r.withdraw(ctx, res.Party.ID, args.InviteID, args.TargetID, res.Formed, func(partystore.Party) {
				r.notice(conn, constants.PartyNoticeDeliveryFailed, args.TargetName)
			})
			return
		}
		r.announce(ctx, r.invitedUpdate(res, args))
		r.notice(conn, constants.PartyNoticeSent, args.TargetName)
		return
	}

	r.announce(ctx, r.invitedUpdate(res, args))
	partyID, inviteID, targetID, targetName := res.Party.ID, args.InviteID, args.TargetID, args.TargetName
	r.courier.sendInvite(ctx, targetPod, args.TargetID, prompt.Payload, func() { r.undelivered(ctx, partyID, inviteID, targetID, targetName) })
	r.notice(conn, constants.PartyNoticeSent, args.TargetName)
}

// invitedUpdate is what members hear of a written invite: the leader of a party it created that
// they joined it, everyone else that a slot is now reserved (FS-NCC9J R21).
func (r *partyRegistry) invitedUpdate(res partystore.InviteResult, args partystore.InviteArgs) partyUpdate {
	if res.Formed {
		return updateOf(res.Party, constants.PartyUpdateJoined, res.Party.Leader)
	}
	return updateOf(res.Party, constants.PartyUpdateInvited, args.TargetID)
}

// undelivered withdraws an invite whose letter was never published, telling whoever leads now.
// FS-NCC9J R11.
func (r *partyRegistry) undelivered(ctx context.Context, partyID, inviteID, targetID uuid.UUID, targetName string) {
	if r.closed {
		return
	}
	r.withdraw(ctx, partyID, inviteID, targetID, false, func(p partystore.Party) {
		// the party as Redis left it, so the leader is found even off this pod's cache
		if p.Leader != uuid.Nil {
			r.noticeAnywhere(ctx, p.Leader, constants.PartyNoticeDeliveryFailed, targetName)
		}
	})
}

// withdraw spends an undelivered invite in Redis, and the party with it when formed (the invite
// created it) and nothing else has come into it since (I-NCC9J-1 D6); the cache follows what
// Redis did, then then runs on the loop with the party as it stands (zero if it ended). An invite Redis could not withdraw lapses at its minute;
// a party it formed stands meanwhile, so its leader is told of it after all.
func (r *partyRegistry) withdraw(ctx context.Context, partyID, inviteID, targetID uuid.UUID, formed bool, then func(p partystore.Party)) {
	at := r.cfg.now()
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.WithdrawResult, error) {
			return r.cfg.store.Withdraw(c, inviteID, formed, at)
		},
		func(res partystore.WithdrawResult, err error) {
			switch {
			case err != nil:
				slog.Warn("party invite not withdrawn, left to lapse", "invite_id", inviteID, "error", err)
				p, cached := r.cache.party(partyID)
				then(p)
				if cached && formed {
					r.announce(ctx, updateOf(p, constants.PartyUpdateJoined, p.Leader))
				}
			case res.Ended:
				r.cache.drop(partyID)
				then(partystore.Party{})
			case res.Party.ID == uuid.Nil:
				// nothing left to withdraw: it lapsed, or was answered, meanwhile
				p, _ := r.cache.party(partyID)
				then(p)
			default:
				if _, cached := r.cache.party(partyID); cached {
					r.cache.put(res.Party)
				}
				then(res.Party)
				r.announce(ctx, updateOf(res.Party, constants.PartyUpdateInviteEnded, targetID))
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
	if p, inParty := r.cache.partyOf(inviter.ID); inParty && p.Leader != inviter.ID {
		return &inviteRefusal{code: constants.PartyNoticeNotLeader}
	}
	return nil
}

// roomRefusal is the head of R10's list, which needs no target: a full party, counting its open
// invites, and naming yourself.
func (r *partyRegistry) roomRefusal(inviter *types.Player, name string) *inviteRefusal {
	// a player with no party would lead one of one, never full at size two or more
	if p, inParty := r.cache.partyOf(inviter.ID); inParty && len(p.Members)+len(r.cache.openReservations(p)) >= r.cfg.size {
		return &inviteRefusal{code: constants.PartyNoticePartyFull}
	}
	if strings.EqualFold(name, inviter.Character.Name) || strings.EqualFold(name, inviter.ID.String()) {
		return &inviteRefusal{code: constants.PartyNoticeSelf}
	}
	return nil
}

// targetRefusal is the tail of R10's list for a target this pod holds, as far as the cache knows:
// the target in a party, then already asked. The script checks both again.
func (r *partyRegistry) targetRefusal(inviter *types.Player, targetID uuid.UUID, targetName string) *inviteRefusal {
	if refusal := r.groupedRefusal(targetID, targetName); refusal != nil {
		return refusal
	}
	return r.pendingRefusal(inviter, targetID, targetName)
}

// groupedRefusal is already_in_party, if the cache knows the target as a member.
func (r *partyRegistry) groupedRefusal(targetID uuid.UUID, targetName string) *inviteRefusal {
	if r.cache.grouped(targetID) {
		return &inviteRefusal{code: constants.PartyNoticeAlreadyInParty, name: targetName}
	}
	return nil
}

// pendingRefusal is pending, if the inviter's party already holds an open invite to the target.
func (r *partyRegistry) pendingRefusal(inviter *types.Player, targetID uuid.UUID, targetName string) *inviteRefusal {
	if p, inParty := r.cache.partyOf(inviter.ID); inParty {
		for _, res := range r.cache.openReservations(p) {
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
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.AcceptResult, error) { return r.cfg.store.Accept(c, args) },
		func(res partystore.AcceptResult, err error) { r.accepted(ctx, conn, accepter, res, err) },
	)
}

// acceptRefusal is why player cannot accept now, as far as the cache knows, or "": already in a
// party, queued for the Spire, inside a run (R14).
func (r *partyRegistry) acceptRefusal(ctx context.Context, player *types.Player) constants.PartyNoticeCode {
	if r.cache.grouped(player.ID) {
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
// as it now stands; and each party whose invite to them it voided that the slot is free, its
// leader why.
func (r *partyRegistry) accepted(ctx context.Context, conn *websocket.Conn, accepter *types.Player, res partystore.AcceptResult, err error) {
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
	r.cache.put(res.Party)
	r.announce(ctx, updateOf(res.Party, constants.PartyUpdateJoined, accepter.ID))
	for _, v := range res.Voided {
		if _, cached := r.cache.party(v.PartyID); cached {
			r.cache.put(v.Party)
		}
		r.noticeAnywhere(ctx, v.LeaderID, constants.PartyNoticeAlreadyInParty, v.TargetName)
		r.announce(ctx, updateOf(v.Party, constants.PartyUpdateInviteEnded, v.TargetID))
	}
}

// create handles party_create: the player leads a new party of one, from any world. FS-NCC9J R15.
func (r *partyRegistry) create(ctx context.Context, creator *types.Player, conn *websocket.Conn) {
	if r.closed {
		return
	}
	if r.cache.grouped(creator.ID) {
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
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.CreateResult, error) {
			return r.cfg.store.Create(c, partyID, joiner, at)
		},
		func(res partystore.CreateResult, err error) {
			if r.failedOrRefused(conn, creator.ID, "party not created", res.Refusal, err) {
				return
			}
			r.cache.put(res.Party)
			r.announce(ctx, updateOf(res.Party, constants.PartyUpdateJoined, creator.ID))
		},
	)
}

// leave handles party_leave: the member leaves and stays where they stand. FS-R82NV R20.
func (r *partyRegistry) leave(ctx context.Context, leaver *types.Player, conn *websocket.Conn) {
	if r.closed {
		return
	}
	p, in := r.cache.partyOf(leaver.ID)
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
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.TransferResult, error) {
			return r.cfg.store.Transfer(c, partyID, leader.ID, target)
		},
		func(res partystore.TransferResult, err error) {
			if r.failedOrRefused(conn, leader.ID, "party lead not transferred", res.Refusal, err) {
				return
			}
			r.cache.put(res.Party)
			r.announce(ctx, updateOf(res.Party, constants.PartyUpdateLeader, target))
		},
	)
}

// leaderTargetOrRefuse is the leader's party and the member payload's target_id names; or, having
// told the sender why not, false. A leader naming themselves is ignored: the panel never offers it.
func (r *partyRegistry) leaderTargetOrRefuse(ctx context.Context, leader *types.Player, conn *websocket.Conn, payload map[string]interface{}) (partystore.Party, uuid.UUID, bool) {
	p, in := r.cache.partyOf(leader.ID)
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
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.RemoveResult, error) { return r.cfg.store.Remove(c, args) },
		func(res partystore.RemoveResult, err error) {
			if r.failedOrRefused(conn, askerID, "party member not removed", res.Refusal, err) {
				return
			}
			r.removed(ctx, args, res, reason)
		},
	)
}

func (r *partyRegistry) removed(ctx context.Context, args partystore.RemoveArgs, res partystore.RemoveResult, reason constants.PartyUpdateReason) {
	removed := args.PlayerID
	if res.Ended {
		// the last member: the party with nobody left, about them
		r.cache.drop(args.PartyID)
		ended := partystore.Party{ID: args.PartyID, Leader: removed}
		r.announce(ctx, partyUpdate{party: ended, reason: reason, subject: removed, to: removed, ended: true})
		return
	}

	r.cache.put(res.Party)
	items := removalUpdates(res.Party, removed, reason)
	if res.Succeeded {
		items = append(items, updateOf(res.Party, constants.PartyUpdateLeader, res.Party.Leader))
	}
	r.announce(ctx, items...)
}

// removalUpdates are what a removal tells: the removed player their last update, the party without
// them, about them (R21); the rest why.
func removalUpdates(p partystore.Party, removed uuid.UUID, reason constants.PartyUpdateReason) []partyUpdate {
	return []partyUpdate{
		{party: p, reason: reason, subject: removed, to: removed, final: true},
		updateOf(p, reason, removed),
	}
}

// swept tells what keeping p's member records changed (FS-NCC9J R17): each member removed as their
// record expired left, then, if the lead passed, who leads; a member who only went away or came
// back is told as the party resent as it stands, a sync about them.
func (r *partyRegistry) swept(ctx context.Context, p partystore.Party, s partystore.Swept) {
	var items []partyUpdate
	for _, id := range s.Removed {
		items = append(items, removalUpdates(p, id, constants.PartyUpdateLeft)...)
	}
	if s.Succeeded {
		items = append(items, updateOf(p, constants.PartyUpdateLeader, p.Leader))
	}
	if len(items) == 0 && len(s.Flipped) > 0 {
		items = append(items, updateOf(p, constants.PartyUpdateSync, s.Flipped[0]))
	}
	if len(items) > 0 {
		r.announce(ctx, items...)
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
	args := partystore.DeclineArgs{InviteID: inviteID, DeclinerID: decliner.ID, Now: r.cfg.now()}
	onRunner(ctx, r.run,
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
			if _, cached := r.cache.party(res.Party.ID); cached {
				r.cache.put(res.Party)
			}
			r.noticeAnywhere(ctx, res.Party.Leader, constants.PartyNoticeDeclined, res.TargetName)
			r.announce(ctx, updateOf(res.Party, constants.PartyUpdateInviteEnded, decliner.ID))
		},
	)
}

// ticks is when the hub's loop should call tick.
func (r *partyRegistry) ticks() <-chan time.Time {
	return r.cfg.ticks
}

// tick keeps the party cache, and takes back any traveller the travel did not take.
func (r *partyRegistry) tick(ctx context.Context) {
	if r.closed {
		return
	}
	r.takeBackLapsed(ctx)
	r.cache.tick(ctx)
}

// letters is where letters from other pods wait for the hub's loop.
func (r *partyRegistry) letters() <-chan letter { return r.courier.letters() }

// receive handles one letter from another pod.
func (r *partyRegistry) receive(l letter) { r.courier.receive(l) }

// notice tells one connection something about its party, by code; name is the player it
// concerns, when there is one. The client owns the words.
func (r *partyRegistry) notice(conn *websocket.Conn, code constants.PartyNoticeCode, name string) {
	if err := r.sender.SendMessageToConn(conn, partyNotice(code, name)); err != nil {
		slog.Warn("party notice not delivered", "code", code, "error", err)
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
