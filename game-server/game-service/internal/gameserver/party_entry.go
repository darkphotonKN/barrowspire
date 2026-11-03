package gameserver

import (
	"context"
	"log/slog"
	"slices"
	"sync"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* Party entry (FS-BJNYC): a party goes down the Spire together.
*
* The leader at the Spire's door sends party_enter. The party is read from Redis off the hub's loop
* and every refusal decided back on it, as travel does (R5, R6). A press that passes opens a ready
* check: one per party, held in this pod's memory, the leader accepted from the start, everyone else
* waiting 30 s (R7–R12). Each answer and each change is shown to every member of the check. When
* the last member accepts, every member's gear and the party are read again off the loop, and back
* on it the run is built here from the roster, as start_solo builds one for one player; no handoff,
* since everyone is already in the leader's pod's town (R11, R13). The pod remembers which party
* each such run was built from (R14); the party's Redis structure is untouched. A leader whose
* connection drops inside that run hands the lead at once to the earliest-joined other member (R17).
*
* Who left the town or disconnected is seen on the registry's tick and again just before the run is
* built; a membership or leader change is seen as the party cache takes it. Only the hub's loop
* touches what is here.
**/

// partyEntryWorlds is what party entry needs from this pod's worlds: where the leader and the
// members stand, their gear, and the run built for them.
type partyEntryWorlds interface {
	// whether the player stands at the Spire's door in the hub (FS-0XMCP R12)
	AtSpireGate(playerID uuid.UUID) bool
	// every player connected here and seated in the hub, the town, with their connection (R4)
	TownConns() map[uuid.UUID]*websocket.Conn
	// whether the player is connected here at all, in any world or none
	GetConnFromPlayer(playerID uuid.UUID) (*websocket.Conn, bool)
	PlayerByID(playerID uuid.UUID) (*types.Player, bool)
	// the gear read start_solo makes off the loop (checkGear); blocks
	CheckLoadout(ctx context.Context, player *types.Player) error
	// whether any of these players is a released escapee whose run has not settled; blocks
	// (FS-QPDKN R33)
	Settling(ctx context.Context, playerIDs ...uuid.UUID) bool
	CreateGameSession(players *types.ResolvedMatchedPlayers) *game.Session
	GetGameSession(id uuid.UUID) (*game.Session, bool)
}

// readyCheckWindow is how long members have to answer. FS-BJNYC R7.
const readyCheckWindow = 30 * time.Second

// partyEntryMinMembers is the fewest members a party can enter a run with. FS-BJNYC R3.
const partyEntryMinMembers = 2

// readyMember is one member on a ready check.
type readyMember struct {
	id    uuid.UUID
	name  string
	state constants.ReadyCheckState
	// the connection they stood in the town on as the check opened: one seen on another since
	// dropped meanwhile
	conn *websocket.Conn
}

// readyCheck is a party's one open ready check (R12).
type readyCheck struct {
	id      uuid.UUID
	partyID uuid.UUID
	leader  uuid.UUID
	// the party's version as read at the press: a cached copy no newer is no change
	version int64
	// the roster as read at the press, in join order
	members  []readyMember
	deadline time.Time
	// every member accepted: gear and the party are being read, answers and the clock no longer
	// count
	starting bool
}

func (c *readyCheck) member(playerID uuid.UUID) *readyMember {
	for i := range c.members {
		if c.members[i].id == playerID {
			return &c.members[i]
		}
	}
	return nil
}

func (c *readyCheck) allAccepted() bool {
	for _, m := range c.members {
		if m.state != constants.ReadyCheckAccepted {
			return false
		}
	}
	return true
}

// namesIn are the names of the members in state, in join order.
func (c *readyCheck) namesIn(state constants.ReadyCheckState) []string {
	var names []string
	for _, m := range c.members {
		if m.state == state {
			names = append(names, m.name)
		}
	}
	return names
}

// sameRoster reports whether p lists exactly the check's members, led by its leader.
func (c *readyCheck) sameRoster(p partystore.Party) bool {
	if p.Leader != c.leader || len(p.Members) != len(c.members) {
		return false
	}
	for i, m := range p.Members {
		if m.PlayerID != c.members[i].id {
			return false
		}
	}
	return true
}

// partyRun is what a pod remembers of a run it built for a party: the party and the roster it went
// down with, in join order (R14). In memory only; the lock reads it (I-BJNYC-6), and succession
// falls back on its roster (R17). matched marks a random match's party, which its members leave as
// they leave the run (FS-988SM R1, R11); a party that entered from the gate is not.
type partyRun struct {
	partyID uuid.UUID
	roster  []uuid.UUID
	matched bool
}

// inParty reports whether the pod's party cache knows playerID as a member of a party, a party of
// just its leader included. It reads the cache alone, on the hub's loop, and asks Redis nothing
// (FS-BJNYC R1, R2).
func (r *partyRegistry) inParty(playerID uuid.UUID) bool {
	return r.cache.grouped(playerID)
}

// entryRead is a press's read off the loop: the party as Redis holds it, and whether any of its
// members is settling (FS-QPDKN R33).
type entryRead struct {
	partystore.Arrival
	settling bool
}

// enter handles party_enter from the leader on conn: the party, and its members' settling marks,
// are read off the loop, then answered by entered. A press while the last one is still being read
// is ignored. The hub has already answered a leader with no character or already in a run, as
// start_solo answers them (R5).
func (r *partyRegistry) enter(ctx context.Context, leader *types.Player, conn *websocket.Conn) {
	if r.closed {
		return
	}
	if _, reading := r.entryReads[leader.ID]; reading {
		slog.Debug("party_enter pressed again while being read, ignored", "player_id", leader.ID)
		return
	}
	if r.cfg.store == nil || r.cfg.worlds == nil {
		r.refuse(conn, leader.ID, constants.PartyNoticeUnavailable)
		return
	}
	r.entryReads[leader.ID] = struct{}{}
	at, worlds := r.cfg.now(), r.cfg.worlds
	onRunner(ctx, r.run,
		func(c context.Context) (entryRead, error) {
			res, err := r.cfg.store.PartyOf(c, leader.ID, at)
			if err != nil || !res.In {
				return entryRead{Arrival: res}, err
			}
			return entryRead{Arrival: res, settling: worlds.Settling(c, memberIDs(res.Party)...)}, nil
		},
		func(res entryRead, err error) {
			delete(r.entryReads, leader.ID)
			r.entered(ctx, leader, conn, res, err)
		},
	)
}

// entered answers a press with the party as Redis holds it: R5's refusals in order, or the ready
// check opened. The cache never decides who enters (R6). A party with a settling member stays in
// the town until that member's run settles, since their bag must stay home (FS-QPDKN R33).
func (r *partyRegistry) entered(ctx context.Context, leader *types.Player, conn *websocket.Conn, res entryRead, err error) {
	if r.closed {
		return
	}
	if err != nil {
		slog.Warn("party_enter: party not read", "player_id", leader.ID, "error", err)
		r.refuse(conn, leader.ID, constants.PartyNoticeUnavailable)
		return
	}
	r.cache.sweptBy(ctx, res.Arrival)
	p := res.Party
	switch {
	case !res.In:
		r.refuse(conn, leader.ID, constants.PartyNoticeNotMember)
	case p.Leader != leader.ID:
		r.refuse(conn, leader.ID, constants.PartyNoticeNotLeader)
	case r.locked(ctx, p):
		r.refuse(conn, leader.ID, constants.PartyNoticeLocked)
	case len(p.Members) < partyEntryMinMembers:
		r.refuse(conn, leader.ID, constants.PartyNoticeTooFew)
	case r.checks[p.ID] != nil:
		r.refuse(conn, leader.ID, constants.PartyNoticeChecking)
	case !r.cfg.worlds.AtSpireGate(leader.ID):
		r.refuse(conn, leader.ID, constants.PartyNoticeNotAtGate)
	case res.settling:
		r.refuse(conn, leader.ID, constants.PartyNoticeSettling)
	default:
		town := r.cfg.worlds.TownConns()
		if absent := r.absentFromTown(p, town); len(absent) > 0 {
			slog.Debug("party action refused", "player_id", leader.ID, "code", constants.PartyNoticeNotInTown)
			r.noticeNames(conn, constants.PartyNoticeNotInTown, absent)
			return
		}
		r.openCheck(p, town)
	}
}

// absentFromTown are the names of p's members not seated in this pod's hub, in join order: on
// another pod, in a field, in a run, away, disconnected, or let go to travel (R4).
func (r *partyRegistry) absentFromTown(p partystore.Party, town map[uuid.UUID]*websocket.Conn) []string {
	var absent []string
	for _, m := range p.Members {
		_, here := town[m.PlayerID]
		_, going := r.letGo[m.PlayerID]
		if !here || going {
			absent = append(absent, m.Name)
		}
	}
	return absent
}

// openCheck opens p's ready check: the leader accepted, everyone else waiting, 30 s on the clock,
// every member shown it. Only a party of two or more gets here (R3, R5).
func (r *partyRegistry) openCheck(p partystore.Party, town map[uuid.UUID]*websocket.Conn) {
	check := &readyCheck{
		id:       r.cfg.newID(),
		partyID:  p.ID,
		leader:   p.Leader,
		version:  p.Version,
		deadline: r.cfg.now().Add(readyCheckWindow),
	}
	for _, m := range p.Members {
		state := constants.ReadyCheckWaiting
		if m.PlayerID == p.Leader {
			state = constants.ReadyCheckAccepted
		}
		check.members = append(check.members, readyMember{id: m.PlayerID, name: m.Name, state: state, conn: town[m.PlayerID]})
	}
	r.checks[p.ID] = check
	slog.Info("Party ready check opened", "party_id", p.ID, "check_id", check.id, "members", len(check.members))
	r.tellCheck(check, constants.ReadyCheckOpen, "", nil)
}

// ready handles party_ready from a member: their answer, if they are waiting on that open check.
// Anything else (a check not open, someone not on it, an answer already given, a check already
// starting) is ignored (R9).
func (r *partyRegistry) ready(ctx context.Context, player *types.Player, _ *websocket.Conn, payload map[string]interface{}) {
	if r.closed {
		return
	}
	raw, _ := payload["check_id"].(string)
	checkID, err := uuid.Parse(raw)
	accept, isBool := payload["accept"].(bool)
	if err != nil || !isBool {
		slog.Debug("party_ready malformed, ignored", "player_id", player.ID)
		return
	}
	check := r.checkByID(checkID)
	if check == nil || check.starting {
		slog.Debug("party_ready for no open check, ignored", "player_id", player.ID, "check_id", checkID)
		return
	}
	m := check.member(player.ID)
	if m == nil || m.state != constants.ReadyCheckWaiting {
		slog.Debug("party_ready from someone not waiting on the check, ignored", "player_id", player.ID, "check_id", checkID)
		return
	}
	if !accept {
		m.state = constants.ReadyCheckDeclined
		r.cancelCheck(check, constants.ReadyCheckReasonDeclined, []string{m.name})
		return
	}
	m.state = constants.ReadyCheckAccepted
	r.tellCheck(check, constants.ReadyCheckOpen, "", nil)
	if check.allAccepted() {
		r.startCheck(ctx, check)
	}
}

func (r *partyRegistry) checkByID(checkID uuid.UUID) *readyCheck {
	for _, c := range r.checks {
		if c.id == checkID {
			return c
		}
	}
	return nil
}

// cancelCheck closes check, every member told why and whom it concerns (R10). Nobody moves. A
// check already closed is not told again.
func (r *partyRegistry) cancelCheck(check *readyCheck, reason constants.ReadyCheckReason, names []string) {
	if r.checks[check.partyID] != check {
		return
	}
	delete(r.checks, check.partyID)
	slog.Info("Party ready check cancelled", "party_id", check.partyID, "check_id", check.id, "reason", reason)
	r.tellCheck(check, constants.ReadyCheckCancelled, reason, names)
}

// startCheck begins the start of a check every member accepted: every member's gear is read off
// the loop, at once, bounded as start_solo's read is (R11).
func (r *partyRegistry) startCheck(ctx context.Context, check *readyCheck) {
	check.starting = true
	players, ok := r.entrants(check)
	if !ok {
		return
	}
	checkID, partyID, worlds, jobs := check.id, check.partyID, r.cfg.worlds, r.jobs
	go func() {
		unread := readEntrantsGear(ctx, worlds, players)
		jobs.post(ctx, func() { r.gearRead(ctx, checkID, partyID, unread) })
	}()
}

// entrants are this pod's records of check's members, in join order; or, having cancelled the
// check for the first with no record left here (disconnected past their grace), false.
func (r *partyRegistry) entrants(check *readyCheck) ([]*types.Player, bool) {
	players := make([]*types.Player, 0, len(check.members))
	for _, m := range check.members {
		player, here := r.cfg.worlds.PlayerByID(m.id)
		if !here {
			r.cancelCheck(check, constants.ReadyCheckReasonDisconnected, []string{m.name})
			return nil, false
		}
		players = append(players, player)
	}
	return players, true
}

// readEntrantsGear reads every entrant's gear at once and returns the ids of those whose gear could
// not be read. Off the loop.
func readEntrantsGear(ctx context.Context, worlds partyEntryWorlds, players []*types.Player) map[uuid.UUID]bool {
	var mu sync.Mutex
	var wg sync.WaitGroup
	unread := make(map[uuid.UUID]bool)
	for _, player := range players {
		wg.Add(1)
		go func(player *types.Player) {
			defer wg.Done()
			readCtx, cancel := context.WithTimeout(ctx, fieldReadTimeout)
			err := worlds.CheckLoadout(readCtx, player)
			cancel()
			if err != nil {
				slog.Warn("Party entry: gear unreadable", "player_id", player.ID, "error", err)
				mu.Lock()
				unread[player.ID] = true
				mu.Unlock()
			}
		}(player)
	}
	wg.Wait()
	return unread
}

// gearRead goes on with a start once the gear is read: unreadable gear cancels it, failed and named
// (an entry fails closed rather than seat unread gear); otherwise the party is read again. A check
// cancelled meanwhile is let go.
func (r *partyRegistry) gearRead(ctx context.Context, checkID, partyID uuid.UUID, unread map[uuid.UUID]bool) {
	check := r.startingCheck(checkID, partyID)
	if check == nil {
		return
	}
	if len(unread) > 0 {
		var names []string
		for _, m := range check.members {
			if unread[m.id] {
				names = append(names, m.name)
			}
		}
		r.cancelCheck(check, constants.ReadyCheckReasonFailed, names)
		return
	}
	leader, at := check.leader, r.cfg.now()
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.Arrival, error) { return r.cfg.store.PartyOf(c, leader, at) },
		func(res partystore.Arrival, err error) { r.partyReread(ctx, checkID, partyID, res, err) },
	)
}

