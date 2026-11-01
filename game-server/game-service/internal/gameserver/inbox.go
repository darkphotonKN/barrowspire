package gameserver

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

/**
* The pod inbox (FS-R82NV R9, R10): the Redis channel `pod:<podID>:inbox` each pod listens on for
* letters addressed to its players from another pod (a party invite, a reply to one). It rides the
* chat bus's Redis client and the same shape as world chat's path (one subscriber that resubscribes
* a second after a drop, one publisher with a 2 s timeout), on goroutines of its own, so chat and
* party never hold each other up (I-R82NV-3 decision 4).
*
* Letters are at most once, like chat lines: a full queue drops one rather than stall a goroutine.
* A letter that could not be published is handed back, so its sender can say so.
**/

// inboxBus is the Redis side of the inbox: chatbus.Redis in production.
type inboxBus interface {
	Listen(ctx context.Context, channel string, onMessage func(payload []byte)) error
	Publish(ctx context.Context, channel string, payload []byte) error
}

// Letter kinds (R9). A letter for a player this pod does not hold is dropped.
const (
	letterPartyInvite = "party_invite"
	letterPartyReply  = "party_reply"
)

// letter is one inbox message: {kind, to_player_id, payload}.
type letter struct {
	Kind       string                 `json:"kind"`
	ToPlayerID string                 `json:"to_player_id,omitempty"`
	Payload    map[string]interface{} `json:"payload"`
}

const (
	inboxBuffer          = 64
	inboxPublishTimeout  = 2 * time.Second
	inboxResubscribeWait = time.Second
)

func inboxChannel(podID string) string { return "pod:" + podID + ":inbox" }

// outgoing is a letter on its way to another pod; failed runs, off the hub's loop, if it was not
// published.
type outgoing struct {
	podID  string
	letter letter
	failed func()
}

type podInbox struct {
	bus      inboxBus
	podID    string
	arrived  chan letter
	outgoing chan outgoing
}

func newPodInbox(bus inboxBus, podID string) *podInbox {
	return &podInbox{
		bus:      bus,
		podID:    podID,
		arrived:  make(chan letter, inboxBuffer),
		outgoing: make(chan outgoing, inboxBuffer),
	}
}

// start runs the subscriber and the publisher for the life of ctx; an inbox with no bus starts
// nothing, and its pod reaches no other.
func (in *podInbox) start(ctx context.Context) {
	if in.bus == nil {
		return
	}
	go in.listen(ctx)
	go in.publishLoop(ctx)
}

// open reports whether this pod can write to other pods' inboxes at all.
func (in *podInbox) open() bool { return in.bus != nil }

// letters is where letters off the bus wait for the hub's loop.
func (in *podInbox) letters() <-chan letter { return in.arrived }

// send queues l for podID's inbox. failed runs, off the loop, if it is not published; a full
// queue fails it at once.
func (in *podInbox) send(podID string, l letter, failed func()) {
	select {
	case in.outgoing <- outgoing{podID: podID, letter: l, failed: failed}:
	default:
		slog.Warn("inbox letter not sent: publisher behind", "kind", l.Kind, "pod_id", podID)
		go failed()
	}
}

func (in *podInbox) listen(ctx context.Context) {
	channel := inboxChannel(in.podID)
	for {
		err := in.bus.Listen(ctx, channel, in.receive)
		if ctx.Err() != nil {
			return
		}
		slog.Warn("pod inbox subscription dropped; subscribing again", "redis_channel", channel, "error", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(inboxResubscribeWait):
		}
	}
}

// receive takes one letter's bytes off the bus for the hub's loop; a bad letter is skipped, and a
// full queue drops one rather than stall the subscriber.
func (in *podInbox) receive(raw []byte) {
	var l letter
	if err := json.Unmarshal(raw, &l); err != nil || l.Kind == "" {
		slog.Warn("pod inbox letter skipped", "error", fmt.Errorf("decode letter: %w", err))
		return
	}
	select {
	case in.arrived <- l:
	default:
		slog.Debug("pod inbox letter dropped: hub loop behind", "kind", l.Kind)
	}
}

func (in *podInbox) publishLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case out := <-in.outgoing:
			raw, err := json.Marshal(out.letter)
			if err == nil {
				publishCtx, cancel := context.WithTimeout(ctx, inboxPublishTimeout)
				err = in.bus.Publish(publishCtx, inboxChannel(out.podID), raw)
				cancel()
			}
			if err != nil {
				slog.Warn("inbox letter not published", "kind", out.letter.Kind, "pod_id", out.podID, "error", err)
				out.failed()
			}
		}
	}
}

// WithPodInbox gives the pod its inbox on bus, the chat bus's Redis in production: it listens at
// boot and can write to other pods'. FS-R82NV R9, R10.
func WithPodInbox(bus inboxBus) Option {
	return func(o *bootOptions) { o.inboxBus = bus }
}
