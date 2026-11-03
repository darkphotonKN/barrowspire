package settling_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/settling"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-QPDKN §Requirements 32–35. The settling mark: a released escapee whose run has not settled
// yet, one key per player, `settling:<playerID>`, naming the run, on a 90 s TTL.

// Marking writes each player's key, naming the run, for the TTL.
func TestMark_WritesEachKeyNamingTheRunWithTTL(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	marks := settling.NewRedis(client)
	run, wren, kaelen := uuid.New(), uuid.New(), uuid.New()

	require.NoError(t, marks.Mark(context.Background(), run, wren, kaelen))

	for _, id := range []uuid.UUID{wren, kaelen} {
		key := "settling:" + id.String()
		got, err := mini.Get(key)
		require.NoError(t, err, key)
		assert.Equal(t, run.String(), got, key)
		assert.Equal(t, 90*time.Second, mini.TTL(key), key)
	}
}

// Marking again is the refresh: the TTL starts over.
func TestMark_AgainRefreshesTheTTL(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	marks := settling.NewRedis(client)
	run, wren := uuid.New(), uuid.New()
	require.NoError(t, marks.Mark(context.Background(), run, wren))

	mini.FastForward(60 * time.Second)
	require.NoError(t, marks.Mark(context.Background(), run, wren))
	mini.FastForward(60 * time.Second)

	settlingNow, err := marks.Settling(context.Background(), wren)
	require.NoError(t, err)
	assert.True(t, settlingNow, "refreshed 60 s in, the mark outlives its first 90 s")
}

// A mark nobody refreshes lapses after its TTL.
func TestMark_LapsesWithoutARefresh(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	marks := settling.NewRedis(client)
	wren := uuid.New()
	require.NoError(t, marks.Mark(context.Background(), uuid.New(), wren))

	mini.FastForward(settling.TTL)

	settlingNow, err := marks.Settling(context.Background(), wren)
	require.NoError(t, err)
	assert.False(t, settlingNow)
}

// Settling answers whether any of the players asked about is marked.
func TestSettling_AnyOfThePlayers(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	marks := settling.NewRedis(client)
	wren, kaelen := uuid.New(), uuid.New()
	require.NoError(t, marks.Mark(context.Background(), uuid.New(), wren))

	for _, tt := range []struct {
		name string
		ids  []uuid.UUID
		want bool
	}{
		{"the marked one", []uuid.UUID{wren}, true},
		{"one of two", []uuid.UUID{kaelen, wren}, true},
		{"an unmarked one", []uuid.UUID{kaelen}, false},
		{"nobody", nil, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := marks.Settling(context.Background(), tt.ids...)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

// Clearing deletes each player's key.
func TestClear_DeletesEachKey(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	marks := settling.NewRedis(client)
	wren, kaelen := uuid.New(), uuid.New()
	require.NoError(t, marks.Mark(context.Background(), uuid.New(), wren, kaelen))

	require.NoError(t, marks.Clear(context.Background(), wren, kaelen))

	assert.False(t, mini.Exists("settling:"+wren.String()))
	assert.False(t, mini.Exists("settling:"+kaelen.String()))
}

// An unreachable Redis is an error on every call, never a silent answer.
func TestRedis_Unreachable_IsAnError(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	marks := settling.NewRedis(client)
	mini.Close()
	wren := uuid.New()
	// bounded, as every caller bounds it: go-redis retries a refused dial until the context ends
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	assert.Error(t, marks.Mark(ctx, uuid.New(), wren))
	assert.Error(t, marks.Clear(ctx, wren))
	_, err := marks.Settling(ctx, wren)
	assert.Error(t, err)
}
