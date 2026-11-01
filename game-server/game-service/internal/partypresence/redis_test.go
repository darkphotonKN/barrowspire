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

// FS-R82NV §Requirements 7. The presence index: who is seated in a hub, and on which pod,
// found by character name (case-insensitive) or by player id, every key on a 30 s TTL.

// Seating writes both keys: the name (lowercased) and the id, each naming the pod.
func TestSeat_WritesNameAndIDKeysWithTTL(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	presence := partypresence.NewRedis(client)
	wren := partypresence.Entry{PlayerID: uuid.New(), Name: "Wren"}

	require.NoError(t, presence.Seat(context.Background(), "pod-a", []partypresence.Entry{wren}))

	assert.Equal(t, wren.PlayerID.String(), mini.HGet("presence:name:wren", "player_id"))
	assert.Equal(t, "pod-a", mini.HGet("presence:name:wren", "pod_id"))
	assert.Equal(t, 30*time.Second, mini.TTL("presence:name:wren"))
	assert.Equal(t, "Wren", mini.HGet("presence:id:"+wren.PlayerID.String(), "name"))
	assert.Equal(t, "pod-a", mini.HGet("presence:id:"+wren.PlayerID.String(), "pod_id"))
	assert.Equal(t, 30*time.Second, mini.TTL("presence:id:"+wren.PlayerID.String()))
}

// Looking up finds a seated player by name in any case, with spaces around, or by id; an
// unseated name or id is not found.
func TestLookup_ByNameAnyCaseOrByID(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	presence := partypresence.NewRedis(client)
	wren := partypresence.Entry{PlayerID: uuid.New(), Name: "Wren"}
	require.NoError(t, presence.Seat(context.Background(), "pod-b", []partypresence.Entry{wren}))

	for _, query := range []string{"Wren", " wREN ", wren.PlayerID.String()} {
		found, ok, err := presence.Lookup(context.Background(), query)
		require.NoError(t, err, query)
		require.True(t, ok, "%q is seated", query)
		assert.Equal(t, partypresence.Found{PlayerID: wren.PlayerID, Name: "Wren", PodID: "pod-b"}, found, query)
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
	require.NoError(t, presence.Seat(context.Background(), "pod-a", []partypresence.Entry{wren, kaelen}))
	// Kaelen was handed to pod B, which seated him there
	require.NoError(t, presence.Seat(context.Background(), "pod-b", []partypresence.Entry{kaelen}))

	require.NoError(t, presence.Unseat(context.Background(), "pod-a", []partypresence.Entry{wren, kaelen}))

	assert.False(t, mini.Exists("presence:name:wren"))
	assert.False(t, mini.Exists("presence:id:"+wren.PlayerID.String()))
	assert.Equal(t, "pod-b", mini.HGet("presence:name:kaelen", "pod_id"), "pod B's seat stands")
	assert.Equal(t, "pod-b", mini.HGet("presence:id:"+kaelen.PlayerID.String(), "pod_id"))
}
