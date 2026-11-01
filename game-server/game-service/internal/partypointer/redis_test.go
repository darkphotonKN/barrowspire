package partypointer_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypointer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-R82NV §Requirements 3. The pointers other pods follow to a party: the
// party to its pod, each member to the party, every one on a 30 s TTL.

// Pointing writes the party's pointer and one per member, each with the TTL.
func TestPoint_WritesPartyAndMemberPointersWithTTL(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	pointers := partypointer.NewRedis(client)
	partyID, wren, kaelen := uuid.New(), uuid.New(), uuid.New()

	require.NoError(t, pointers.Point(context.Background(), partyID, "pod-a", []uuid.UUID{wren, kaelen}))

	got, err := mini.Get("party:" + partyID.String())
	require.NoError(t, err)
	assert.Equal(t, "pod-a", got, "the party points at its pod")
	assert.Equal(t, 30*time.Second, mini.TTL("party:"+partyID.String()))
	for _, member := range []uuid.UUID{wren, kaelen} {
		key := "player:" + member.String() + ":party"
		got, err := mini.Get(key)
		require.NoError(t, err)
		assert.Equal(t, partyID.String(), got, "each member points at the party")
		assert.Equal(t, 30*time.Second, mini.TTL(key))
	}
}

// Pointing again is the refresh: it puts back a pointer that lapsed, not only
// one that is still there, so a Redis that was down heals on the next beat.
func TestPoint_AgainRestoresALapsedPointer(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	pointers := partypointer.NewRedis(client)
	partyID, wren := uuid.New(), uuid.New()
	require.NoError(t, pointers.Point(context.Background(), partyID, "pod-a", []uuid.UUID{wren}))

	mini.FastForward(31 * time.Second)
	require.False(t, mini.Exists("party:"+partyID.String()), "unrefreshed, the pointer lapses")

	require.NoError(t, pointers.Point(context.Background(), partyID, "pod-a", []uuid.UUID{wren}))
	assert.True(t, mini.Exists("party:"+partyID.String()))
	assert.True(t, mini.Exists("player:"+wren.String()+":party"))
}

// Forgetting a party deletes its pointer and every member's.
func TestForgetParty_DeletesEveryPointer(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	pointers := partypointer.NewRedis(client)
	partyID, wren, kaelen := uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, pointers.Point(context.Background(), partyID, "pod-a", []uuid.UUID{wren, kaelen}))

	require.NoError(t, pointers.ForgetParty(context.Background(), partyID, []uuid.UUID{wren, kaelen}))

	assert.False(t, mini.Exists("party:"+partyID.String()))
	assert.False(t, mini.Exists("player:"+wren.String()+":party"))
	assert.False(t, mini.Exists("player:"+kaelen.String()+":party"))
}

// Forgetting players deletes only their pointers: the party, and anyone still
// in it, keep theirs.
func TestForgetPlayers_DeletesOnlyTheirPointers(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	pointers := partypointer.NewRedis(client)
	partyID, wren, kaelen := uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, pointers.Point(context.Background(), partyID, "pod-a", []uuid.UUID{wren, kaelen}))

	require.NoError(t, pointers.ForgetPlayers(context.Background(), []uuid.UUID{kaelen}))

	assert.False(t, mini.Exists("player:"+kaelen.String()+":party"))
	assert.True(t, mini.Exists("player:"+wren.String()+":party"))
	assert.True(t, mini.Exists("party:"+partyID.String()))
}

// A player is in a live party when their pointer names a party whose pointer names a pod that
// is alive; a party on a dead pod is gone, and so is a pointer to a party that has ended.
// FS-R82NV R3, R12.
func TestPartyPodOf_FollowsPointersToALivePod(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	pointers := partypointer.NewRedis(client)
	partyID, wren := uuid.New(), uuid.New()
	require.NoError(t, pointers.Point(context.Background(), partyID, "pod-a", []uuid.UUID{wren}))

	_, in, err := pointers.PartyPodOf(context.Background(), wren)
	require.NoError(t, err)
	assert.False(t, in, "pod-a is not alive yet: its party is gone")

	require.NoError(t, mini.Set("pod:alive:pod-a", "1"))
	pod, in, err := pointers.PartyPodOf(context.Background(), wren)
	require.NoError(t, err)
	assert.True(t, in)
	assert.Equal(t, "pod-a", pod)

	_, in, err = pointers.PartyPodOf(context.Background(), uuid.New())
	require.NoError(t, err)
	assert.False(t, in, "no pointer, no party")

	mini.Del("party:" + partyID.String())
	_, in, err = pointers.PartyPodOf(context.Background(), wren)
	require.NoError(t, err)
	assert.False(t, in, "a member pointer to an ended party is no party")
}
