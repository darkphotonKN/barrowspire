package matchmaker

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"errors"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

var (
	ErrPlayerAlreadyQueued = errors.New("player already queued")
)

/**
* Player queue system - uses channel to listen for players joining matchmaking
**/

type matchmaker struct {
	// how many people needed to start game
	matchSize       int
	MatchedChan     chan []*types.Player // legacy
	QueueStatusChan chan QueueStatus

	matchQueue MatchQueue

	mu      sync.Mutex
	players []*types.Player
}

// QueueStatus used to notify queue status
type QueueStatus struct {
	Players []*types.Player
	Current int
	Total   int
}

func NewMatchmaker(matchSize int) *matchmaker {
	return &matchmaker{
		matchSize:       matchSize,
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
	PlayerID string
	Pod      string
}

// Start launches queue listening
func (q *matchmaker) Start() {
	go q.MatchQueue()
	slog.Info("Queue service started, waiting for players to join...")
}

// AddPlayer adds player to matchmaking queue (via channel)
func (q *matchmaker) AddPlayer(player *types.Player) error {
	err := q.PlayerJoinQueue(player)

	if err != nil {
		return err
	}

	return nil
}

// matchQueue checks queue once per second
func (q *matchmaker) MatchQueue() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		// send value from chan once per second
		case <-ticker.C:
			{
				q.mu.Lock()

				// players enough
				if len(q.players) >= q.matchSize {
					matched := make([]*types.Player, q.matchSize)
					copy(matched, q.players[:q.matchSize])
					q.players = q.players[q.matchSize:]

					q.mu.Unlock()

					slog.Debug("Match found.")
					q.MatchedChan <- matched
					continue
				}
				// player not enough
				if len(q.players) > 0 {
					players := make([]*types.Player, len(q.players))
					copy(players, q.players)

					q.mu.Unlock()

					slog.Debug("Waiting",
						"total_players", len(players),
						"match_size", q.matchSize,
					)

					go func() {
						q.QueueStatusChan <- QueueStatus{
							Players: players,
							Current: len(players),
							Total:   q.matchSize,
						}
					}()
					continue
				}

				q.mu.Unlock()
			}
		}
	}
}

// handlePlayerJoinQueue handles logic for player joining queue
func (q *matchmaker) PlayerJoinQueue(player *types.Player) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	for _, p := range q.players {
		if p.ID == player.ID {
			slog.Error("player already exists", "player_id", player.ID)
			return game.ErrPlayerAlreadyInQueue
		}
	}
	q.players = append(q.players, player)
	slog.Debug("Player joined queue.",
		"player_username", player.Username,
	)
	return nil
}

// TODO: disconnect remove player
func (q *matchmaker) PlayerRemoveQueue(player *types.Player) {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i, p := range q.players {
		if p.ID == player.ID {
			q.players = append(q.players[:i], q.players[i+1:]...)
			return
		}
	}
}

func (q *matchmaker) GetMatchedChan() chan []*types.Player {
	return q.MatchedChan
}

func (q *matchmaker) GetQueueStatusChan() chan QueueStatus {
	return q.QueueStatusChan
}
