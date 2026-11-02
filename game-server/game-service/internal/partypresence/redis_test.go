package partypresence_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Requirements 7 (redefining FS-R82NV R7). The presence index: every connected player
// with a character, in any world, and on which pod, found by character name (case-insensitive) or
// by player id, every key on a 30 s TTL.

// Seating writes both keys, the name (lowercased) and the id, each the hash {player_id, name,
// pod_id, world}.
func TestSeat_WritesNameAndIDKeysWithTTL(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	presence := partypresence.NewRedis(client)
	wren := partypresence.Entry{PlayerID: uuid.New(), Name: "Wren", World: "field"}

	require.NoError(t, presence.Seat(context.Background(), "pod-a", "ws://pod-a/ws", []partypresence.Entry{wren}))

	for _, key := range []string{"presence:name:wren", "presence:id:" + wren.PlayerID.String()} {
		assert.Equal(t, wren.PlayerID.String(), mini.HGet(key, "player_id"), key)
		assert.Equal(t, "Wren", mini.HGet(key, "name"), key)
		assert.Equal(t, "pod-a", mini.HGet(key, "pod_id"), key)
		assert.Equal(t, "field", mini.HGet(key, "world"), key)
		assert.Equal(t, 30*time.Second, mini.TTL(key), key)
	}
}

// Looking up finds a seated player by name in any case, with spaces around, or by id; an
// unseated name or id is not found.
func TestLookup_ByNameAnyCaseOrByID(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	presence := partypresence.NewRedis(client)
	wren := partypresence.Entry{PlayerID: uuid.New(), Name: "Wren", World: "run"}
	require.NoError(t, presence.Seat(context.Background(), "pod-b", "ws://pod-b/ws", []partypresence.Entry{wren}))

	for _, query := range []string{"Wren", " wREN ", wren.PlayerID.String()} {
		found, ok, err := presence.Lookup(context.Background(), query)
		require.NoError(t, err, query)
		require.True(t, ok, "%q is seated", query)
		assert.Equal(t, partypresence.Found{PlayerID: wren.PlayerID, Name: "Wren", PodID: "pod-b", PodAddr: "ws://pod-b/ws", World: "run"}, found, query)
	}
	for _, query := range []string{"Nobody", uuid.NewString(), ""} {
		_, ok, err := presence.Lookup(context.Background(), query)
		require.NoError(t, err, query)
		assert.False(t, ok, "%q is not seated", query)
	}
}

// Unseating deletes a player's keys only while they still name this pod: a player who has
// moved on and been seated by another pod keeps that pod's keys.
func TestUnseat_DeletesOnlyThisPodsKeys(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	presence := partypresence.NewRedis(client)
	wren := partypresence.Entry{PlayerID: uuid.New(), Name: "Wren"}
	kaelen := partypresence.Entry{PlayerID: uuid.New(), Name: "Kaelen"}
	require.NoError(t, presence.Seat(context.Background(), "pod-a", "ws://pod-a/ws", []partypresence.Entry{wren, kaelen}))
	// Kaelen was handed to pod B, which seated him there
	require.NoError(t, presence.Seat(context.Background(), "pod-b", "ws://pod-b/ws", []partypresence.Entry{kaelen}))

	require.NoError(t, presence.Unseat(context.Background(), "pod-a", []partypresence.Entry{wren, kaelen}))

	assert.False(t, mini.Exists("presence:name:wren"))
	assert.False(t, mini.Exists("presence:id:"+wren.PlayerID.String()))
	assert.Equal(t, "pod-b", mini.HGet("presence:name:kaelen", "pod_id"), "pod B's seat stands")
	assert.Equal(t, "pod-b", mini.HGet("presence:id:"+kaelen.PlayerID.String(), "pod_id"))
}

// Looking up many players by id answers each present one in one trip; an absent one is left out.
func TestLookupIDs_EachPresentOne(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	presence := partypresence.NewRedis(client)
	wren := partypresence.Entry{PlayerID: uuid.New(), Name: "Wren", World: "hub"}
	marl := partypresence.Entry{PlayerID: uuid.New(), Name: "Marl", World: "field"}
	require.NoError(t, presence.Seat(context.Background(), "pod-a", "ws://pod-a/ws", []partypresence.Entry{wren}))
	require.NoError(t, presence.Seat(context.Background(), "pod-b", "ws://pod-b/ws", []partypresence.Entry{marl}))
	absent := uuid.New()

	found, err := presence.LookupIDs(context.Background(), []uuid.UUID{wren.PlayerID, absent, marl.PlayerID})
	require.NoError(t, err)

	assert.Equal(t, map[uuid.UUID]partypresence.Found{
		wren.PlayerID: {PlayerID: wren.PlayerID, Name: "Wren", PodID: "pod-a", PodAddr: "ws://pod-a/ws", World: "hub"},
		marl.PlayerID: {PlayerID: marl.PlayerID, Name: "Marl", PodID: "pod-b", PodAddr: "ws://pod-b/ws", World: "field"},
	}, found)
}

// Every seat carries the address of the pod holding the player, so whoever finds them can send a
// player there: by name, by id, and in a batch (FS-NCC9J R18; I-NCC9J-5).
func TestSeat_CarriesThePodAddress(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	presence := partypresence.NewRedis(client)
	wren := partypresence.Entry{PlayerID: uuid.New(), Name: "Wren", World: "hub"}
	require.NoError(t, presence.Seat(context.Background(), "pod-a", "ws://pod-a/ws", []partypresence.Entry{wren}))

	byName, found, err := presence.Lookup(context.Background(), "wren")
	require.NoError(t, err)
	require.True(t, found)
	byID, found, err := presence.Lookup(context.Background(), wren.PlayerID.String())
	require.NoError(t, err)
	require.True(t, found)
	batch, err := presence.LookupIDs(context.Background(), []uuid.UUID{wren.PlayerID})
	require.NoError(t, err)

	for how, f := range map[string]partypresence.Found{"name": byName, "id": byID, "batch": batch[wren.PlayerID]} {
		assert.Equal(t, "pod-a", f.PodID, how)
		assert.Equal(t, "ws://pod-a/ws", f.PodAddr, how)
	}
}
