// Package queuemetrics measures the matchmaking queue from outside it: a
// decorator around matchmaker.MatchQueue that sets the queue-depth gauge and
// observes each match's wait, leaving the matchmaker and its Redis queue as
// they are.
package queuemetrics

import (
	"context"
	"sync"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/matchmaker"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/prometheus/client_golang/prometheus"
)

// Queue is a matchmaker.MatchQueue that measures the one it wraps.
//
// Depth: the matchmaker reads the global queue length once a second
// (QueuedPlayers, for the queue panel); Queue sets the gauge from that read,
// so it costs no extra Redis call.
//
// Wait: the queue holds no join time, so Queue remembers when each player of
// this pod joined. The same once-a-second read lists this pod's queued
// players; one remembered here that the list no longer holds, and that did
// not leave through DequeuePlayer, was taken by a match on some pod. Its wait
// is observed then, so the sample is late by up to the one-second read
// interval. Every player is observed once, by the pod that queued them.
type Queue struct {
	matchmaker.MatchQueue

	podID string
	depth prometheus.Gauge
	wait  prometheus.Observer
	now   func() time.Time

	mu     sync.Mutex
	joined map[string]joinTimes
}

// joinTimes are when QueuePlayer was called, the start of the wait, and when
// it returned: from then on the player is in Redis, so a list read begun later
// is sure to show them while they are queued.
type joinTimes struct {
	called, returned time.Time
}

var _ matchmaker.MatchQueue = (*Queue)(nil)

// Wrap measures inner for the players podID queues.
func Wrap(inner matchmaker.MatchQueue, podID string, depth prometheus.Gauge, wait prometheus.Observer) *Queue {
	return &Queue{
		MatchQueue: inner,
		podID:      podID,
		depth:      depth,
		wait:       wait,
		now:        time.Now,
		joined:     make(map[string]joinTimes),
	}
}

// QueuePlayer starts the player's wait when this pod queues them. A requeue
// that keeps their place keeps their first join time.
func (q *Queue) QueuePlayer(ctx context.Context, playerID, pod string, character types.CharacterInPlay) error {
	called := q.now()
	err := q.MatchQueue.QueuePlayer(ctx, playerID, pod, character)
	if err != nil || pod != q.podID {
		return err
	}

	q.mu.Lock()
	defer q.mu.Unlock()
	if _, ok := q.joined[playerID]; !ok {
		q.joined[playerID] = joinTimes{called: called, returned: q.now()}
	}
	return nil
}

// DequeuePlayer forgets the player before they leave the queue, so a list read
// that races the leave never counts it as a match.
func (q *Queue) DequeuePlayer(ctx context.Context, playerID string) error {
	q.mu.Lock()
	delete(q.joined, playerID)
	q.mu.Unlock()

	return q.MatchQueue.DequeuePlayer(ctx, playerID)
}

// QueuedPlayers sets the depth gauge and observes the wait of every player of
// this pod the queue no longer holds.
func (q *Queue) QueuedPlayers(ctx context.Context, podID string) (int, []string, error) {
	readAt := q.now()
	length, players, err := q.MatchQueue.QueuedPlayers(ctx, podID)
	if err != nil || podID != q.podID {
		return length, players, err
	}

	q.depth.Set(float64(length))

	still := make(map[string]struct{}, len(players))
	for _, id := range players {
		still[id] = struct{}{}
	}

	now := q.now()
	q.mu.Lock()
	defer q.mu.Unlock()
	for id, at := range q.joined {
		// joined while this read was under way: the read may predate them
		if !at.returned.Before(readAt) {
			continue
		}
		if _, queued := still[id]; queued {
			continue
		}
		q.wait.Observe(now.Sub(at.called).Seconds())
		delete(q.joined, id)
	}

	return length, players, err
}
