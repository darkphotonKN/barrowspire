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
)

const (
	timeoutTime = time.Second * 5
)

/**
* Player queue system - uses channel to listen for players joining matchmaking
**/

type matchmaker struct {
	// how many people needed to start game
	matchSize       int
	matchedChan     chan []*types.Player
	QueueStatusChan chan QueueStatus
	matchQueue      MatchQueue

	// this replicas pod id, recorded against every player it queues
	podID string
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
	}
}

// external state store to manage queue and player pod state across server instances
type MatchQueue interface {
	QueuePlayer(ctx context.Context, playerID, pod string) error
	DequeuePlayer(ctx context.Context, playerID string) error
	Matchmake(ctx context.Context, matchCriteria MatchCriteria) ([]MatchedPlayer, error) // list of playerIDs that successfully matched
	MarkPodAlive(ctx context.Context, podID string) error                                // liveness heartbeat, lapses on its own if this pod stops calling
}

type MatchCriteria struct {
	MatchSize int
}

type MatchedPlayer struct {
	ID  string `json:"id"`
	Pod string `json:"pod"`
}

// Start launches queue listening
func (q *matchmaker) Start(ctx context.Context) {
	go q.MatchLoop(ctx)
	go q.heartbeatLoop(ctx)
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

			// found result, send to message hub to start game, then continue matchmaking
			matchedPlayers := make([]*types.Player, 0, len(matchedPlayersRes))
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
				matchedPlayers = append(matchedPlayers, &types.Player{
					ID: id,
				})
			}

			// requeue unerrored players
			if len(matchedPlayerErrored) > 0 {
				slog.Error("corruption in UUID of queued player", "matched_player_errored", matchedPlayerErrored)

				// skip errored players and requeue the rest
				q.requeueUnerroredPlayers(ctx, matchedPlayersRes, matchedPlayerErrored)

				// requeuing, skip sendto channel
				continue
			}

			// send to channel
			select {
			// send to message hub, coordinated handoff
			case q.matchedChan <- matchedPlayers:
			// fallback incase stuck and ctx was cancelled
			case <-ctx.Done():
				return
			// second fallback if hub hangs for too long
			case <-time.After(time.Second * 5):
				slog.Warn("timed out when trying to find match for match ready players")
				q.requeueUnerroredPlayers(ctx, matchedPlayersRes, matchedPlayerErrored)
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
		err := q.matchQueue.QueuePlayer(ctx, playerToRequeue.ID, playerToRequeue.Pod)
		// new boundary is here, so log directly for errors
		if err != nil {
			slog.Warn("requeueing player couldnt join queue", "err", err)
		}
	}
}

// handlePlayerJoinQueue handles logic for player joining queue
func (q *matchmaker) PlayerJoinQueue(ctx context.Context, player *types.Player) error {
	slog.Debug("Matchmake, attempting to queue", "player_username", player.Username)

	// add timeout for external state taking too long
	queueCtx, queueCtxCanc := context.WithTimeout(ctx, timeoutTime)
	defer queueCtxCanc()

	err := q.matchQueue.QueuePlayer(queueCtx, player.ID.String(), q.podID)

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