// startingCheck is the check checkID of party partyID, if it is still open and starting.
func (r *partyRegistry) startingCheck(checkID, partyID uuid.UUID) *readyCheck {
	if r.closed {
		return nil
	}
	check := r.checks[partyID]
	if check == nil || check.id != checkID || !check.starting {
		return nil
	}
	return check
}

// partyReread builds the run with the party as Redis now holds it: only for the check's own roster,
// every member still in the town; Redis unreachable or a run not built fails it, no names (R11).
func (r *partyRegistry) partyReread(ctx context.Context, checkID, partyID uuid.UUID, res partystore.Arrival, err error) {
	check := r.startingCheck(checkID, partyID)
	if check == nil {
		return
	}
	if err != nil {
		slog.Warn("Party entry: party not read again", "party_id", partyID, "error", err)
		r.cancelCheck(check, constants.ReadyCheckReasonFailed, nil)
		return
	}
	r.cache.sweptBy(ctx, res)
	if !res.In || res.Party.ID != partyID || !check.sameRoster(res.Party) {
		r.cancelCheck(check, constants.ReadyCheckReasonChanged, nil)
		return
	}
	if reason, names := r.departures(check, r.cfg.worlds.TownConns()); reason != "" {
		r.cancelCheck(check, reason, names)
		return
	}
	r.buildRun(check)
}

