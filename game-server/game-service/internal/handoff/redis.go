package handoff

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/redis/go-redis/v9"
)

// Enables cross server instances / pods to start a game once queue
// has found matching group of players
// Subscribers are the pods, and one pod publishes the result. The chosen pod
// is the one that initializes the game session instance as well as recreate
// the websocket connections with the players from other pods
type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{
		client: client,
	}
}

const (
	matchStartChannelKey = "matchstart:pod:"
)

// announce match found tasks to all the pods subscribed
func (h *Redis) Announce(ctx context.Context, matchedPlayers []*types.Player) error {
	return nil
}

// listen for match found announcements
func (h *Redis) Listen(ctx context.Context, podID string, matchReadyCh matchmaker.MatchReadyCh) error {
	sub := h.client.Subscribe(ctx, matchStartChannelKey+podID)
	defer sub.Close()

	// listen to announcements of match starts
	for {
		select {
		// clean up
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-sub.Channel():
			if !ok {
				return fmt.Errorf("handoff listen sub channel closed")
			}

			var matchStart matchmaker.MatchStart

			err := json.Unmarshal([]byte(msg.Payload), &matchStart)

			if err != nil {
				slog.Warn("unmarshal match start payload from handoff listen", "err", err)
				continue
			}

			select {
			case <-ctx.Done():
				return ctx.Err()
			case matchReadyCh <- matchStart:
				continue
				// stop waiting if throttled for 1 second, buffered channel shouldn't hog
				// resources for this long
			case <-time.After(time.Second * 1):
				continue
			}
		}
	}
}
