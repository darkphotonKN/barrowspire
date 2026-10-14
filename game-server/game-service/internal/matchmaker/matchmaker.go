package matchmaker

import (
	"context"
	"log/slog"
	"time"

	"errors"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

var (
	ErrPlayerAlreadyQueued       = errors.New("player already queued")
	ErrRetryMaxAttemptsExhausted = errors.New("retry max attempts exhausted")
	ErrNoPodsListening           = errors.New("no pods listening")
)

const (
	timeoutTime      = time.Second * 5
	matchReadyBuffer = 5
)

type MatchReadyCh chan MatchStart
type MatchStep string

const (
	MatchStepCreate  MatchStep = "match step create"
	MatchStepHandoff MatchStep = "match step handoff"
)

type MatchStart struct {
	PodID string    `json:"pod_id"` // must match id of appointed pod
	Step  MatchStep `json:"step"`
	// list of players for this step
	PlayerIDs []uuid.UUID `json:"players"`
}

/**
* Player queue system. uses an ephemeral state manager to make the queue work cross server instances
**/

type matchmaker struct {
	// how many people needed to start game
	matchSize       int
	matchedChan     chan []*types.Player
	QueueStatusChan chan QueueStatus
	matchQueue      MatchQueue
	matchAnnouncer  MatchAnnouncer

	// this replicas pod id, recorded against every player it queues
	podID string

	matchReadyCh MatchReadyCh
}

// QueueStatus used to notify queue status
type QueueStatus struct {
	Players []*types.Player
	Current int
	Total   int
}

func NewMatchmaker(matchSize int, podID string, matchQueue MatchQueue) *matchmaker {
	return &matchmaker{
		matchSize:       matchSize,
		podID:           podID,
		matchedChan:     make(chan []*types.Player),
		QueueStatusChan: make(chan QueueStatus),
		matchQueue:      matchQueue,
		matchReadyCh:    make(MatchReadyCh, matchReadyBuffer),
	}
}

// external state store to manage queue and player pod state across server instances
type MatchQueue interface {
	QueuePlayer(ctx context.Context, playerID, pod string, character types.CharacterInPlay) error
	DequeuePlayer(ctx context.Context, playerID string) error
	Matchmake(ctx context.Context, matchCriteria MatchCriteria) ([]MatchedPlayer, error) // list of playerIDs that successfully matched
	MarkPodAlive(ctx context.Context, podID string) error                                // liveness heartbeat, lapses on its own if this pod stops calling
	QueuedPlayers(ctx context.Context, podID string) (int, []string, error)              // global queue length, and podID's queued players in queue order
}

type MatchCriteria struct {
	MatchSize int
}

type MatchedPlayer struct {
	ID  string `json:"id"`
	Pod string `json:"pod"`
	// character in play they queued with, the host builds the run from it
	Character types.CharacterInPlay `json:"character"`
}

type MatchAnnouncer interface {
	Announce(ctx context.Context, payload MatchStart) error
}

// Start launches queue listening
func (q *matchmaker) Start(ctx context.Context) {
	go q.MatchLoop(ctx)
	go q.heartbeatLoop(ctx)
	go q.queueStatusLoop(ctx)
	go q.MatchReady(ctx)
	slog.Info("Queue service started, waiting for players to join...")
}

// heartbeatLoop keeps this pod marked alive about once a second, so the match
// loop on any pod can tell its queued players from a crashed pod's leftovers
func (q *matchmaker) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	// beat once right away, so the pod counts as alive from boot rather than a tick later
	q.markAlive(ctx)

	for {
		select {
		// parent ctx gets cancelled we stop beating, the alive marker then lapses on its own
		case <-ctx.Done():
			return

		case <-ticker.C:
			q.markAlive(ctx)
		}
	}
}

func (q *matchmaker) markAlive(ctx context.Context) {
	// add timeout for external state taking too long, a stuck call must not outlive the next beat by much
	beatCtx, cancel := context.WithTimeout(ctx, timeoutTime)
	defer cancel()

	// a missed beat is tolerated by the alive marker's expiry, so log and keep going
	if err := q.matchQueue.MarkPodAlive(beatCtx, q.podID); err != nil {
		slog.Warn("heartbeat failed to mark pod alive", "pod_id", q.podID, "err", err)
	}
}

