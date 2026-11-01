package gameserver

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/google/uuid"
)

/**
* The presence keeper writes this pod's half of the presence index (FS-NCC9J R7): every player
* this pod holds with a character, in any world and within the reconnect grace, by name and by
* id, with the world they stand in. It runs on the message hub's loop and samples the pod on each
* tick rather than hooking every way in and out (enter, a field, a run, a drop, a handoff): who is
* new or changed world since the last tick is seated, who is gone is unseated, and the rest are
* refreshed every ten seconds (I-R82NV-3 decision 1). A seat is at most one tick late.
**/

// presenceIndex is the Redis side of presence: partypresence.Redis in production.
type presenceIndex interface {
	Seat(ctx context.Context, podID string, entries []partypresence.Entry) error
	Unseat(ctx context.Context, podID string, entries []partypresence.Entry) error
}

// playerPresence answers who this pod holds right now, and where.
type playerPresence interface {
	PresentPlayers() []presentPlayer
}

// presenceLeaveTimeout bounds unseating everyone at shutdown; what is left lapses by TTL.
const presenceLeaveTimeout = 2 * time.Second

type presenceKeeper struct {
	index   presenceIndex // nil on a pod built without Redis: nothing is written
	seating playerPresence
	podID   string
	now     func() time.Time
	writer  *orderedWriter

	// who this pod last wrote as seated; only the hub's loop touches it
	seated      map[uuid.UUID]partypresence.Entry
	lastRefresh time.Time
}

func newPresenceKeeper(index presenceIndex, seating playerPresence, podID string, now func() time.Time, writer *orderedWriter) *presenceKeeper {
	return &presenceKeeper{
		index:       index,
		seating:     seating,
		podID:       podID,
		now:         now,
		writer:      writer,
		seated:      make(map[uuid.UUID]partypresence.Entry),
		lastRefresh: now(),
	}
}

// tick samples the pod: seats who is new or changed world, unseats who left (a delete, never
// dropped), and refreshes everyone once a refresh interval has passed.
func (k *presenceKeeper) tick() {
	if k.index == nil {
		return
	}
	k.writer.flush()

	current := make(map[uuid.UUID]partypresence.Entry)
	for _, p := range k.seating.PresentPlayers() {
		current[p.ID] = partypresence.Entry{PlayerID: p.ID, Name: p.Name, World: string(p.World)}
	}

	var sat, left []partypresence.Entry
	for id, entry := range k.seated {
		if now, still := current[id]; !still || now.Name != entry.Name {
			left = append(left, entry)
		}
	}
	for id, entry := range current {
		if before, was := k.seated[id]; !was || before != entry {
			sat = append(sat, entry)
		}
	}
	k.seated = current

	if len(left) > 0 {
		k.writer.queueMust(func(ctx context.Context) error { return k.index.Unseat(ctx, k.podID, left) })
	}
	if at := k.now(); at.Sub(k.lastRefresh) >= partyRefreshInterval {
		k.lastRefresh = at
		sat = sat[:0]
		for _, entry := range current {
			sat = append(sat, entry)
		}
	}
	if len(sat) > 0 {
		k.writer.queue(func(ctx context.Context) error { return k.index.Seat(ctx, k.podID, sat) })
	}
}

// leaveAll unseats everyone this pod holds as it shuts down, once the writer has stopped, so
// nobody stays findable on a pod that is going. ctx's values are kept, its cancellation is not.
func (k *presenceKeeper) leaveAll(ctx context.Context) {
	if k.index == nil {
		return
	}
	if k.writer.running() {
		// the writer's own drain is bounded; this budget is the wait for it, not the unseat's
		waitCtx, stopWaiting := context.WithTimeout(context.WithoutCancel(ctx), presenceLeaveTimeout)
		select {
		case <-k.writer.stopped():
		case <-waitCtx.Done():
		}
		stopWaiting()
	}
	leaveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), presenceLeaveTimeout)
	defer cancel()
	// the deletes a full queue left for a tick that will not come
	k.writer.runBacklog(leaveCtx)
	if len(k.seated) == 0 {
		return
	}
	entries := make([]partypresence.Entry, 0, len(k.seated))
	for _, entry := range k.seated {
		entries = append(entries, entry)
	}
	if err := k.index.Unseat(leaveCtx, k.podID, entries); err != nil {
		slog.Warn("presence left to lapse at shutdown", "players", len(entries), "error", err)
	}
	k.seated = make(map[uuid.UUID]partypresence.Entry)
}

// presenceStore is the presence index both ways: this pod writes its players, invites and party
// updates read anyone's.
type presenceStore interface {
	presenceIndex
	presenceLookup
}

// WithPresence writes this pod's hub into the presence index and looks invite targets up in it,
// the pod's Redis in production. FS-R82NV R7, R12.
func WithPresence(index presenceStore) Option {
	return func(o *bootOptions) { o.presence = index }
}
