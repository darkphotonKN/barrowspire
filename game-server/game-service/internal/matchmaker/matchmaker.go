package matchmaker

import (
	"context"
	"log/slog"
	"sync"
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
	MatchedChan     chan []*types.Player // legacy
	QueueStatusChan chan QueueStatus
	matchQueue      MatchQueue

	// this replicas pod id, recorded against every player it queues
	podID string

	mu      sync.Mutex
	players []*types.Player
}

// QueueStatus used to notify queue status
type QueueStatus struct {
	Players []*types.Player
	Current int
	Total   int
}

func NewMatchmaker(matchSize int, podID string) *matchmaker {
	return &matchmaker{
		matchSize:       matchSize,
		podID:           podID,
		MatchedChan:     make(chan []*types.Player),
		QueueStatusChan: make(chan QueueStatus),
		players:         make([]*types.Player, 0, matchSize),
	}
}

// external state store to manage queue and player pod state across server instances
type MatchQueue interface {
	QueuePlayer(ctx context.Context, playerID, pod string) error
	DequeuePlayer(ctx context.Context, playerID string) error
	Matchmake(ctx context.Context, matchCriteria MatchCriteria) ([]MatchedPlayer, error) // list of playerIDs that successfully matched
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
	go q.MatchQueue(ctx)
	slog.Info("Queue service started, waiting for players to join...")
}

// matchQueue checks queue once per second
func (q *matchmaker) MatchQueue(ctx context.Context) {
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

			// no results yet
			if matchedPlayersRes == nil {
				continue
			}

			// found result, send to message hub to start game, then continue matchmaking
			matchedPlayers := make([]*types.Player, 0, len(matchedPlayersRes))

			for _, player := range matchedPlayersRes {
				id := uuid.MustParse(player.ID)

				// only send ids, look up for the rest is updated to be done by the caller
				matchedPlayers = append(matchedPlayers, &types.Player{
					ID: id,
				})
			}

			// send to channel
			q.MatchedChan <- matchedPlayers
		}
	}
}

// handlePlayerJoinQueue handles logic for player joining queue
func (q *matchmaker) PlayerJoinQueue(ctx context.Context, player *types.Player) error {
	// add timeout for external state taking too long
	queueCtx, queueCtxCanc := context.WithTimeout(ctx, timeoutTime)
	defer queueCtxCanc()

	retries := 0
	maxRetries := 5
	for retries <= maxRetries {
		err := q.matchQueue.QueuePlayer(queueCtx, player.ID.String(), q.podID)
		if err != nil {
			// no retry
			if errors.Is(err, ErrPlayerAlreadyQueued) {
				slog.Info("player already queued but requeue was attempted", "err", err)
				return err
			}

			slog.Warn("player met exceptional error when attempting to queue, requeueing", "err", err)

			// exception, retry in 1 second
			time.Sleep(time.Second)
			retries++
			continue
		}
		return nil
	}

	// tried all 5 times, log error and pass down
	slog.Error("max attempts exhausted trying to requeue player", "player_id", player.ID, "pod_id", q.podID)
	return ErrRetryMaxAttemptsExhausted
}

func (q *matchmaker) PlayerRemoveQueue(ctx context.Context, player *types.Player) error {
	// add timeout for external state taking too long
	queueCtx, queueCtxCanc := context.WithTimeout(ctx, timeoutTime)
	defer queueCtxCanc()

	retries := 0
	maxRetries := 5
	for retries <= maxRetries {
		err := q.matchQueue.DequeuePlayer(queueCtx, player.ID.String())

		if err != nil {
			slog.Warn("met exceptional error when attempting to dequeue, requeueing", "err", err)

			// exception, retry in 1 second
			time.Sleep(time.Second)
			retries++
			continue
		}
		return nil
	}

	// tried all 5 times, log error and pass down
	slog.Error("max attempts exhausted trying to retry dequeue player", "player_id", player.ID, "pod_id", q.podID)
	return ErrRetryMaxAttemptsExhausted
}

func (q *matchmaker) GetMatchedChan(ctx context.Context) chan []*types.Player {
	return q.MatchedChan
}

func (q *matchmaker) GetQueueStatusChan(ctx context.Context) chan QueueStatus {
	return q.QueueStatusChan
}
