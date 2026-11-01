package gameserver

import (
	"context"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The presence keeper writes this pod's half of the presence index (FS-R82NV R7): every player
* seated in this pod's hub, by name and by id. It runs on the message hub's loop and samples the
* hub on each tick rather than hooking every way into and out of it (enter, a field, a run,
* leave_hub, a drop, a handoff): who sat down since the last tick is seated, who is gone is
* unseated, and the rest are refreshed every ten seconds (I-R82NV-3 decision 1). A seat is at
* most one tick late.
**/

// presenceIndex is the Redis side of presence: partypresence.Redis in production.
type presenceIndex interface {
	Seat(ctx context.Context, podID string, entries []partypresence.Entry) error
	Unseat(ctx context.Context, podID string, entries []partypresence.Entry) error
}

// hubSeating answers who is seated in this pod's hub right now.
type hubSeating interface {
	HubSeatedPlayers() []types.Player
}

// presenceLeaveTimeout bounds unseating everyone at shutdown; what is left lapses by TTL.
const presenceLeaveTimeout = 2 * time.Second

type presenceKeeper struct {
	index   presenceIndex // nil on a pod built without Redis: nothing is written
	seating hubSeating
	podID   string
	now     func() time.Time
	writer  *orderedWriter

	// who this pod last wrote as seated; only the hub's loop touches it
	seated      map[uuid.UUID]partypresence.Entry
	lastRefresh time.Time
}

func newPresenceKeeper(index presenceIndex, seating hubSeating, podID string, now func() time.Time, writer *orderedWriter) *presenceKeeper {
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

// tick samples the hub: seats who sat down, unseats who left (a delete, never dropped), and
// refreshes everyone once a refresh interval has passed.
func (k *presenceKeeper) tick() {
	if k.index == nil {
		return
	}
	k.writer.flush()

	current := make(map[uuid.UUID]partypresence.Entry)
	for _, p := range k.seating.HubSeatedPlayers() {
		if p.Character.Name == "" {
			continue
		}
		current[p.ID] = partypresence.Entry{PlayerID: p.ID, Name: p.Character.Name}
	}

	var sat, left []partypresence.Entry
	for id, entry := range k.seated {
		if now, still := current[id]; !still || now.Name != entry.Name {
			left = append(left, entry)
		}
	}
	for id, entry := range current {
		if before, was := k.seated[id]; !was || before.Name != entry.Name {
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
	if k.index == nil || len(k.seated) == 0 {
		return
	}
	leaveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), presenceLeaveTimeout)
	defer cancel()
	if k.writer.running() {
		select {
		case <-k.writer.stopped():
		case <-leaveCtx.Done():
		}
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

// presenceStore is the presence index both ways: this pod writes its hub, invites read anyone's.
type presenceStore interface {
	presenceIndex
	presenceLookup
}

// WithPresence writes this pod's hub into the presence index and looks invite targets up in it,
// the pod's Redis in production. FS-R82NV R7, R12.
func WithPresence(index presenceStore) Option {
	return func(o *bootOptions) { o.presence = index }
}