// buildRun builds one run for every member of check, seated together, and sends each in: started,
// then world_entered, as start_solo sends it (R13). The pod remembers the run's party (R14).
func (r *partyRegistry) buildRun(check *readyCheck) {
	players, ok := r.entrants(check)
	if !ok {
		return
	}
	roster := make([]uuid.UUID, 0, len(players))
	for _, p := range players {
		roster = append(roster, p.ID)
	}
	run := r.cfg.worlds.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: players})
	if run == nil {
		r.cancelCheck(check, constants.ReadyCheckReasonFailed, nil)
		return
	}
	delete(r.checks, check.partyID)
	r.partyRuns[run.ID] = partyRun{partyID: check.partyID, roster: roster}
	slog.Info("Party run started", "session_id", run.ID, "party_id", check.partyID, "members", len(roster))

	r.tellCheck(check, constants.ReadyCheckStarted, "", nil)
	entered := worldEnteredMessage(run)
	for _, id := range roster {
		if err := r.sender.SendMessageToPlayer(id, entered); err != nil {
			slog.Warn("Could not tell a party member their run started", "player_id", id, "error", err)
		}
	}
}

// departures is why check cannot go on for where its members stand, and whom it concerns: the
// first member, in join order, not standing in the town on the connection they stood on as it
// opened decides the reason (left, or disconnected), and everyone gone the same way is named.
// "" when everyone is still in the town; the gate zone does not count (R10).
func (r *partyRegistry) departures(check *readyCheck, town map[uuid.UUID]*websocket.Conn) (constants.ReadyCheckReason, []string) {
	var reason constants.ReadyCheckReason
	var names []string
	for _, m := range check.members {
		gone := r.departure(m, town)
		if gone == "" || (reason != "" && gone != reason) {
			continue
		}
		reason = gone
		names = append(names, m.name)
	}
	return reason, names
}