// matchQueue checks queue once per second
func (q *matchmaker) MatchLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		// parent ctx gets cancelled we exit loop
		case <-ctx.Done():
			return

		case <-ticker.C:
			// add timeout for external state taking too long
			tickCtx, cancel := context.WithTimeout(ctx, timeoutTime)
			matchedPlayersRes, err := q.matchQueue.Matchmake(tickCtx, MatchCriteria{MatchSize: q.matchSize})
			cancel()

			if err != nil {
				// log exception errors to track what happened
				slog.Error("MatchQueue matchmake tick exception", "err", err)
				continue
			}

			// no results yet Matchmake returns nil matchedPlayerRes and nil error
			if matchedPlayersRes == nil {
				continue
			}
			slog.Debug("match found in tick", "matched_players_res", matchedPlayersRes)

			// found result, validate and announce to other pods before starting game

			matchedPlayersIds := make([]uuid.UUID, 0, len(matchedPlayersRes))

			// stores errored players map
			matchedPlayerErrored := make(map[string]struct{}, 0)

			for _, player := range matchedPlayersRes {
				id, err := uuid.Parse(player.ID)

				// cant parse playerID, corrupted player data, drop him, requeue the rest
				// also enter block if already one errored player (length of matchedPlayerErr)
				if err != nil {
					// add to error list and skip, not checked here as requeueing the others on the spot means each one in a nested loop could also error and need its own check
					matchedPlayerErrored[player.ID] = struct{}{}
					continue
				}
				// skip if there are already errored players
				if len(matchedPlayerErrored) > 0 {
					continue
				}

				// only send ids, look up for the rest is updated to be done by the caller
				matchedPlayersIds = append(matchedPlayersIds, id)
			}

			// requeue unerrored players
			if len(matchedPlayerErrored) > 0 {
				slog.Error("corruption in UUID of queued player", "matched_player_errored", matchedPlayerErrored)

				// skip errored players and requeue the rest
				q.requeueUnerroredPlayers(ctx, matchedPlayersRes, matchedPlayerErrored)

				// requeuing, skip announcing match
				continue
			}

			// announce match start to host pod
			//TODO: implement better host pod selection
			// host pod now is the first player's pod
			payload := MatchStart{
				PodID:     matchedPlayersRes[0].Pod,
				Step:      MatchStepCreate,
				PlayerIDs: matchedPlayersIds,
			}

			// TODO: add a circuit breaker so repeated announce failures fail fast.
			// After a few failures in a row, stop popping players for a backoff
			// that doubles each time it trips, and reset on the first success.
			// Guard the Matchmake pop, not the announce, so players wait in the
			// queue instead of being popped and requeued every tick.
			err = q.matchAnnouncer.Announce(ctx, payload)

			if err != nil {
				if errors.Is(err, ErrNoPodsListening) {

					// not suposed to happen, so log loudly
					slog.Error("no pods listenign when match intended to start", "host_pod_id_attempted_to_start", payload.PodID, "playerIDs", matchedPlayersIds)
					continue
				}

				// log unexpected redis error
				slog.Warn("unexpected redis error", "err", err)
			}
		}
	}
}

func (q *matchmaker) requeueUnerroredPlayers(ctx context.Context, matchedPlayers []MatchedPlayer, erroredPlayers map[string]struct{}) {
	for _, playerToRequeue := range matchedPlayers {
		if _, ok := erroredPlayers[playerToRequeue.ID]; ok {
			continue
		}

		// requeue player
		err := q.matchQueue.QueuePlayer(ctx, playerToRequeue.ID, playerToRequeue.Pod, playerToRequeue.Character)
		// new boundary is here, so log directly for errors
		if err != nil {
			slog.Warn("requeueing player couldnt join queue", "err", err)
		}
	}
}

// queueStatusLoop reports the global queue's progress to this pod's queued
// players about once a second. Every pod runs it, separate from matching, so
// status keeps flowing whichever pod won the match round.
func (q *matchmaker) queueStatusLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		// parent ctx gets cancelled we exit loop
		case <-ctx.Done():
			return

		case <-ticker.C:
			q.reportQueueStatus(ctx)
		}
	}
}

func (q *matchmaker) reportQueueStatus(ctx context.Context) {
	// add timeout for external state taking too long
	statusCtx, cancel := context.WithTimeout(ctx, timeoutTime)
	queueLen, podPlayerIDs, err := q.matchQueue.QueuedPlayers(statusCtx, q.podID)
	cancel()

	if err != nil {
		slog.Warn("MatchQueue queue status tick exception", "err", err)
		return
	}

	players := make([]*types.Player, 0, len(podPlayerIDs))
	for _, playerID := range podPlayerIDs {
		id, err := uuid.Parse(playerID)

		// corrupted id, the match loop deals with it when popped; just skip it here
		if err != nil {
			slog.Warn("corruption in UUID of queued player, skipping queue status", "player_id", playerID)
			continue
		}

		// only send ids, look up for the rest is done by the caller
		players = append(players, &types.Player{ID: id})
	}

	// nobody queued on this pod, nobody here to tell
	if len(players) == 0 {
		return
	}

	// the panel shows progress toward the next match, the global queue can briefly
	// hold more than one group between match ticks
	current := min(queueLen, q.matchSize)

	select {
	// send to message hub
	case q.QueueStatusChan <- QueueStatus{
		Players: players,
		Current: current,
		Total:   q.matchSize,
	}:
	// fallback incase stuck and ctx was cancelled
	case <-ctx.Done():
	// a snapshot is stale by the next tick anyway, drop it rather than block if the hub is busy
	case <-time.After(time.Second):
		slog.Debug("dropped queue status, hub busy")
	}
}

