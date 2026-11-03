package gameserver

import (
	"context"
	"log/slog"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The matched party (FS-988SM, ADR-0039): the party a random match's strangers make for their run.
*
* The party comes first, then the run (R3a). When the host pod receives a MatchStart, the registry
* makes one party of every matched player, all at once, by one script off the hub's loop: the pod's
* local players and those still on other pods, members before anyone is seated (R3). Its record
* carries the matched origin, which no message carries. A leader is drawn at random among the local
* players, reachable from the run's first tick, and joins first; the other locals follow, then the
* remote players in match order (R4).
*
* Back on the loop, the registry hands the script's answer to the hub, which decides the match and
* answers with the run it created, if any, and the local players it left out of it:
*   - made: the run is remembered as the party's with every member on its roster, as a party
*     entry's is (R5), so the instance lock holds it; every member the run kept is told they joined
*     (R19), a remote one wherever they stand. Seating a remote adds nothing (R6).
*   - a matched player already in a party: nothing was written, and the hub cancels the match (R8,
*     R8a). The registry does nothing more.
*   - Redis failed: whether anyone is in a party is unknown, and the run goes on (R9). The script
*     may still have committed, so the run remembers the party it tried as if made, and its members
*     leave it as they leave the run; a party never written answers each of them not_member.
* A local player the run left out after all (gone in the Redis round trip) leaves the party as one
* leaving the run does. With no run, the match failed, and every member is let go without a word:
* nobody was told they joined, so nobody is told they left (R8a, R19).
*
* A member leaves the party as they leave the run (R11): their seat released before they ever
* arrived, counting as dead (R7); a dead delver going home early; the run's end sending them home;
* their reconnect grace running out, or their connection closed for good. Each way hands their id
* over to the registry, which takes them out of the party on its loop, with the remove script,
* reason left (R12). Succession is the script's own, and the last one out is told dissolved (R13,
* R14). A run forgotten takes out whoever its party still held, so nobody comes home in it.
* Watching is not leaving: a dead or escaped member still in the run stays a member (R15). A party
* that entered from the gate is never touched (R1). A removal Redis failed is tried again on every
* tick until the script answers (R17), since a member still seated here keeps their record alive.
**/

// matchedOutcome is how a random match's party answered, handed to the hub to decide the match.
type matchedOutcome struct {
	// a matched player already in a party: nothing was written, and the match is to be cancelled
	// (R8); inParty names them
	cancelled bool
	inParty   []uuid.UUID
}

// matchedRun is the hub's answer to a matched party's outcome: the run it created, uuid.Nil for
// none, and the local matched players it left out of it after all (FS-988SM R4).
type matchedRun struct {
	id   uuid.UUID
	left []uuid.UUID
}

// formMatched makes the matched party of a random match about to start here, from every matched
// player: locals, connected here, and remotes, on other pods, in match order. formed is handed the
// outcome back on the loop, decides the match and answers with the run it created; with no party
// to make here, it is handed an empty outcome at once. Called on the hub's loop; it never waits on
// Redis.
func (r *partyRegistry) formMatched(ctx context.Context, locals, remotes []*types.Player, formed func(matchedOutcome) matchedRun) {
	if r.closed || r.cfg.store == nil || len(locals) == 0 {
		run := formed(matchedOutcome{})
		slog.Debug("no matched party on this pod, the run starts without one", "session_id", run.id)
		return
	}
	joiners := leaderFirst(locals, r.cfg.pickLeader(len(locals)))
	for _, player := range remotes {
		joiners = append(joiners, joinerOf(player))
	}
	args := partystore.MatchedArgs{
		PartyID: r.cfg.newID(),
		Joiners: joiners,
		Size:    r.cfg.size,
		Now:     r.cfg.now(),
	}
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.MatchedResult, error) { return r.cfg.store.CreateMatched(c, args) },
		func(res partystore.MatchedResult, err error) { r.formedMatched(ctx, args, formed, res, err) },
	)
}

// leaderFirst are local players as they join a matched party: the one at leader first, the rest
// in their match order (R4).
func leaderFirst(players []*types.Player, leader int) []partystore.Joiner {
	joiners := make([]partystore.Joiner, 0, len(players))
	joiners = append(joiners, joinerOf(players[leader]))
	for i, player := range players {
		if i != leader {
			joiners = append(joiners, joinerOf(player))
		}
	}
	return joiners
}

