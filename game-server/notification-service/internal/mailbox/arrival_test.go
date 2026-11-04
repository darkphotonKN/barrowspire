package mailbox

import (
	"context"
	"log/slog"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-1GZGD R41, R50, R62; ADR-0045 §Decision 1. The payloads are exactly the
// two forms game-service's subscriber decodes; anything else it drops.

// recordingHandler keeps every log record, so a test can count the warnings.
type recordingHandler struct {
	mu      sync.Mutex
	records []slog.Record
}

func (h *recordingHandler) Enabled(context.Context, slog.Level) bool { return true }
func (h *recordingHandler) Handle(_ context.Context, r slog.Record) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.records = append(h.records, r)
	return nil
}
func (h *recordingHandler) WithAttrs([]slog.Attr) slog.Handler { return h }
func (h *recordingHandler) WithGroup(string) slog.Handler      { return h }

func (h *recordingHandler) warnings() []slog.Record {
	h.mu.Lock()
	defer h.mu.Unlock()
	var warns []slog.Record
	for _, r := range h.records {
		if r.Level == slog.LevelWarn {
			warns = append(warns, r)
		}
	}
	return warns
}

func attrOf(r slog.Record, key string) (slog.Value, bool) {
	var (
		v     slog.Value
		found bool
	)
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == key {
			v, found = a.Value, true
			return false
		}
		return true
	})
	return v, found
}

// publisherOn builds the publisher on a client for addr, logging into a
// recorder, with the given deadline.
func publisherOn(t *testing.T, addr string, timeout time.Duration) (*RedisArrivalPublisher, *recordingHandler) {
	t.Helper()
	client := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { _ = client.Close() })
	logs := &recordingHandler{}
	p := NewRedisArrivalPublisher(client)
	p.timeout = timeout
	p.log = slog.New(logs)
	return p, logs
}

// listen subscribes to mail:arrived on mr and answers the payloads received
// once want of them arrived, or whatever came within a second.
func listen(t *testing.T, mr *miniredis.Miniredis) func(want int) []string {
	t.Helper()
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	sub := client.Subscribe(context.Background(), "mail:arrived")
	t.Cleanup(func() { _ = sub.Close() })
	_, err := sub.Receive(context.Background()) // the subscription is live
	require.NoError(t, err)
	ch := sub.Channel()

	return func(want int) []string {
		var got []string
		deadline := time.After(time.Second)
		for len(got) < want {
			select {
			case msg := <-ch:
				got = append(got, msg.Payload)
			case <-deadline:
				return got
			}
		}
		// anything beyond want is a duplicate the test should see
		select {
		case msg := <-ch:
			got = append(got, msg.Payload)
		case <-time.After(50 * time.Millisecond):
		}
		return got
	}
}

func letterFor(member *uuid.UUID) Letter {
	return Letter{ID: uuid.New(), MemberID: member}
}

func TestPublishArrivals_OneMemberLetterPublishesItsMemberID(t *testing.T) {
	mr := miniredis.RunT(t)
	received := listen(t, mr)
	p, logs := publisherOn(t, mr.Addr(), time.Second)
	member := uuid.New()

	p.PublishArrivals(context.Background(), []Letter{letterFor(&member)})

	assert.Equal(t, []string{`{"member_id":"` + member.String() + `"}`}, received(1))
	assert.Empty(t, logs.warnings())
}

func TestPublishArrivals_BroadcastPublishesBroadcastTrue(t *testing.T) {
	mr := miniredis.RunT(t)
	received := listen(t, mr)
	p, _ := publisherOn(t, mr.Addr(), time.Second)

	p.PublishArrivals(context.Background(), []Letter{letterFor(nil)})

	assert.Equal(t, []string{`{"broadcast":true}`}, received(1))
}

func TestPublishArrivals_BatchPublishesOneMessagePerLetterInOrder(t *testing.T) {
	mr := miniredis.RunT(t)
	received := listen(t, mr)
	p, _ := publisherOn(t, mr.Addr(), time.Second)
	a, b, c := uuid.New(), uuid.New(), uuid.New()

	p.PublishArrivals(context.Background(), []Letter{letterFor(&a), letterFor(&b), letterFor(&c)})

	assert.Equal(t, []string{
		`{"member_id":"` + a.String() + `"}`,
		`{"member_id":"` + b.String() + `"}`,
		`{"member_id":"` + c.String() + `"}`,
	}, received(3))
}

func TestPublishArrivals_NoLettersPublishesNothing(t *testing.T) {
	mr := miniredis.RunT(t)
	received := listen(t, mr)
	p, logs := publisherOn(t, mr.Addr(), time.Second)

	p.PublishArrivals(context.Background(), nil)

	assert.Empty(t, received(0))
	assert.Empty(t, logs.warnings())
}

// The caller's request may be gone by the time its letters are committed;
// the hint is still worth sending.
func TestPublishArrivals_PublishesAfterTheCallersContextIsCancelled(t *testing.T) {
	mr := miniredis.RunT(t)
	received := listen(t, mr)
	p, _ := publisherOn(t, mr.Addr(), time.Second)
	member := uuid.New()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	p.PublishArrivals(ctx, []Letter{letterFor(&member)})

	assert.Len(t, received(1), 1)
}

func TestPublishArrivals_RedisDownLogsOneWarningWithTheLetter(t *testing.T) {
	mr := miniredis.RunT(t)
	addr := mr.Addr()
	mr.Close()
	p, logs := publisherOn(t, addr, time.Second)
	member := uuid.New()
	letter := letterFor(&member)

	p.PublishArrivals(context.Background(), []Letter{letter})

	warns := logs.warnings()
	require.Len(t, warns, 1)
	id, ok := attrOf(warns[0], "letter_id")
	require.True(t, ok, "a one-letter failure names its letter")
	assert.Equal(t, letter.ID.String(), id.String())
}

// A6: a 1000-member send waits one deadline, not 1000, and says so once.
func TestPublishArrivals_StalledRedisBoundsTheWholeBatchByOneDeadlineAndLogsOnce(t *testing.T) {
	stalled := stalledRedis(t)
	p, logs := publisherOn(t, stalled, 200*time.Millisecond)
	letters := make([]Letter, 0, 1000)
	for range 1000 {
		member := uuid.New()
		letters = append(letters, letterFor(&member))
	}

	start := time.Now()
	p.PublishArrivals(context.Background(), letters)
	elapsed := time.Since(start)

	assert.Less(t, elapsed, time.Second, "one deadline for the batch")
	warns := logs.warnings()
	require.Len(t, warns, 1)
	count, ok := attrOf(warns[0], "letters")
	require.True(t, ok)
	assert.Equal(t, int64(1000), count.Int64())
	published, ok := attrOf(warns[0], "published")
	require.True(t, ok)
	assert.Equal(t, int64(0), published.Int64())
}

// stalledRedis accepts connections and never answers, as a hung Redis does.
func stalledRedis(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	var (
		mu    sync.Mutex
		conns []net.Conn
	)
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			mu.Lock()
			conns = append(conns, c)
			mu.Unlock()
		}
	}()
	t.Cleanup(func() {
		_ = ln.Close()
		mu.Lock()
		defer mu.Unlock()
		for _, c := range conns {
			_ = c.Close()
		}
	})
	return ln.Addr().String()
}
