package listing

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
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

// recordingCreator captures the command it was handed and succeeds.
type recordingCreator struct {
	called bool
	cmd    *usecase.CreateListingCommand
}

func (r *recordingCreator) Handle(ctx context.Context, cmd *usecase.CreateListingCommand) error {
	r.called = true
	r.cmd = cmd
	return nil
}

// refusingRepo is never reached: the domain refuses before any write.
type refusingRepo struct{ listing.Repository }

func validItemReservedEvent(endsAt time.Time, startPrice int64) *pb.ItemReservedEvent {
	return &pb.ItemReservedEvent{
		EventId:    uuid.NewString(),
		Id:         uuid.NewString(),
		SellerId:   uuid.NewString(),
		ListingId:  uuid.NewString(),
		StartPrice: startPrice,
		EndsAt:     timestamppb.New(endsAt),
	}
}

func marshalEvent(t *testing.T, event *pb.ItemReservedEvent) []byte {
	t.Helper()
	body, err := proto.Marshal(event)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	return body
}

func itemReservedBody(t *testing.T, endsAt time.Time, startPrice int64) []byte {
	t.Helper()
	return marshalEvent(t, validItemReservedEvent(endsAt, startPrice))
}

// The listing is created under the ID items-service minted on reserve, not one
// of the marketplace's own (FS-NXP1W Req 24a).
func TestItemReservedConsumer_CreatesListingWithEventListingID(t *testing.T) {
	event := validItemReservedEvent(time.Now().Add(time.Hour), 100)
	creator := &recordingCreator{}

	got := deliver(t, creator, marshalEvent(t, event))

	if got != (outcome{acked: true}) {
		t.Fatalf("got %+v, want acked", got)
	}
	if creator.cmd == nil {
		t.Fatal("usecase was never called")
	}
	if creator.cmd.ListingID.String() != event.ListingId {
		t.Fatalf("listing ID = %s, want %s", creator.cmd.ListingID, event.ListingId)
	}
}

// Without a usable listing_id the event can never become a listing, so it is
// dead-lettered before the usecase is reached.
func TestItemReservedConsumer_MissingOrMalformedListingIDIsDeadLettered(t *testing.T) {
	tests := []struct {
		name      string
		listingID string
	}{
		{"missing listing_id", ""},
		{"malformed listing_id", "not-a-uuid"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := validItemReservedEvent(time.Now().Add(time.Hour), 100)
			event.ListingId = tt.listingID
			creator := &recordingCreator{}

			got := deliver(t, creator, marshalEvent(t, event))

			want := outcome{nacked: true, requeue: false}
			if got != want {
				t.Fatalf("got %+v, want %+v", got, want)
			}
			if creator.called {
				t.Fatal("usecase must not be reached without a valid listing_id")
			}
		})
	}
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
	items := &fakeItems{}
	uc := usecase.NewCreateListingUC(refusingRepo{}, items)

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
			if items.confirms != 0 {
				t.Fatal("refused terms must be dead-lettered without confirming")
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
			// only the use case decides a replay (listings_pkey) and answers nil;
			// a duplicate reaching the consumer is another listing on the item
			name: "unique violation other than the replay is dead-lettered",
			err:  fmt.Errorf("create listing usecase inserting listing refused: %w", commonconstants.ErrDuplicateResource),
			want: outcome{nacked: true, requeue: false},
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

// The seller's buyout reaches the listing's birth; an event without the field
// (published before FS-9XKS6) births a plain auction, never a buyout of 0.
func TestItemReservedConsumer_CarriesBuyoutPrice(t *testing.T) {
	buyout := int64(900)

	tests := []struct {
		name   string
		buyout *int64
		want   *int
	}{
		{"set", &buyout, func() *int { v := 900; return &v }()},
		{"absent", nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := validItemReservedEvent(time.Now().Add(time.Hour), 100)
			event.BuyoutPrice = tt.buyout
			creator := &recordingCreator{}

			got := deliver(t, creator, marshalEvent(t, event))

			if got != (outcome{acked: true}) {
				t.Fatalf("got %+v, want acked", got)
			}
			if (creator.cmd.BuyoutPrice == nil) != (tt.want == nil) ||
				(tt.want != nil && *creator.cmd.BuyoutPrice != *tt.want) {
				t.Fatalf("buyout = %v, want %v", creator.cmd.BuyoutPrice, tt.want)
			}
		})
	}
}