// departure is how m has left the town, or "" if they stand in it still.
func (r *partyRegistry) departure(m readyMember, town map[uuid.UUID]*websocket.Conn) constants.ReadyCheckReason {
	if _, going := r.letGo[m.id]; going {
		return constants.ReadyCheckReasonLeft
	}
	if conn, here := town[m.id]; here {
		if conn == m.conn {
			return ""
		}
		// back on another connection: they dropped meanwhile
		return constants.ReadyCheckReasonDisconnected
	}
	if _, connected := r.cfg.worlds.GetConnFromPlayer(m.id); connected {
		// a field, a run, or the roster
		return constants.ReadyCheckReasonLeft
	}
	return constants.ReadyCheckReasonDisconnected
}

// dropped hands the loop a member whose connection dropped, a drop they did not choose, while
// their record named world. Called off the loop, by the connection's reader, once the member is
// held for the reconnect grace.
func (r *partyRegistry) dropped(ctx context.Context, playerID, world uuid.UUID) {
	r.jobs.post(ctx, func() { r.droppedIn(ctx, playerID, world) })
}

// droppedIn passes the lead at once to the earliest-joined other member when the one who dropped
// led a party in its run and stood in it (R17): by the transfer script, every member told as for
// any change of leader. Succession never asks the lock. Anywhere else, and for a party of one,
// nothing happens here; the reconnect grace and FS-NCC9J's rules go on as they are (R16).
//
// The party as the cache holds it decides who leads and who joined first. Should the cache have let
// the party go meanwhile, the roster it went down with stands in, and the script finds out whether
// they led.
func (r *partyRegistry) droppedIn(ctx context.Context, playerID, world uuid.UUID) {
	if r.closed || r.cfg.store == nil || r.cfg.worlds == nil {
		return
	}
	run, ok := r.partyRuns[world]
	if !ok || !slices.Contains(run.roster, playerID) {
		return
	}
	if _, exists := r.cfg.worlds.GetGameSession(world); !exists {
		r.runGone(ctx, world)
		return
	}
	members := run.roster
	p, held := r.cache.party(run.partyID)
	if held {
		if p.Leader != playerID {
			return
		}
		members = memberIDs(p)
	}
	successor, found := earliestOther(members, playerID)
	if !found {
		return
	}
	partyID := run.partyID
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.TransferResult, error) {
			return r.cfg.store.Transfer(c, partyID, playerID, successor)
		},
		func(res partystore.TransferResult, err error) {
			if err != nil {
				slog.Warn("party lead not passed on the leader's drop", "party_id", partyID, "player_id", playerID, "error", err)
				return
			}
			if res.Refusal != "" {
				if !held {
					// the roster stood in for a party the cache had let go: nobody may lead the run now
					slog.Warn("party lead not passed on a drop, the cache's party gone", "party_id", partyID, "player_id", playerID, "refusal", res.Refusal)
					return
				}
				slog.Debug("party lead not passed on a drop", "party_id", partyID, "player_id", playerID, "refusal", res.Refusal)
				return
			}
			slog.Info("Party lead passed on the leader's drop in its run", "party_id", partyID, "leader", successor)
			r.cache.put(res.Party)
			r.announce(ctx, updateOf(res.Party, constants.PartyUpdateLeader, successor))
		},
	)
}

