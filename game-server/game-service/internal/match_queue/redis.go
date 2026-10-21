package matchqueue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
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
	keyQueue        = "queue"
	keyQueueEntries = "queue:entries"

	// pod:alive:{podID}, present only while that pod keeps heartbeating
	keyPodAlivePrefix = "pod:alive:"
)

// 3x the heartbeat interval, so a pod survives two missed beats (GC pause, slow
// redis) before it counts as dead
const podAliveTTL = 3 * time.Second

// queueEntry is the queue:entries hash value, the player's pod and the character
// in play they queued with, so whichever pod hosts the match can build the run
type queueEntry struct {
	Pod       string                `json:"pod"`
	Character types.CharacterInPlay `json:"character"`
}

var queueScript = redis.NewScript(`
		-- push player's queue entry (pod + character) on hash
		local created = redis.call("HSETNX", KEYS[2], ARGV[1], ARGV[2])

		if created == 0 then 
			return 0
		end

		-- push to the back of queue
		redis.call("RPUSH", KEYS[1], ARGV[1])

		-- success
		return 1
	`)

func (r *Redis) QueuePlayer(ctx context.Context, playerID, pod string, character types.CharacterInPlay) error {
	entry, err := json.Marshal(queueEntry{Pod: pod, Character: character})

	if err != nil {
		return fmt.Errorf("MatchQueue QueuePlayer json marshal : %w", err)
	}

	// atomically push player to list and add their queue entry to hash
	cmd := queueScript.Run(ctx, r.client, []string{keyQueue, keyQueueEntries}, playerID, entry)
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
	_, err := dequeueScript.Run(ctx, r.client, []string{keyQueue, keyQueueEntries}, playerID).Int64()

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
			local playerEntry = redis.call("HGET", KEYS[2], partyIds[i])

			-- the entry is json {pod, character}, read the pod out of it; an entry that
			-- won't decode or has no pod is the same corruption as a missing one
			local playerPod = nil
			local playerCharacter = nil
			if playerEntry then
				local decoded, entry = pcall(cjson.decode, playerEntry)
				if decoded and type(entry) == "table" and type(entry.pod) == "string" then
					playerPod = entry.pod
					playerCharacter = entry.character
				end
			end
		
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

			-- check the player's pod is still heartbeating; a crashed pod's players stay
			-- queued since its disconnect handlers never ran, so drop them here
			-- NOTE: building a key inside the script is not Redis Cluster compatible, every
			-- key a script touches must be passed in KEYS for cluster slot routing
			local podAlive = redis.call("EXISTS", ARGV[2] .. playerPod)
			if podAlive == 0 then
				-- expected case, not corruption: clean up the dead pod's player
				redis.call("HDEL", KEYS[2], partyIds[i])

				-- push everyone else back to the start, in original order
				for j = #partyIds, 1, -1 do
					local playerId = partyIds[j]

					if playerId ~= partyIds[i] then
						redis.call("LPUSH", KEYS[1], playerId)
					end
				end

				-- no match this round
				return "[]"
			end

			local player = {
				id = partyIds[i],
				pod = playerPod,
				character = playerCharacter
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
// list (queue) and queue:entries hash
func (r *Redis) Matchmake(ctx context.Context, matchCriteria matchmaker.MatchCriteria) ([]matchmaker.MatchedPlayer, error) {
	raw, err := matchmakeScript.Run(ctx, r.client, []string{keyQueue, keyQueueEntries}, matchCriteria.MatchSize, keyPodAlivePrefix).Text()

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

// refreshes this pod's liveness key; if the pod stops calling this it expires
// on its own, so a crashed pod needs nobody to clean up after it
func (r *Redis) MarkPodAlive(ctx context.Context, podID string) error {
	err := r.client.Set(ctx, keyPodAlivePrefix+podID, 1, podAliveTTL).Err()

	if err != nil {
		return fmt.Errorf("MatchQueue MarkPodAlive : %w", err)
	}

	return nil
}

var queuedPlayersScript = redis.NewScript(`
		-- check the entire queue
		local queue = redis.call("LRANGE", KEYS[1], 0, -1)

		-- collect this pod's players, in queue order
		local podPlayers = {}
		for i, playerId in ipairs(queue) do
			local playerEntry = redis.call("HGET", KEYS[2], playerId)

			-- match on the pod inside the json entry, skip one that won't decode; the
			-- match loop reports it as corruption once it is popped
			if playerEntry then
				local decoded, entry = pcall(cjson.decode, playerEntry)
				if decoded and type(entry) == "table" and entry.pod == ARGV[1] then
					table.insert(podPlayers, playerId)
				end
			end
		end

		-- cjson encodes an empty table as {} not [], so write the empty case out
		if #podPlayers == 0 then
			return string.format('{"length":%d,"players":[]}', #queue)
		end

		return cjson.encode({ length = #queue, players = podPlayers })
	`)

type queuedPlayersRes struct {
	Length  int      `json:"length"`
	Players []string `json:"players"`
}

// reads the global queue length and which queued players belong to podID, in
// queue order, so each pod can report progress to its own players
func (r *Redis) QueuedPlayers(ctx context.Context, podID string) (int, []string, error) {
	raw, err := queuedPlayersScript.Run(ctx, r.client, []string{keyQueue, keyQueueEntries}, podID).Text()

	if err != nil {
		return 0, nil, fmt.Errorf("MatchQueue QueuedPlayers redis script : %w", err)
	}

	var res queuedPlayersRes

	err = json.Unmarshal([]byte(raw), &res)

	if err != nil {
		return 0, nil, fmt.Errorf("MatchQueue QueuedPlayers json unmarshal : %w", err)
	}

	return res.Length, res.Players, nil
}
