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