// earliestOther is the first of members, in join order, who is not playerID.
func earliestOther(members []uuid.UUID, playerID uuid.UUID) (uuid.UUID, bool) {
	for _, id := range members {
		if id != playerID {
			return id, true
		}
	}
	return uuid.Nil, false
}

// tickChecks is the ready checks' share of the registry's tick: a check whose member left the town
// or disconnected is cancelled, then one whose 30 s ran out with members still waiting (R10); and a
// run that no longer exists is forgotten, its matched party losing whoever it still held
// (FS-988SM R11).
func (r *partyRegistry) tickChecks(ctx context.Context) {
	if r.cfg.worlds == nil || (len(r.checks) == 0 && len(r.partyRuns) == 0) {
		return
	}
	if len(r.checks) > 0 {
		at, town := r.cfg.now(), r.cfg.worlds.TownConns()
		for _, check := range r.checks {
			if check.starting {
				continue
			}
			if reason, names := r.departures(check, town); reason != "" {
				r.cancelCheck(check, reason, names)
				continue
			}
			if !at.Before(check.deadline) {
				r.cancelCheck(check, constants.ReadyCheckReasonTimeout, check.namesIn(constants.ReadyCheckWaiting))
			}
		}
	}
	for runID := range r.partyRuns {
		if _, exists := r.cfg.worlds.GetGameSession(runID); !exists {
			r.runGone(ctx, runID)
		}
	}
}

