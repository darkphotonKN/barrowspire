package gameserver

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The ordered writer drops a refresh-repeated write when full, but never a delete: a delete the
// full queue cannot take waits and goes in, in order, as soon as there is room. Code review
// 2026-11-01 (carried into I-R82NV-3).
func TestOrderedWriter_FullQueueKeepsDeletesInOrder(t *testing.T) {
	w := newOrderedWriter() // never started: the test drains the queue itself
	var ran []string
	write := func(name string) redisWrite {
		return func(context.Context) error { ran = append(ran, name); return nil }
	}
	for len(w.writes) < cap(w.writes) {
		w.queue(write("fill"))
	}

	w.queue(write("point, dropped"))
	w.queueMust(write("delete 1"))
	w.queueMust(write("delete 2"))
	require.Len(t, w.backlog, 2, "both deletes wait")

	// the writer takes two from the front; the next flush moves both deletes in, oldest first
	for i := 0; i < 2; i++ {
		require.NoError(t, (<-w.writes)(context.Background()))
	}
	w.flush()
	assert.Empty(t, w.backlog)

	ran = nil
	for len(w.writes) > 0 {
		require.NoError(t, (<-w.writes)(context.Background()))
	}
	assert.Equal(t, "delete 2", ran[len(ran)-1])
	assert.Equal(t, "delete 1", ran[len(ran)-2])
	assert.NotContains(t, ran, "point, dropped")
}

// A delete queued while older deletes still wait goes behind them, even if the queue has room
// by then, so a later delete never overtakes an earlier one.
func TestOrderedWriter_DeleteQueuesBehindTheBacklog(t *testing.T) {
	w := newOrderedWriter()
	for len(w.writes) < cap(w.writes) {
		w.queue(func(context.Context) error { return nil })
	}
	w.queueMust(func(context.Context) error { return nil })
	<-w.writes // room again

	w.queueMust(func(context.Context) error { return nil })

	assert.Len(t, w.backlog, 2, "the second delete waits behind the first")
}
