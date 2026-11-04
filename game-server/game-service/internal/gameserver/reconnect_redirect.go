package gameserver

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partypresence"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

/**
* The redirect (FS-MCYWK §A): a fresh connection can land on any pod behind the
* shared entry address, while the member may still be present on the pod that
* served them: seated in a run there, or within their reconnect grace. Before
* anything is created for the connection, the landing pod asks the presence
* index which pod the member is present on; if that is another live pod, the
* holding pod, it sends the client there and keeps nothing. Anything short of a clear answer seats them where they landed, as
* before: the worst case is today's.
**/

// redirectLookupBound bounds the whole lookup a fresh connection waits on: the
// presence index, then the holding pod's liveness. Past it the connection is
// seated where it landed. FS-MCYWK R4, charter #6.
const redirectLookupBound = 500 * time.Millisecond

// redirectedValue is the redirected query parameter's value on a connection a
// server sent the client to make (FS-MCYWK R8).
const redirectedValue = "1"

// presenceByID finds where a player is present: partypresence.Redis in
// production (FS-NCC9J R7).
type presenceByID interface {
	Lookup(ctx context.Context, nameOrID string) (partypresence.Found, bool, error)
}

// podLiveness reads whether a pod is still heartbeating: matchqueue.Redis in
// production, reading the pod:alive key it owns (FS-K2HKP).
type podLiveness interface {
	PodAlive(ctx context.Context, podID string) (bool, error)
}

// WithPodLiveness reads other pods' liveness, so a connection is only sent to a
// pod still alive: the matchmaker's Redis in production. A pod built without it
// never redirects. FS-MCYWK R4, R6.
func WithPodLiveness(liveness podLiveness) Option {
	return func(o *bootOptions) { o.podLiveness = liveness }
}

// holdingPods finds a member's holding pod when it is another live pod.
type holdingPods struct {
	podID    string
	presence presenceByID
	liveness podLiveness
}

// newHoldingPods is the finder for pod podID, or nil when either read is
// missing: such a pod never looks up (FS-MCYWK R6).
func newHoldingPods(podID string, presence presenceByID, liveness podLiveness) *holdingPods {
	if presence == nil || liveness == nil {
		return nil
	}
	return &holdingPods{podID: podID, presence: presence, liveness: liveness}
}

// presentOn is one lookup's answer: the presence entry of the holding pod to
// send the member to, if there is one.
type presentOn struct {
	entry partypresence.Found
	found bool
	err   error
}

/**
* find is the presence entry of the holding pod to send the member to: it names another
* pod, with an address, whose pod:alive key exists. Both reads together are
* bounded by redirectLookupBound, and the bound holds even against a read that
* ignores its context, so a slow Redis costs a connection at most the bound. A
* missing finder, an error, the bound running out and the connection going
* away all report not found. FS-MCYWK R4–R6.
**/
func (h *holdingPods) find(ctx context.Context, playerID uuid.UUID) (partypresence.Found, bool) {
	if h == nil {
		return partypresence.Found{}, false
	}

	bounded, cancel := context.WithTimeout(ctx, redirectLookupBound)
	defer cancel()

	// buffered, so a read that outlives the bound finishes into it and is gone
	answer := make(chan presentOn, 1)
	go func() { answer <- h.lookup(bounded, playerID) }()

	select {
	case present := <-answer:
		if present.err != nil {
			slog.Warn("Could not look up the holding pod of a connecting player, seating them here",
				"player_id", playerID, "error", present.err)
		}
		return present.entry, present.found
	case <-bounded.Done():
		// the connection went away first: nobody waited too long, and
		// nobody is left to seat
		if err := ctx.Err(); err != nil {
			slog.Debug("A connecting player went away while their holding pod was looked up",
				"player_id", playerID, "error", err)
			return partypresence.Found{}, false
		}
		slog.Warn("Looking up the holding pod of a connecting player took too long, seating them here",
			"player_id", playerID, "bound", redirectLookupBound)
		return partypresence.Found{}, false
	}
}

// lookup is find's two reads: the presence entry, then the liveness of the pod
// it names, only if that is another pod with an address.
func (h *holdingPods) lookup(ctx context.Context, playerID uuid.UUID) presentOn {
	entry, present, err := h.presence.Lookup(ctx, playerID.String())
	if err != nil {
		return presentOn{err: fmt.Errorf("look up presence: %w", err)}
	}
	// a stale self-entry, or one from a pod that kept no address, is no place
	// to send anyone (R6)
	if !present || entry.PodID == h.podID || entry.PodAddr == "" {
		return presentOn{}
	}

	alive, err := h.liveness.PodAlive(ctx, entry.PodID)
	if err != nil {
		return presentOn{err: fmt.Errorf("read liveness of pod %s: %w", entry.PodID, err)}
	}

	return presentOn{entry: entry, found: alive}
}

// redirectWriteTimeout bounds the redirect's one message and its close frame.
const redirectWriteTimeout = time.Second

/**
* redirectToHoldingPod sends the connection to the holding pod: it is upgraded,
* sent one world_handoff {addr, reconnect: true}, and closed normally with the
* reason "redirected". Nothing is created for it: no record, no mapping, no
* writer (none exists yet, so the message is written on the socket directly),
* and nothing reaches the presence index or the queue. FS-MCYWK R7.
**/
func (s *Server) redirectToHoldingPod(c *gin.Context, playerID uuid.UUID, holding partypresence.Found) {
	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// the upgrader has already answered the request with an HTTP error
		slog.Error("Could not upgrade a connection to redirect it", "player_id", playerID, "error", err)
		return
	}
	defer conn.Close()

	slog.Info("Redirecting a connection to the player's holding pod",
		"player_id", playerID, "holding_pod_id", holding.PodID)

	deadline := time.Now().Add(redirectWriteTimeout)
	if err := conn.SetWriteDeadline(deadline); err != nil {
		slog.Warn("Could not bound the redirect's write", "player_id", playerID, "error", err)
	}
	if err := conn.WriteJSON(types.Message{
		Action:  string(constants.ActionWorldHandoff),
		Payload: map[string]interface{}{"addr": holding.PodAddr, "reconnect": true},
	}); err != nil {
		slog.Warn("Could not send a redirect", "player_id", playerID, "error", err)
		return
	}
	_ = conn.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "redirected"), deadline)
}