// A buyout the listing refuses can never become a listing on redelivery.
func TestItemReservedConsumer_RefusedBuyoutIsDeadLettered(t *testing.T) {
	event := validItemReservedEvent(time.Now().Add(time.Hour), 100)
	buyout := int64(100)
	event.BuyoutPrice = &buyout

	got := deliver(t, usecase.NewCreateListingUC(refusingRepo{}, &fakeItems{}), marshalEvent(t, event))

	if want := (outcome{nacked: true, requeue: false}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

// fakeItems answers confirm and release the way items-service would, and counts
// the calls.
type fakeItems struct {
	confirmed  bool
	confirmErr error
	released   bool
	releaseErr error

	confirms int
	releases int
}

func (f *fakeItems) ConfirmReservation(ctx context.Context, itemID, listingID uuid.UUID) (*itemspb.ConfirmReservationResponse, error) {
	f.confirms++
	if f.confirmErr != nil {
		return nil, f.confirmErr
	}
	return &itemspb.ConfirmReservationResponse{Confirmed: f.confirmed}, nil
}

func (f *fakeItems) ReleaseConfirmedReservation(ctx context.Context, itemID, listingID uuid.UUID) (*itemspb.ReleaseConfirmedReservationResponse, error) {
	f.releases++
	if f.releaseErr != nil {
		return nil, f.releaseErr
	}
	return &itemspb.ReleaseConfirmedReservationResponse{Released: f.released}, nil
}

// listingStore is a listings table in memory: it answers an insert the way the
// repository does, and keeps what landed.
type listingStore struct {
	listing.Repository
	rows map[uuid.UUID]*listing.Listing
	// insertErr, when set, is what every insert answers instead.
	insertErr error
}

func newListingStore() *listingStore {
	return &listingStore{rows: map[uuid.UUID]*listing.Listing{}}
}

func (s *listingStore) Insert(ctx context.Context, l *listing.Listing) error {
	if s.insertErr != nil {
		return s.insertErr
	}
	id := l.Snapshot().ID
	if _, ok := s.rows[id]; ok {
		return fmt.Errorf("listing insert %s: %w", id, listing.ErrListingAlreadyExists)
	}
	s.rows[id] = l
	return nil
}

// FS-04ZB6 §Acceptance Criteria (marketplace-service): the broker answer and
// the calls to items for each way an item.reserved event can go, through the
// real create-listing use case.
func TestItemReservedConsumer_CreatesListingOnlyOverConfirmedReservation(t *testing.T) {
	unavailable := errors.New("rpc error: code = Unavailable desc = connection refused")
	deadLetter := outcome{nacked: true, requeue: false}
	requeue := outcome{nacked: true, requeue: true}

	tests := []struct {
		name         string
		items        *fakeItems
		insertErr    error
		want         outcome
		wantListings int
		wantReleases int
	}{
		{"confirm succeeds: an ACTIVE listing is inserted", &fakeItems{confirmed: true}, nil, outcome{acked: true}, 1, 0},
		{"confirmed = false: acked, nothing inserted", &fakeItems{confirmed: false}, nil, outcome{acked: true}, 0, 0},
		{"confirm transport failure: requeued", &fakeItems{confirmErr: unavailable}, nil, requeue, 0, 0},
		{
			"idx_one_active_listing_per_item: released and dead-lettered, never acked",
			&fakeItems{confirmed: true, released: true},
			commonconstants.ErrDuplicateResource, deadLetter, 0, 1,
		},
		{
			"release matches nothing: dead-lettered anyway",
			&fakeItems{confirmed: true, released: false},
			commonconstants.ErrDuplicateResource, deadLetter, 0, 1,
		},
		{
			"release transport failure: requeued",
			&fakeItems{confirmed: true, releaseErr: unavailable},
			commonconstants.ErrDuplicateResource, requeue, 0, 1,
		},
		{
			"unknown insert outcome: requeued, never released",
			&fakeItems{confirmed: true, released: true},
			fmt.Errorf("listing insert: %w", commonconstants.ErrTransient), requeue, 0, 0,
		},
		{
			"ambiguous COMMIT: requeued, never released",
			&fakeItems{confirmed: true, released: true},
			errors.New("driver: bad connection"), requeue, 0, 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newListingStore()
			store.insertErr = tt.insertErr
			event := validItemReservedEvent(time.Now().Add(time.Hour), 100)

			got := deliver(t, usecase.NewCreateListingUC(store, tt.items), marshalEvent(t, event))

			if got != tt.want {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
			if len(store.rows) != tt.wantListings {
				t.Fatalf("listings = %d, want %d", len(store.rows), tt.wantListings)
			}
			if tt.items.releases != tt.wantReleases {
				t.Fatalf("releases = %d, want %d", tt.items.releases, tt.wantReleases)
			}
			for _, l := range store.rows {
				if l.Snapshot().Status != listing.StatusActive {
					t.Fatalf("status = %s, want ACTIVE", l.Snapshot().Status)
				}
			}
		})
	}
}

// Redelivered events, through the same use case and store: after the listing
// landed the retry confirms again and meets it as a replay; after a confirm whose
// insert never ran, the retry confirms again and inserts.
func TestItemReservedConsumer_RedeliveryAfterConfirm(t *testing.T) {
	t.Run("after insert: acked as a replay, still one listing", func(t *testing.T) {
		store := newListingStore()
		items := &fakeItems{confirmed: true, released: true}
		body := marshalEvent(t, validItemReservedEvent(time.Now().Add(time.Hour), 100))
		uc := usecase.NewCreateListingUC(store, items)

		first := deliver(t, uc, body)
		second := deliver(t, uc, body)

		if first != (outcome{acked: true}) || second != (outcome{acked: true}) {
			t.Fatalf("got %+v then %+v, want both acked", first, second)
		}
		if len(store.rows) != 1 {
			t.Fatalf("listings = %d, want 1", len(store.rows))
		}
		if items.confirms != 2 || items.releases != 0 {
			t.Fatalf("confirms = %d, releases = %d; want 2 and 0", items.confirms, items.releases)
		}
	})

	t.Run("before insert: the listing is inserted", func(t *testing.T) {
		store := newListingStore()
		store.insertErr = fmt.Errorf("listing insert: %w", commonconstants.ErrTransient)
		items := &fakeItems{confirmed: true, released: true}
		body := marshalEvent(t, validItemReservedEvent(time.Now().Add(time.Hour), 100))
		uc := usecase.NewCreateListingUC(store, items)

		first := deliver(t, uc, body)
		store.insertErr = nil
		second := deliver(t, uc, body)

		if first != (outcome{nacked: true, requeue: true}) || second != (outcome{acked: true}) {
			t.Fatalf("got %+v then %+v, want requeued then acked", first, second)
		}
		if len(store.rows) != 1 || items.releases != 0 {
			t.Fatalf("listings = %d, releases = %d; want 1 and 0", len(store.rows), items.releases)
		}
	})
}
