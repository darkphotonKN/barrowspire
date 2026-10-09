package matchqueue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/redis/go-redis/v9"
)

// A redis implementation of the cross pod / server instance queue
type Redis struct {
	client redis.UniversalClient
}

func NewRedis(client redis.UniversalClient) *Redis {
	return &Redis{
		client: client,
	}
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

func (r *Redis) QueuePlayer(ctx context.Context, playerID, pod string) error {
	// atomically push player to list and add their pod info to hash
	cmd := queueScript.Run(ctx, r.client, []string{keyQueue, keyPlayerPod}, playerID, pod)
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

var dequeueScript = redis.NewScript(`
		-- del player in hash, idempotent so no check needed
		redis.call("HDEL", KEYS[2], ARGV[1])

		-- remove player from queue, regardless of location
		redis.call("LREM", KEYS[1], 0, ARGV[1])

		-- no exceptional errors reaches here, return 1
		return 1
	`)

func (r *Redis) DequeuePlayer(ctx context.Context, playerID string) error {
	_, err := dequeueScript.Run(ctx, r.client, []string{keyQueue, keyPlayerPod}, playerID).Int64()

	if err != nil {
		return fmt.Errorf("MatchQueue DequeuePlayer : %w", err)
	}

	return nil
}

var matchmakeScript = redis.NewScript(`
		-- check the entire queue
		local queue = redis.call("LRANGE", KEYS[1], 0, -1)

		-- can't start game, length of queue is less than whats needed to start a single game
		local matchSize = tonumber(ARGV[1])
		if #queue < matchSize then 
			-- empty json array indicates not done yet
			return "[]"
		end

		-- remove matchSize length of players from queue and return them to an array
		local newMatchPlayers =  {}
		local partyIds = redis.call("LPOP", KEYS[1], ARGV[1])

		-- get players pods from hash, then remove them
		for i=1, matchSize do
			local playerPod = redis.call("HGET", KEYS[2], partyIds[i])
		
			-- check if corresponding playerPod exists, drift means corruption 
			-- return early with this player popped, everyone else returned to queue
			if not playerPod then 
				for j = #partyIds, 1, -1 do
					local playerId = partyIds[j]

					-- only add them back if its not the problem player, push them back to the 
					-- start
					if playerId ~= partyIds[i] then 
						redis.call("LPUSH", KEYS[1], playerId)
					end
				end
				-- return the error
				return redis.error_reply("CORRUPTED DATA MISSING PLAYER POD")
			end

			local player = {
				id = partyIds[i],
				pod = playerPod
			}
			newMatchPlayers[i] = player
		end

		-- remove their pods
		for i, player in ipairs(newMatchPlayers) do 
			redis.call("HDEL", KEYS[2], player.id)
		end

		return cjson.encode(newMatchPlayers)
	`)

// checks every tick if there is enough players for a game, removes them from
// list (queue) and player:pod hash
func (r *Redis) Matchmake(ctx context.Context, matchCriteria matchmaker.MatchCriteria) ([]matchmaker.MatchedPlayer, error) {
	raw, err := matchmakeScript.Run(ctx, r.client, []string{keyQueue, keyPlayerPod}, matchCriteria.MatchSize).Text()

	if err != nil {
		return nil, fmt.Errorf("MatchQueue Matchmake redis script : %w", err)
	}

	var matchedPlayers []matchmaker.MatchedPlayer

	err = json.Unmarshal([]byte(raw), &matchedPlayers)

	if err != nil {
		return nil, fmt.Errorf("MatchQueue Matchmake json unmarshal : %w", err)
	}

	// no err, empty slice, no results yet return no error
	if len(matchedPlayers) == 0 {
		return nil, nil
	}

	return matchedPlayers, nil
}
