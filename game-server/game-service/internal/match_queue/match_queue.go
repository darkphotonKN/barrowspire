package matchqueue

import (
	"context"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/redis/go-redis/v9"
)

// A redis implementation of the cross pod / server instance queue
type MatchQueue struct {
	client redis.UniversalClient
}

const (
	keyQueue     = "queue"
	keyPlayerPod = "player:pod"
)

var queueScript = redis.NewScript(`
		-- push to player to pod info on hash
		local created = redis.call("HSETNX", KEYS[2], ARGV[1], ARGV[2])

		if created == 0 then 
			return 0
		end

		-- push to the back of queue
		redis.call("RPUSH", KEYS[1], ARGV[1])

		-- success
		return 1
	`)

func (q *MatchQueue) QueuePlayer(ctx context.Context, playerID, pod string) error {
	// atomically push player to list and add their pod info to hash
	cmd := queueScript.Run(ctx, q.client, []string{keyQueue, keyPlayerPod}, playerID, pod)
	created, err := cmd.Int64()

	// return early with unexpected redis error
	if err != nil {
		return fmt.Errorf("MatchQueue QueuePlayer : %w", err)
	}

	// if already in queue, notify caller incase we add retries (don't retry when already in queue)
	if created == 0 {
		return fmt.Errorf("MatchQueue QueuePlayer : %w", matchmaker.ErrPlayerAlreadyQueued)
	}

	return nil
}

func (q *MatchQueue) DequeuePlayer(ctx context.Context) error {

	return nil
}

func (q *MatchQueue) Matchmake(ctx context.Context, matchCriteria matchmaker.MatchCriteria) ([]matchmaker.MatchedPlayer, error) {

	return nil, nil
}
