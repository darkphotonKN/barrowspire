package hubocc_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/hubocc"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-JEAVX §Requirements 19, read by FS-NCC9J R18. Each pod's hub occupancy, under
// hub:occ:{podID} for 3 s.

// A published count is read back for that pod, on a 3 s TTL, so a pod that stops publishing
// stops counting.
func TestPublish_CountReadBackWithTTL(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	occ := hubocc.NewRedis(client)

	require.NoError(t, occ.Publish(context.Background(), "pod-a", 17))

	count, known, err := occ.Count(context.Background(), "pod-a")
	require.NoError(t, err)
	assert.True(t, known)
	assert.Equal(t, 17, count)
	assert.Equal(t, 3*time.Second, mini.TTL("hub:occ:pod-a"))
}

// A pod that has published nothing, or whose count lapsed, is not known.
func TestCount_NothingPublished_NotKnown(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	occ := hubocc.NewRedis(client)
	require.NoError(t, occ.Publish(context.Background(), "pod-a", 3))
	mini.FastForward(hubocc.TTL)

	for _, pod := range []string{"pod-a", "pod-b"} {
		_, known, err := occ.Count(context.Background(), pod)
		require.NoError(t, err)
		assert.False(t, known, pod)
	}
}