// formedMatched takes a matched create's outcome on the loop and hands it to the hub: a player
// found in a party cancels the match, and nothing more is done; otherwise the run the hub created
// is remembered as the party's, and a party made is cached and told to every member the run kept,
// each about themselves.
func (r *partyRegistry) formedMatched(ctx context.Context, args partystore.MatchedArgs, formed func(matchedOutcome) matchedRun, res partystore.MatchedResult, err error) {
	if err != nil {
		run := formed(matchedOutcome{})
		slog.Warn("matched party not created, the run goes on without it", "session_id", run.id, "party_id", args.PartyID, "error", err)
		// the script may have committed before the call gave up: the run remembers the party it
		// tried, so its members leave it as they leave the run (R9, R11)
		roster := make([]uuid.UUID, 0, len(args.Joiners))
		for _, j := range args.Joiners {
			roster = append(roster, j.PlayerID)
		}
		r.matchedRunStarted(ctx, run, args.PartyID, roster)
		return
	}
	if res.Refusal != "" {
		formed(matchedOutcome{cancelled: true, inParty: res.InParty})
		return
	}
	for _, id := range res.NoRoom {
		slog.Info("matched player past the party size, plays outside the matched party", "player_id", id)
	}

	p := res.Party
	run := formed(matchedOutcome{})
	slog.Info("Matched party formed for its run", "session_id", run.id, "party_id", p.ID, "members", len(p.Members))
	if run.id != uuid.Nil {
		// cached only for a run: a cached party is resent to its members as it changes
		r.cache.put(p)
		joined := make([]partyUpdate, 0, len(p.Members))
		for _, id := range memberIDs(p) {
			if !slices.Contains(run.left, id) {
				joined = append(joined, partyUpdate{party: p, reason: constants.PartyUpdateJoined, subject: id, to: id})
			}
		}
		r.announce(ctx, joined...)
	}
	r.matchedRunStarted(ctx, run, p.ID, memberIDs(p))
}

// matchedRunStarted remembers run as the matched party's, with roster on it (R5), and takes out of
// the party whoever the run left out (R4, R11). With no run, the match failed: every member is let
// go quietly, as a cancelled match sends no party_update (R19).
func (r *partyRegistry) matchedRunStarted(ctx context.Context, run matchedRun, partyID uuid.UUID, roster []uuid.UUID) {
	if run.id == uuid.Nil {
		for _, id := range roster {
			r.leaveMatched(ctx, matchedLeave{partyID: partyID, playerID: id, quiet: true})
		}
		return
	}
	r.partyRuns[run.id] = partyRun{partyID: partyID, roster: roster, matched: true}
	r.leftIn(ctx, run.id, run.left)
}

// heardMatchFailed refuses a player connected here find_game, as a match_failed letter from the pod
// that hosted their match asks: it was cancelled (R8a). A player no longer here is told nothing.
func (r *partyRegistry) heardMatchFailed(playerID uuid.UUID) {
	if r.cfg.worlds == nil {
		return
	}
	conn, here := r.cfg.worlds.GetConnFromPlayer(playerID)
	if !here {
		slog.Debug("match failed letter dropped: player not here", "player_id", playerID)
		return
	}
	if err := r.sender.SendMessageToConn(conn, refusal(string(constants.ActionFindGame), matchFailedRefusal)); err != nil {
		slog.Warn("Could not tell a matched player their match failed", "player_id", playerID, "error", err)
	}
}

// sendMatchFailed tells a player on podID, by a letter to that pod, that the match hosted here was
// cancelled; their own pod refuses them find_game (R8a).
func (r *partyRegistry) sendMatchFailed(podID string, playerID uuid.UUID) {
	r.courier.sendMatchFailed(podID, playerID)
}

// matchedLeave is one member's removal from a matched party as they leave the run (R11).
type matchedLeave struct {
	partyID  uuid.UUID
	playerID uuid.UUID
	// the match failed before any run: nobody is told (R19)
	quiet bool
}

// leftRun hands members who have left run to the hub's loop, which takes them out of its matched
// party: a seat released, a dead delver gone home early, the run's end sending them home, a
// reconnect grace run out, a connection closed for good (R7, R11). Called from the run's tick, the
// hub's loop and a connection's reader or grace timer alike, none of which may wait on the loop, so
// the hand-over waits on its own (R17). A member handed over twice leaves once.
func (r *partyRegistry) leftRun(ctx context.Context, runID uuid.UUID, memberIDs ...uuid.UUID) {
	go r.jobs.post(ctx, func() { r.leftIn(ctx, runID, memberIDs) })
}

// leftIn takes each member who left run out of its matched party, as they have left the run (R11):
// the run's roster forgets them at once, and the party loses them by the remove script. A party
// that entered from the gate is left as it is (R1). A run this pod no longer remembers is skipped:
// its end already took out everyone still on its roster (runGone).
func (r *partyRegistry) leftIn(ctx context.Context, runID uuid.UUID, memberIDs []uuid.UUID) {
	if r.closed || r.cfg.store == nil {
		return
	}
	run, ok := r.partyRuns[runID]
	if !ok || !run.matched {
		return
	}
	for _, id := range memberIDs {
		i := slices.Index(run.roster, id)
		if i < 0 {
			continue
		}
		run.roster = slices.Delete(slices.Clone(run.roster), i, i+1)
		r.leaveMatched(ctx, matchedLeave{partyID: run.partyID, playerID: id})
	}
	r.partyRuns[runID] = run
}

