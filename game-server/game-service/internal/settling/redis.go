// Package settling is the settling mark (FS-QPDKN §Requirements 32–36): a released escapee whose
// run has not settled yet. The run's pod writes it when it releases them, refreshes it while the
// run lives and deletes it once the run's settlement events are written; every pod reads it before
// an entry that checks out gear, since the plunder the settlement brings home lands in their bag.
// One key per player, so a reconnect to any pod finds it. It wraps the one go-redis client the pod
// already holds, as partypresence does.
package settling

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// TTL is how long a mark outlives its pod's last refresh: a safety net for a pod that dies
// mid-run, three missed beats of RefreshEvery.
const TTL = 90 * time.Second

// RefreshEvery is how often the run's pod writes its marks again while the run lives.
const RefreshEvery = 30 * time.Second

type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{client: client}
}

func key(playerID uuid.UUID) string { return "settling:" + playerID.String() }

// Mark writes each player's key, naming the run that released them, for TTL. It is both the mark
// at release and the refresh: a key that lapsed while Redis was away comes back.
func (r *Redis) Mark(ctx context.Context, runID uuid.UUID, playerIDs ...uuid.UUID) error {
	if len(playerIDs) == 0 {
		return nil
	}
	_, err := r.client.Pipelined(ctx, func(pipe redis.Pipeliner) error {
		for _, id := range playerIDs {
			pipe.Set(ctx, key(id), runID.String(), TTL)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("mark %d players settling for run %s: %w", len(playerIDs), runID, err)
	}
	return nil
}

// Clear deletes each player's key: their run has settled.
func (r *Redis) Clear(ctx context.Context, playerIDs ...uuid.UUID) error {
	if len(playerIDs) == 0 {
		return nil
	}
	keys := make([]string, len(playerIDs))
	for i, id := range playerIDs {
		keys[i] = key(id)
	}
	if err := r.client.Del(ctx, keys...).Err(); err != nil {
		return fmt.Errorf("clear %d settling marks: %w", len(playerIDs), err)
	}
	return nil
}

// Settling reports whether any of these players is marked, in one trip.
func (r *Redis) Settling(ctx context.Context, playerIDs ...uuid.UUID) (bool, error) {
	if len(playerIDs) == 0 {
		return false, nil
	}
	keys := make([]string, len(playerIDs))
	for i, id := range playerIDs {
		keys[i] = key(id)
	}
	n, err := r.client.Exists(ctx, keys...).Result()
	if err != nil {
		return false, fmt.Errorf("read %d settling marks: %w", len(playerIDs), err)
	}
	return n > 0, nil
}
