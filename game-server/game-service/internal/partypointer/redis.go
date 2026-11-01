// Package partypointer is the Redis side of a party (FS-R82NV §Requirements 3): the pointers
// other pods follow to find one, and nothing else. The party itself lives in its pod's memory;
// these say only where. It wraps the one go-redis client the pod already holds, as handoff and
// chatbus do.
package partypointer

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// TTL is how long a pointer outlives its last refresh: three missed beats of the party pod's
// ten-second refresh, after which the party counts as gone.
const TTL = 30 * time.Second

type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{client: client}
}

func partyKey(partyID uuid.UUID) string { return "party:" + partyID.String() }

func memberKey(playerID uuid.UUID) string { return "player:" + playerID.String() + ":party" }

// Point writes the party's pointer to podID and each member's to the party, every one for TTL.
// It is both the write on a change and the refresh: SET, not EXPIRE, so a pointer that lapsed
// while Redis was away comes back on the next call.
func (r *Redis) Point(ctx context.Context, partyID uuid.UUID, podID string, members []uuid.UUID) error {
	_, err := r.client.Pipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.Set(ctx, partyKey(partyID), podID, TTL)
		for _, member := range members {
			pipe.Set(ctx, memberKey(member), partyID.String(), TTL)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("point party %s: %w", partyID, err)
	}
	return nil
}

// ForgetParty deletes the party's pointer and each member's: the party has ended.
func (r *Redis) ForgetParty(ctx context.Context, partyID uuid.UUID, members []uuid.UUID) error {
	keys := make([]string, 0, len(members)+1)
	keys = append(keys, partyKey(partyID))
	for _, member := range members {
		keys = append(keys, memberKey(member))
	}
	if err := r.client.Del(ctx, keys...).Err(); err != nil {
		return fmt.Errorf("forget party %s: %w", partyID, err)
	}
	return nil
}

// ForgetPlayers deletes these players' pointers: they left a party that goes on.
func (r *Redis) ForgetPlayers(ctx context.Context, players []uuid.UUID) error {
	if len(players) == 0 {
		return nil
	}
	keys := make([]string, len(players))
	for i, player := range players {
		keys[i] = memberKey(player)
	}
	if err := r.client.Del(ctx, keys...).Err(); err != nil {
		return fmt.Errorf("forget party members: %w", err)
	}
	return nil
}

// podAlivePrefix is the matchmaker's liveness key (`pod:alive:<podID>`, FS-K2HKP), read here
// only: a pointer whose pod is not alive means the party is gone (FS-R82NV R3).
const podAlivePrefix = "pod:alive:"

// PartyPodOf reports whether playerID is in a live party, and its pod: their pointer names a
// party, that party's pointer names a pod, and that pod is alive.
func (r *Redis) PartyPodOf(ctx context.Context, playerID uuid.UUID) (string, bool, error) {
	partyID, err := r.client.Get(ctx, memberKey(playerID)).Result()
	if errors.Is(err, redis.Nil) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("read party of %s: %w", playerID, err)
	}
	podID, err := r.client.Get(ctx, "party:"+partyID).Result()
	if errors.Is(err, redis.Nil) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("read pod of party %s: %w", partyID, err)
	}
	alive, err := r.client.Exists(ctx, podAlivePrefix+podID).Result()
	if err != nil {
		return "", false, fmt.Errorf("read liveness of %s: %w", podID, err)
	}
	return podID, alive == 1, nil
}