// handlePlayerJoinQueue handles logic for player joining queue
func (q *matchmaker) PlayerJoinQueue(ctx context.Context, player *types.Player) error {
	slog.Debug("Matchmake, attempting to queue", "player_username", player.Username)

	// add timeout for external state taking too long
	queueCtx, queueCtxCanc := context.WithTimeout(ctx, timeoutTime)
	defer queueCtxCanc()

	err := q.matchQueue.QueuePlayer(queueCtx, player.ID.String(), q.podID, player.Character)

	if err != nil {
		// no retry
		if errors.Is(err, ErrPlayerAlreadyQueued) {
			slog.Info("player already queued but requeue was attempted", "err", err)
			return err
		}

		slog.Warn("player met exceptional error when attempting to queue, requeueing", "err", err)

		return err
	}

	return nil
}

func (q *matchmaker) PlayerRemoveQueue(ctx context.Context, player *types.Player) error {
	retries := 0
	maxRetries := 5

	for retries < maxRetries {
		// add timeout for external state taking too long
		queueCtx, queueCtxCanc := context.WithTimeout(ctx, timeoutTime)
		defer queueCtxCanc()
		err := q.matchQueue.DequeuePlayer(queueCtx, player.ID.String())

		if err != nil {
			slog.Warn("met exceptional error when attempting to dequeue, requeueing", "err", err)

			// exception, retry in 1 second
			select {
			case <-time.After(time.Second):
				retries++
				continue
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		return nil
	}

	// tried all 5 times, log error and pass down
	slog.Error("max attempts exhausted trying to retry dequeue player", "player_id", player.ID, "pod_id", q.podID)
	return ErrRetryMaxAttemptsExhausted
}

func (q *matchmaker) GetMatchedChan(ctx context.Context) chan []*types.Player {
	return q.matchedChan
}

func (q *matchmaker) GetQueueStatusChan(ctx context.Context) chan QueueStatus {
	return q.QueueStatusChan
}

// Match ready handling loop
func (q *matchmaker) MatchReady(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			if errors.Is(ctx.Err(), context.Canceled) {
				slog.Info("MatchReady loop context cancelled", "err", ctx.Err())
			}
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				slog.Info("MatchReady loop context deadline reached", "err", ctx.Err())
			}
			return

		case matchReadyPayload, ok := <-q.matchReadyCh:
			// handle channel closed
			if !ok {
				slog.Info("MatchReady loop received channel closed")
				return
			}

			slog.Debug("Recieved match ready", "matchReadyPayload", matchReadyPayload)

			// validate message was sent to the correct pod
			if matchReadyPayload.PodID != q.podID {
				slog.Error("match ready loop recieved wrong payload for the wrong pod", "pod_id_from_payload", matchReadyPayload.PodID)
				continue
			}

			// correct message payload sent, now check which step to handle
			switch matchReadyPayload.Step {

			case MatchStepCreate:
				if len(matchReadyPayload.PlayerIDs) <= 0 {
					slog.Error("match ready loop recieved empty PlayerIDs", "pod_id", matchReadyPayload.PodID)
					continue
				}

				players := make([]*types.Player, 0, len(matchReadyPayload.PlayerIDs))
				for _, player := range matchReadyPayload.PlayerIDs {
					players = append(players, &types.Player{
						ID: player,
					},
					)
				}

				select {
				case <-ctx.Done():
					if errors.Is(ctx.Err(), context.Canceled) {
						slog.Info("MatchReady loop, sending players to matchedChan, context cancelled", "err", ctx.Err())
					}
					if errors.Is(ctx.Err(), context.DeadlineExceeded) {
						slog.Warn("MatchReady loop, sending players to matchedChan, context deadline reached", "err", ctx.Err())
					}
					return

				case <-time.After(time.Second * 5):
					slog.Error("sending players to matchedChan, matchedChan unresponsive for 5 seconds", "players_dropped_ids", matchReadyPayload.PlayerIDs)

					continue
				case q.matchedChan <- players:
				}

			// handoff to player clients about us
			case MatchStepHandoff:
				continue

			default:
				slog.Info("match ready payload with unexpected step recieved", "match_ready_payload_step", matchReadyPayload.Step)
				continue
			}
		}
	}
}
