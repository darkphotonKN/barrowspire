package gameserver

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeBus is an inbox bus a test feeds letters into by hand.
type fakeBus struct {
	onMessage chan func([]byte)
}

func (b fakeBus) Listen(ctx context.Context, _ string, onMessage func([]byte)) error {
	b.onMessage <- onMessage
	<-ctx.Done()
	return ctx.Err()
}

func (fakeBus) Publish(context.Context, string, []byte) error { return nil }

func (fakeBus) PublishCount(context.Context, string, []byte) (int64, error) { return 1, nil }

// The inbox hands each letter off the bus to the hub's loop as it came, and skips one it cannot
// read (a bad payload or no kind) without stopping (FS-R82NV R9; I-R82NV-3 review test gap
// "inbox letter consumption", carried into I-NCC9J-3).
func TestPodInbox_LettersReachTheLoopBadOnesSkipped(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	bus := fakeBus{onMessage: make(chan func([]byte), 1)}
	inbox := newPodInbox(bus, "pod-b")
	inbox.start(ctx)
	deliver := <-bus.onMessage

	good, err := json.Marshal(letter{Kind: letterPartyNotice, ToPlayerID: "p1", Payload: map[string]interface{}{"code": "declined"}})
	require.NoError(t, err)
	deliver([]byte("not json"))
	deliver([]byte(`{"to_player_id":"p1"}`)) // no kind
	deliver(good)

	select {
	case l := <-inbox.letters():
		assert.Equal(t, letterPartyNotice, l.Kind)
		assert.Equal(t, "p1", l.ToPlayerID)
		assert.Equal(t, "declined", l.Payload["code"])
	case <-time.After(time.Second):
		t.Fatal("the good letter never reached the loop")
	}
	select {
	case l := <-inbox.letters():
		t.Fatalf("only the good letter reaches the loop; got %+v", l)
	default:
	}
}

// nobodyHears is an inbox bus on which every publish succeeds and no pod hears anything; it
// records which publish each letter went out by.
type nobodyHears struct {
	fakeBus
	by chan string
}

func (b nobodyHears) Publish(context.Context, string, []byte) error {
	b.by <- "Publish"
	return nil
}

func (b nobodyHears) PublishCount(context.Context, string, []byte) (int64, error) {
	b.by <- "PublishCount"
	return 0, nil
}

// Only a confirmed letter (a whisper) asks whether a pod heard it, and fails when none did. Every
// other kind is published as it always was: a count of 0 fails none of them. FS-KCQ06 Edge States
// (target's pod crashed); FS-R82NV R10 and FS-XGW7H unchanged.
func TestPodInbox_NobodyListening_OnlyAConfirmedLetterFails(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	bus := nobodyHears{fakeBus: fakeBus{onMessage: make(chan func([]byte), 1)}, by: make(chan string, 1)}
	inbox := newPodInbox(bus, "pod-a")
	inbox.start(ctx)

	failed := make(chan string, 1)
	for _, kind := range []string{letterPartyInvite, letterPartyUpdate, letterPartyNotice, letterPartyChat} {
		inbox.send("pod-b", letter{Kind: kind}, func() { failed <- kind })
		select {
		case by := <-bus.by:
			assert.Equal(t, "Publish", by, "%s goes out by the plain publish", kind)
		case <-time.After(time.Second):
			t.Fatalf("%s was never published", kind)
		}
	}

	sent := make(chan struct{}, 1)
	inbox.sendConfirmed("pod-b", letter{Kind: letterWhisper}, func() { sent <- struct{}{} }, func() { failed <- letterWhisper })
	assert.Equal(t, "PublishCount", <-bus.by, "a whisper asks who heard it")
	select {
	case kind := <-failed:
		assert.Equal(t, letterWhisper, kind, "only the whisper fails")
	case <-time.After(time.Second):
		t.Fatal("a whisper nobody heard was not failed")
	}
	select {
	case <-sent:
		t.Fatal("a whisper nobody heard was told sent")
	case kind := <-failed:
		t.Fatalf("%s failed twice", kind)
	default:
	}
}