// partyChanged is told every party the cache takes, and every party it lets go (ended): a change
// of membership or leader newer than the press cancels its open check, no names (R10). A starting
// check is cancelled too; its start then finds it gone.
func (r *partyRegistry) partyChanged(partyID uuid.UUID, p partystore.Party, ended bool) {
	check := r.checks[partyID]
	if check == nil {
		return
	}
	if !ended && (p.Version <= check.version || check.sameRoster(p)) {
		return
	}
	r.cancelCheck(check, constants.ReadyCheckReasonChanged, nil)
}

// tellCheck shows check as it now stands to every member of it: each member's state, the time left
// by this pod's clock, the outcome, and on a cancel why and whom it concerns (R8).
func (r *partyRegistry) tellCheck(check *readyCheck, outcome constants.ReadyCheckOutcome, reason constants.ReadyCheckReason, names []string) {
	msg := readyCheckMessage(check, r.cfg.now(), outcome, reason, names)
	for _, m := range check.members {
		if err := r.sender.SendMessageToPlayer(m.id, msg); err != nil {
			slog.Debug("party_ready_check not delivered", "player_id", m.id, "error", err)
		}
	}
}

func readyCheckMessage(check *readyCheck, now time.Time, outcome constants.ReadyCheckOutcome, reason constants.ReadyCheckReason, names []string) types.Message {
	members := make([]map[string]interface{}, 0, len(check.members))
	for _, m := range check.members {
		members = append(members, map[string]interface{}{
			"player_id": m.id.String(),
			"name":      m.name,
			"state":     string(m.state),
		})
	}
	left := check.deadline.Sub(now)
	if left < 0 {
		left = 0
	}
	payload := map[string]interface{}{
		"check_id":      check.id.String(),
		"leader_id":     check.leader.String(),
		"expires_in_ms": left.Milliseconds(),
		"members":       members,
		"outcome":       string(outcome),
	}
	if outcome == constants.ReadyCheckCancelled {
		if names == nil {
			names = []string{}
		}
		payload["reason"] = string(reason)
		payload["names"] = names
	}
	return types.Message{Action: string(constants.ActionPartyReadyCheck), Payload: payload}
}

// noticeNames tells one connection something about its party that concerns several players, by
// code, as { code, names }.
func (r *partyRegistry) noticeNames(conn *websocket.Conn, code constants.PartyNoticeCode, names []string) {
	msg := types.Message{
		Action:  string(constants.ActionPartyNotice),
		Payload: map[string]interface{}{"code": string(code), "names": names},
	}
	if err := r.sender.SendMessageToConn(conn, msg); err != nil {
		slog.Warn("party notice not delivered", "code", code, "error", err)
	}
}
