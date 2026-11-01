// Package hubocc is each pod's hub occupancy in Redis (FS-JEAVX R19): how many players its hub
// seats, under hub:occ:{podID}, refreshed about once a second on a 3 s TTL, so a pod that stops
// stops counting with no repair. Travel reads the leader's pod's count before handing a member
// off there (FS-NCC9J R18). It wraps the one go-redis client the pod already holds.
package hubocc

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// TTL is how long a published count stands without a refresh (FS-JEAVX R19).
const TTL = 3 * time.Second

type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{client: client}
}

func key(podID string) string { return "hub:occ:" + podID }

// Publish writes how many players podID's hub seats, for TTL.
func (r *Redis) Publish(ctx context.Context, podID string, count int) error {
	if err := r.client.Set(ctx, key(podID), count, TTL).Err(); err != nil {
		return fmt.Errorf("publish hub occupancy of %s: %w", podID, err)
	}
	return nil
}

// Count is how many players podID's hub seats, as last published; known is false when nothing
// stands for it (it never published, or stopped).
func (r *Redis) Count(ctx context.Context, podID string) (count int, known bool, err error) {
	raw, err := r.client.Get(ctx, key(podID)).Result()
	if errors.Is(err, redis.Nil) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("read hub occupancy of %s: %w", podID, err)
	}
	count, err = strconv.Atoi(raw)
	if err != nil {
		return 0, false, fmt.Errorf("parse hub occupancy of %s: %w", podID, err)
	}
	return count, true, nil
}
