// Package partypresence is the presence index (FS-R82NV §Requirements 7): who is seated in a
// hub, and on which pod, found by character name or by player id. Each pod writes its own hub's
// players and keeps them alive by TTL; a name with no entry is offline or busy. It wraps the one
// go-redis client the pod already holds, as partypointer and chatbus do. Whisper (FS-KCQ06)
// reads the same keys.
package partypresence

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// TTL is how long a seat outlives its pod's last refresh: three missed ten-second beats.
const TTL = 30 * time.Second

// Entry is one hub-seated player as their pod writes them.
type Entry struct {
	PlayerID uuid.UUID
	Name     string
}

// Found is a seated player as a lookup returns them: who, under which name, on which pod.
type Found struct {
	PlayerID uuid.UUID
	Name     string
	PodID    string
}

type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{client: client}
}

// Character names are unique case-insensitively (character-service's lower(name) index), so the
// lowercased, trimmed name is the key.
func nameKey(name string) string {
	return "presence:name:" + strings.ToLower(strings.TrimSpace(name))
}

func idKey(playerID uuid.UUID) string { return "presence:id:" + playerID.String() }

// Seat writes each player's two keys, naming podID, for TTL. It is both the write when a player
// sits down in the hub and the refresh: a key that lapsed while Redis was away comes back.
func (r *Redis) Seat(ctx context.Context, podID string, entries []Entry) error {
	if len(entries) == 0 {
		return nil
	}
	_, err := r.client.Pipelined(ctx, func(pipe redis.Pipeliner) error {
		for _, e := range entries {
			pipe.HSet(ctx, nameKey(e.Name), "player_id", e.PlayerID.String(), "pod_id", podID)
			pipe.Expire(ctx, nameKey(e.Name), TTL)
			pipe.HSet(ctx, idKey(e.PlayerID), "name", e.Name, "pod_id", podID)
			pipe.Expire(ctx, idKey(e.PlayerID), TTL)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("seat %d players: %w", len(entries), err)
	}
	return nil
}

// unseat deletes a key only while it still names this pod, in one step: a player handed to
// another pod and seated there keeps that pod's key when this one lets them go.
var unseat = redis.NewScript(`
local n = 0
for _, key in ipairs(KEYS) do
	if redis.call('HGET', key, 'pod_id') == ARGV[1] then
		n = n + redis.call('DEL', key)
	end
end
return n
`)

// Unseat deletes each player's two keys where they still name podID: the player left this hub.
func (r *Redis) Unseat(ctx context.Context, podID string, entries []Entry) error {
	if len(entries) == 0 {
		return nil
	}
	keys := make([]string, 0, 2*len(entries))
	for _, e := range entries {
		keys = append(keys, nameKey(e.Name), idKey(e.PlayerID))
	}
	if err := unseat.Run(ctx, r.client, keys, podID).Err(); err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("unseat %d players: %w", len(entries), err)
	}
	return nil
}

// Lookup finds a seated player by character name (any case, trimmed) or by player id.
func (r *Redis) Lookup(ctx context.Context, nameOrID string) (Found, bool, error) {
	query := strings.TrimSpace(nameOrID)
	if query == "" {
		return Found{}, false, nil
	}
	if id, err := uuid.Parse(query); err == nil {
		fields, err := r.client.HGetAll(ctx, idKey(id)).Result()
		if err != nil {
			return Found{}, false, fmt.Errorf("look up player %s: %w", id, err)
		}
		if fields["pod_id"] == "" {
			return Found{}, false, nil
		}
		return Found{PlayerID: id, Name: fields["name"], PodID: fields["pod_id"]}, true, nil
	}

	fields, err := r.client.HGetAll(ctx, nameKey(query)).Result()
	if err != nil {
		return Found{}, false, fmt.Errorf("look up a name: %w", err)
	}
	id, err := uuid.Parse(fields["player_id"])
	if err != nil || fields["pod_id"] == "" {
		return Found{}, false, nil
	}
	name, err := r.client.HGet(ctx, idKey(id), "name").Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return Found{}, false, fmt.Errorf("look up player %s: %w", id, err)
	}
	if name == "" {
		name = query
	}
	return Found{PlayerID: id, Name: name, PodID: fields["pod_id"]}, true, nil
}
