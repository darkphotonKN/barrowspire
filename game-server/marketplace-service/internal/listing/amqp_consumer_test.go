package listing

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/usecase"
	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// outcome is what the consumer told the broker about one delivery.
type outcome struct {
	acked   bool
	nacked  bool
	requeue bool
}

// fakeAcknowledger records the broker answer for a delivery and signals once
// one has been given.
type fakeAcknowledger struct {
	once sync.Once
	done chan struct{}
	got  outcome
}

func newFakeAcknowledger() *fakeAcknowledger {
	return &fakeAcknowledger{done: make(chan struct{})}
}

func (f *fakeAcknowledger) record(o outcome) {
	f.once.Do(func() {
		f.got = o
		close(f.done)
	})
}

func (f *fakeAcknowledger) Ack(tag uint64, multiple bool) error {
	f.record(outcome{acked: true})
	return nil
}

func (f *fakeAcknowledger) Nack(tag uint64, multiple, requeue bool) error {
	f.record(outcome{nacked: true, requeue: requeue})
	return nil
}

func (f *fakeAcknowledger) Reject(tag uint64, requeue bool) error {
	f.record(outcome{nacked: true, requeue: requeue})
	return nil
}

// stubCreator stands in for the create-listing usecase with a fixed answer.
type stubCreator struct{ err error }

func (s stubCreator) Handle(ctx context.Context, cmd *usecase.CreateListingCommand) error {
	return s.err
}

// refusingRepo is never reached: the domain refuses before any write.
type refusingRepo struct{ listing.Repository }

func itemReservedBody(t *testing.T, endsAt time.Time, startPrice int64) []byte {
	t.Helper()
	body, err := proto.Marshal(&pb.ItemReservedEvent{
		EventId:    uuid.NewString(),
		Id:         uuid.NewString(),
		SellerId:   uuid.NewString(),
		StartPrice: startPrice,
		EndsAt:     timestamppb.New(endsAt),
	})
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	return body
}

// deliver runs one delivery through the consumer loop and returns the answer
// the loop gave the broker.
func deliver(t *testing.T, creator listingCreator, body []byte) outcome {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ack := newFakeAcknowledger()
	msgs := make(chan amqp.Delivery, 1)
	msgs <- amqp.Delivery{Acknowledger: ack, Body: body}

	c := &consumer{createListingUC: creator}
	go c.itemReservedConsumerLoop(ctx, msgs)

	select {
	case <-ack.done:
		return ack.got
	case <-time.After(2 * time.Second):
		t.Fatal("consumer gave the broker no answer")
		return outcome{}
	}
}

// An event whose terms the listing refuses can never become a listing, so it
// is dead-lettered instead of redelivered forever. Driven through the real
// usecase so the refusal is the domain's own.
func TestItemReservedConsumer_RefusedTermsAreDeadLettered(t *testing.T) {
	uc := usecase.NewCreateListingUC(refusingRepo{})

	tests := []struct {
		name       string
		endsAt     time.Time
		startPrice int64
	}{
		{"ends_at in the past", time.Now().Add(-time.Hour), 100},
		{"ends_at at the unix epoch (dropped terms)", time.Unix(0, 0), 0},
		{"non-positive start price", time.Now().Add(time.Hour), 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deliver(t, uc, itemReservedBody(t, tt.endsAt, tt.startPrice))
			want := outcome{nacked: true, requeue: false}
			if got != want {
				t.Fatalf("got %+v, want %+v", got, want)
			}
		})
	}
}

func TestItemReservedConsumer_ClassifiesUsecaseFailures(t *testing.T) {
	future := time.Now().Add(time.Hour)

	tests := []struct {
		name string
		err  error
		want outcome
	}{
		{
			name: "duplicate is acked",
			err:  fmt.Errorf("create listing usecase already exists for item: %w", commonconstants.ErrDuplicateResource),
			want: outcome{acked: true},
		},
		{
			name: "transient failure is requeued",
			err:  fmt.Errorf("writing repo usecase inserting new listing : %w", commonconstants.ErrTransient),
			want: outcome{nacked: true, requeue: true},
		},
		{
			name: "concurrent modification is requeued",
			err:  fmt.Errorf("wrapped: %w", listing.ErrConcurrentModification),
			want: outcome{nacked: true, requeue: true},
		},
		{
			name: "unclassified failure is requeued",
			err:  errors.New("connection reset by peer"),
			want: outcome{nacked: true, requeue: true},
		},
		{
			name: "invalid end time is dead-lettered",
			err:  fmt.Errorf("create listing usecase birthing new listing : %w", listing.ErrInvalidEndTime),
			want: outcome{nacked: true, requeue: false},
		},
		{
			name: "invalid start price is dead-lettered",
			err:  fmt.Errorf("create listing usecase birthing new listing : %w", listing.ErrInvalidStartPrice),
			want: outcome{nacked: true, requeue: false},
		},
		{
			name: "invalid uuid is dead-lettered",
			err:  fmt.Errorf("create listing usecase birthing new listing : %w", listing.ErrInvalidUUID),
			want: outcome{nacked: true, requeue: false},
		},
		{
			name: "invalid listing state is dead-lettered",
			err:  fmt.Errorf("create listing usecase publishing listing: %w", listing.ErrInvalidListingState),
			want: outcome{nacked: true, requeue: false},
		},
		{
			name: "constraint violation is dead-lettered",
			err:  fmt.Errorf("writing repo usecase inserting new listing : %w", commonconstants.ErrConstraintViolation),
			want: outcome{nacked: true, requeue: false},
		},
		{
			name: "success is acked",
			err:  nil,
			want: outcome{acked: true},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deliver(t, stubCreator{err: tt.err}, itemReservedBody(t, future, 100))
			if got != tt.want {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}