// runGone forgets a run that no longer exists. Its matched party loses everyone still on the
// roster, as the run's end sent them home (R11, R14): the hand-over from the run's end may reach the
// loop after the run is gone, and nobody may come home still in a matched party. A party that
// entered from the gate stands (R1).
func (r *partyRegistry) runGone(ctx context.Context, runID uuid.UUID) {
	run := r.partyRuns[runID]
	delete(r.partyRuns, runID)
	if !run.matched || r.closed || r.cfg.store == nil {
		return
	}
	for _, id := range run.roster {
		r.leaveMatched(ctx, matchedLeave{partyID: run.partyID, playerID: id})
	}
}

// leaveMatched takes a member who left the run out of its matched party, off the loop, with reason
// left: not a voluntary party_leave, so the instance lock never refuses it (R12). The others are
// told left, the leaver their last update, then who leads if the lead passed; the last one out is
// told dissolved, as the party ends with them (R13, R14, R19); a quiet leave tells nobody. A member
// already gone has left (Edge States). A removal Redis failed is tried again on the next tick, and
// the run goes on (R9, R17).
func (r *partyRegistry) leaveMatched(ctx context.Context, leave matchedLeave) {
	partyID, playerID := leave.partyID, leave.playerID
	args := partystore.RemoveArgs{PartyID: partyID, PlayerID: playerID}
	onRunner(ctx, r.run,
		func(c context.Context) (partystore.RemoveResult, error) { return r.cfg.store.Remove(c, args) },
		func(res partystore.RemoveResult, err error) {
			if err != nil {
				r.leaveLater(leave, err)
				return
			}
			delete(r.leaving, leave)
			if res.Refusal != "" {
				slog.Debug("matched party member already gone", "party_id", partyID, "player_id", playerID, "refusal", res.Refusal)
				return
			}
			if leave.quiet {
				slog.Info("Matched party member let go, the match failed", "party_id", partyID, "player_id", playerID, "ended", res.Ended)
				return
			}
			slog.Info("Matched party member left with the run", "party_id", partyID, "player_id", playerID, "ended", res.Ended)
			reason := constants.PartyUpdateLeft
			if res.Ended {
				// the last one out: the party ends with them (R14)
				reason = constants.PartyUpdateDissolved
			}
			r.removed(ctx, args, res, reason)
		},
	)
}

// matchedLeaveRetries bounds how many failed removals the registry keeps trying again: past it, a
// removal is given up, logged at Warn. Well under partyRunBuffer, so a hanging Redis leaves the
// runner room for every other party call.
const matchedLeaveRetries = 64

// matchedLeaveRetryBudget is how many failed removals one tick tries again: each may hang for
// partyCallTimeout, so a few per tick keep the runner free for the party actions players send.
const matchedLeaveRetryBudget = 8

// leaveLater keeps a removal Redis failed to try again on the next tick. A member still seated here
// keeps their record alive with every re-read, so without it they would stay in the matched party
// for good, refused find_game in town (R17, R21). Logged at Warn once, the first time it fails.
func (r *partyRegistry) leaveLater(leave matchedLeave, err error) {
	if _, waiting := r.leaving[leave]; waiting {
		r.leaving[leave] = false
		slog.Debug("matched party member still not removed, tried again next tick", "party_id", leave.partyID, "player_id", leave.playerID, "error", err)
		return
	}
	if len(r.leaving) >= matchedLeaveRetries {
		slog.Warn("matched party member not removed on leaving the run, and not tried again: too many waiting", "party_id", leave.partyID, "player_id", leave.playerID, "error", err)
		return
	}
	r.leaving[leave] = false
	slog.Warn("matched party member not removed on leaving the run, tried again each tick", "party_id", leave.partyID, "player_id", leave.playerID, "error", err)
}

// retryLeaves tries again removals Redis failed that are not already under way, up to
// matchedLeaveRetryBudget of them; the rest wait for a later tick. Part of the registry's tick.
func (r *partyRegistry) retryLeaves(ctx context.Context) {
	if r.cfg.store == nil {
		return
	}
	budget := matchedLeaveRetryBudget
	for leave, underWay := range r.leaving {
		if budget == 0 {
			return
		}
		if underWay {
			continue
		}
		budget--
		r.leaving[leave] = true
		r.leaveMatched(ctx, leave)
	}
}
