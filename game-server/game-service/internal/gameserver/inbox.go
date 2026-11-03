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
	// Publish, telling how many subscribers heard it: a confirmed letter's path (FS-KCQ06)
	PublishCount(ctx context.Context, channel string, payload []byte) (int64, error)
}

// Letter kinds (FS-R82NV R9; FS-NCC9J R5; FS-XGW7H R10; FS-988SM R8a; FS-KCQ06 R8). A letter for a
// player this pod does not hold is dropped.
const (
	letterPartyInvite = "party_invite"
	letterPartyUpdate = "party_update"
	letterPartyNotice = "party_notice"
	letterPartyChat   = "party_chat"
	// a random match hosted elsewhere was cancelled: the player is refused find_game here
	letterMatchFailed = "match_failed"
	letterWhisper     = "whisper"
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
// published, and sent, if set, once it was. A confirmed letter is sent only if a pod heard it.
type outgoing struct {
	podID     string
	letter    letter
	confirmed bool
	sent      func()
	failed    func()
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
	in.queue(outgoing{podID: podID, letter: l, failed: failed})
}

// sendConfirmed is send, with sent run, off the loop, once l is published and heard: Redis took it
// and handed it to a subscriber on podID's inbox. Nobody listening, as on a pod that has died
// while its players' presence lingers, fails it (FS-KCQ06 Edge States, charter #2). A letter some
// other pod heard is still only at most once: that pod may not seat its addressee.
func (in *podInbox) sendConfirmed(podID string, l letter, sent, failed func()) {
	in.queue(outgoing{podID: podID, letter: l, confirmed: true, sent: sent, failed: failed})
}

// queue hands out to the publisher; a full queue fails it at once.
func (in *podInbox) queue(out outgoing) {
	select {
	case in.outgoing <- out:
	default:
		slog.Warn("inbox letter not sent: publisher behind", "kind", out.letter.Kind, "pod_id", out.podID)
		go out.failed()
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
			if err := in.publish(ctx, out); err != nil {
				slog.Warn("inbox letter not published", "kind", out.letter.Kind, "pod_id", out.podID, "error", err)
				out.failed()
				continue
			}
			if out.sent != nil {
				out.sent()
			}
		}
	}
}

// publish puts out's letter on its pod's inbox. A confirmed letter nobody heard is not sent.
func (in *podInbox) publish(ctx context.Context, out outgoing) error {
	raw, err := json.Marshal(out.letter)
	if err != nil {
		return fmt.Errorf("encode letter: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, inboxPublishTimeout)
	defer cancel()
	channel := inboxChannel(out.podID)
	if !out.confirmed {
		return in.bus.Publish(ctx, channel, raw)
	}
	heard, err := in.bus.PublishCount(ctx, channel, raw)
	if err != nil {
		return err
	}
	if heard == 0 {
		return fmt.Errorf("nobody listening on %s", channel)
	}
	return nil
}

// WithPodInbox gives the pod its inbox on bus, the chat bus's Redis in production: it listens at
// boot and can write to other pods'. FS-R82NV R9, R10.
func WithPodInbox(bus inboxBus) Option {
	return func(o *bootOptions) { o.inboxBus = bus }
}
