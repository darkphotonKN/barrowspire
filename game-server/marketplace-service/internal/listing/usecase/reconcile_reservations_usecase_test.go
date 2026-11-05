package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type reservation struct{ item, listing uuid.UUID }

// fakeReconcileReserver serves stale as the one and only page, the way an items
// that pages nothing answers. pages, when set, serves pages keyed by the position
// asked for instead: "" is the first page, and each page's next names the
// following one.
type fakeReconcileReserver struct {
	stale   []*pb.StaleReservation
	pages   map[string]*pb.ListStaleReservedResponse
	listErr error
	// listErrAt fails the read of the page at these positions
	listErrAt map[string]error
	// cancelErr and confirmErr fail the write for these listing ids
	cancelErr  map[uuid.UUID]error
	confirmErr map[uuid.UUID]error
	// onCancel runs after each cancel is recorded, to end the pass mid-page
	onCancel func()
	// duringCancel and duringConfirm run inside the call, before it answers; a
	// pass context ended by then cuts the call short with its error
	duringCancel  func()
	duringConfirm func()

	gotOlderThan time.Duration
	gotAfter     []string
	gotLimit     []int
	gotDeadlines []time.Time
	cancelled    []reservation
	confirmed    []reservation
}

func (f *fakeReconcileReserver) ListStaleReserved(ctx context.Context, olderThan time.Duration, after string, limit int) (*pb.ListStaleReservedResponse, error) {
	f.gotOlderThan = olderThan
	f.gotAfter = append(f.gotAfter, after)
	f.gotLimit = append(f.gotLimit, limit)
	deadline, _ := ctx.Deadline()
	f.gotDeadlines = append(f.gotDeadlines, deadline)
	if len(f.gotAfter) > listCallCap {
		return nil, errors.New("test fake: the pass never stopped paging")
	}
	if f.listErr != nil {
		return nil, f.listErr
	}
	if err := f.listErrAt[after]; err != nil {
		return nil, err
	}
	if f.pages == nil {
		return &pb.ListStaleReservedResponse{Reservations: f.stale}, nil
	}
	if page, ok := f.pages[after]; ok {
		return page, nil
	}
	return &pb.ListStaleReservedResponse{}, nil
}

func (f *fakeReconcileReserver) CancelReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.CancelReservationResponse, error) {
	if err := cutShort(ctx, f.duringCancel); err != nil {
		return nil, err
	}
	if err := f.cancelErr[listingID]; err != nil {
		return nil, err
	}
	f.cancelled = append(f.cancelled, reservation{itemID, listingID})
	if f.onCancel != nil {
		f.onCancel()
	}
	return &pb.CancelReservationResponse{}, nil
}

func (f *fakeReconcileReserver) ConfirmReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ConfirmReservationResponse, error) {
	if err := cutShort(ctx, f.duringConfirm); err != nil {
		return nil, err
	}
	if err := f.confirmErr[listingID]; err != nil {
		return nil, err
	}
	f.confirmed = append(f.confirmed, reservation{itemID, listingID})
	return &pb.ConfirmReservationResponse{}, nil
}

// fakeListingReader answers by listing id: live holds the listings that are
// ACTIVE or PENDING_SETTLEMENT. err fails every check, failing only the checks
// for those listing ids.
type fakeListingReader struct {
	live    map[uuid.UUID]bool
	err     error
	failing map[uuid.UUID]bool
	// during runs inside the check, before it answers
	during func()
}

func (f *fakeListingReader) HasLiveListing(ctx context.Context, listingID uuid.UUID) (bool, error) {
	if err := cutShort(ctx, f.during); err != nil {
		return false, err
	}
	if f.err != nil {
		return false, f.err
	}
	if f.failing[listingID] {
		return false, errors.New("db down")
	}
	return f.live[listingID], nil
}

// cutShort runs during, if set, as a call in flight would, and answers the
// error that call fails with when the context has ended by then: the context's
// own, wrapped the way a transport wraps it.
func cutShort(ctx context.Context, during func()) error {
	if during == nil {
		return nil
	}
	during()
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("rpc error: %w", err)
	}
	return nil
}

func staleOf(item, listing uuid.UUID) *pb.StaleReservation {
	return &pb.StaleReservation{ItemId: item.String(), ListingId: listing.String()}
}

// A reservation only counts as stale after ten minutes on items-service's clock.
// The age is sent, not a cutoff computed here, so the two services' clocks never
// have to agree.
func TestReconcileReservationsUC_AsksForReservationsOlderThanTenMinutes(t *testing.T) {
	items := &fakeReconcileReserver{}

	require.NoError(t, NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background()))

	assert.Equal(t, 10*time.Minute, items.gotOlderThan)
}

// The orphan: the item was reserved but its listing was never created. Cancelling
// gives the item back to its seller; the listing id fences the write to this one
// reservation.
func TestReconcileReservationsUC_NoListing_CancelsTheReservation(t *testing.T) {
	item, listing := uuid.New(), uuid.New()
	items := &fakeReconcileReserver{stale: []*pb.StaleReservation{staleOf(item, listing)}}

	require.NoError(t, NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listing}}, items.cancelled)
	assert.Empty(t, items.confirmed)
}

// The listing exists, so the reservation is good. Confirming it clears it from the
// stale set; left alone it would come back every sweep and, once a hundred such
// rows piled up, crowd every real orphan out of the batch.
func TestReconcileReservationsUC_ListingExists_ConfirmsTheReservation(t *testing.T) {
	item, listing := uuid.New(), uuid.New()
	items := &fakeReconcileReserver{stale: []*pb.StaleReservation{staleOf(item, listing)}}
	listings := &fakeListingReader{live: map[uuid.UUID]bool{listing: true}}

	require.NoError(t, NewReconcileReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listing}}, items.confirmed)
	assert.Empty(t, items.cancelled)
}

// FS-04ZB6 Req 11: reservation L is judged by listing L alone. Another live
// listing on the same item (the relist chain's L1) must not confirm it, or the
// item would stay LISTED under a listing that never existed.
func TestReconcileReservationsUC_OnlyAnotherListingOnTheItemIsLive_CancelsTheReservation(t *testing.T) {
	item, listing, other := uuid.New(), uuid.New(), uuid.New()
	items := &fakeReconcileReserver{stale: []*pb.StaleReservation{staleOf(item, listing)}}
	// the other listing is live; the item's id is marked too, so a check by item
	// rather than by listing would wrongly confirm
	listings := &fakeListingReader{live: map[uuid.UUID]bool{other: true, item: true}}

	require.NoError(t, NewReconcileReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listing}}, items.cancelled)
	assert.Empty(t, items.confirmed)
}

// Not knowing is not the same as no listing: a failed check leaves the
// reservation for the next sweep rather than freeing an item that may be listed.
func TestReconcileReservationsUC_CheckFails_TouchesNothing(t *testing.T) {
	items := &fakeReconcileReserver{stale: []*pb.StaleReservation{staleOf(uuid.New(), uuid.New())}}
	listings := &fakeListingReader{err: errors.New("db down")}

	require.NoError(t, NewReconcileReservationsUC(listings, items).Handle(context.Background()))

	assert.Empty(t, items.cancelled)
	assert.Empty(t, items.confirmed)
}

// One unparseable row must not sink the batch, and without both ids there is no
// fenced write to make for it.
func TestReconcileReservationsUC_UnparseableRow_IsSkipped(t *testing.T) {
	item, listing := uuid.New(), uuid.New()
	items := &fakeReconcileReserver{stale: []*pb.StaleReservation{
		{ItemId: "nope", ListingId: uuid.NewString()},
		{ItemId: uuid.NewString(), ListingId: ""},
		staleOf(item, listing),
	}}

	require.NoError(t, NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listing}}, items.cancelled)
}

func TestReconcileReservationsUC_ListFails_ReturnsTheError(t *testing.T) {
	items := &fakeReconcileReserver{listErr: errors.New("items down")}

	err := NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background())

	assert.Error(t, err)
}

// A page of rows that fail on every pass no longer hides what lies behind it
// (FS-9BJCP Req 11, 14): the keyset moves past the failing page, so the orphan
// on the next page is cancelled in the same pass.
func TestReconcileReservationsUC_FullPageOfFailingRows_StillReachesTheOrphanBehindIt(t *testing.T) {
	failing := map[uuid.UUID]bool{}
	head := make([]*pb.StaleReservation, staleReservationsPage)
	for i := range head {
		listing := uuid.New()
		failing[listing] = true
		head[i] = staleOf(uuid.New(), listing)
	}
	orphanItem, orphanListing := uuid.New(), uuid.New()
	items := &fakeReconcileReserver{pages: map[string]*pb.ListStaleReservedResponse{
		"":   {Reservations: head, Next: "p2"},
		"p2": {Reservations: []*pb.StaleReservation{staleOf(orphanItem, orphanListing)}},
	}}

	require.NoError(t, NewReconcileReservationsUC(&fakeListingReader{failing: failing}, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{orphanItem, orphanListing}}, items.cancelled)
	assert.Empty(t, items.confirmed)
	assert.Equal(t, []string{"", "p2"}, items.gotAfter, "the second page is read after the first's next")
}

// Each page is asked for with the age and items' page size, from the first page
// on every pass (FS-9BJCP Req 1, 11).
func TestReconcileReservationsUC_AsksEveryPageWithTheAgeAndThePageSize(t *testing.T) {
	items := &fakeReconcileReserver{pages: map[string]*pb.ListStaleReservedResponse{
		"":   {Next: "p2"},
		"p2": {Next: "p3"},
		"p3": {},
	}}

	require.NoError(t, NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background()))

	assert.Equal(t, []string{"", "p2", "p3"}, items.gotAfter)
	assert.Equal(t, []int{100, 100, 100}, items.gotLimit)
	assert.Equal(t, 10*time.Minute, items.gotOlderThan)
}

// An items too old to know the cursor ignores after and answers no next: the
// pass ends after that one page, which is the behaviour before paging (Req 18).
func TestReconcileReservationsUC_NoNext_EndsThePassAfterThePage(t *testing.T) {
	item, listing := uuid.New(), uuid.New()
	items := &fakeReconcileReserver{stale: []*pb.StaleReservation{staleOf(item, listing)}}

	require.NoError(t, NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background()))

	assert.Equal(t, []string{""}, items.gotAfter)
	assert.Equal(t, []reservation{{item, listing}}, items.cancelled)
}

// An items answering the position it was sent would have the pass ask for the
// same page forever, so the pass stops with an error (Req 12).
func TestReconcileReservationsUC_NextEqualsTheCursorSent_StopsWithAnError(t *testing.T) {
	items := &fakeReconcileReserver{pages: map[string]*pb.ListStaleReservedResponse{
		"":   {Next: "p2"},
		"p2": {Next: "p2"},
	}}

	err := NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background())

	require.Error(t, err)
	assert.Contains(t, err.Error(), "no progress")
	assert.Equal(t, []string{"", "p2"}, items.gotAfter)
}

// A page that cannot be read ends the pass with an error; the rows of the pages
// before it stay handled, and the next tick starts again from the first page
// (Req 14).
func TestReconcileReservationsUC_LaterPageFails_ReturnsTheErrorAfterHandlingEarlierRows(t *testing.T) {
	item, listing := uuid.New(), uuid.New()
	itemsDown := errors.New("items down")
	items := &fakeReconcileReserver{
		pages:     map[string]*pb.ListStaleReservedResponse{"": {Reservations: []*pb.StaleReservation{staleOf(item, listing)}, Next: "p2"}},
		listErrAt: map[string]error{"p2": itemsDown},
	}

	err := NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background())

	assert.ErrorIs(t, err, itemsDown)
	assert.Equal(t, []reservation{{item, listing}}, items.cancelled)
}

// A write that fails is logged and skipped; the next row is still settled
// (Req 14).
func TestReconcileReservationsUC_WriteFails_TheNextRowIsStillSettled(t *testing.T) {
	failCancel, failConfirm := uuid.New(), uuid.New()
	liveListing := uuid.New()
	orphanItem, orphanListing := uuid.New(), uuid.New()
	liveItem := uuid.New()
	items := &fakeReconcileReserver{
		stale: []*pb.StaleReservation{
			staleOf(uuid.New(), failCancel),
			staleOf(uuid.New(), failConfirm),
			staleOf(orphanItem, orphanListing),
			staleOf(liveItem, liveListing),
		},
		cancelErr:  map[uuid.UUID]error{failCancel: errors.New("items down")},
		confirmErr: map[uuid.UUID]error{failConfirm: errors.New("items down")},
	}
	listings := &fakeListingReader{live: map[uuid.UUID]bool{failConfirm: true, liveListing: true}}

	require.NoError(t, NewReconcileReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{orphanItem, orphanListing}}, items.cancelled)
	assert.Equal(t, []reservation{{liveItem, liveListing}}, items.confirmed)
}

// The pass runs under a deadline well inside the reconcile tick, the same bound
// the confirmed-reservation backstop runs under (Req 13).
func TestReconcileReservationsUC_RunsUnderADeadlineInsideTheTick(t *testing.T) {
	items := &fakeReconcileReserver{}
	before := time.Now()

	require.NoError(t, NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(context.Background()))

	require.Len(t, items.gotDeadlines, 1)
	deadline := items.gotDeadlines[0]
	require.False(t, deadline.IsZero(), "items is paged under a deadline")
	assert.False(t, deadline.After(before.Add(2*time.Minute).Add(time.Second)), "deadline %s is past two minutes", deadline)
}

// A pass whose context has ended reads no page, and says why once (Req 13).
func TestReconcileReservationsUC_PassContextEnded_ReadsNoPage(t *testing.T) {
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	items := &fakeReconcileReserver{stale: []*pb.StaleReservation{staleOf(uuid.New(), uuid.New())}}

	err := NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(ctx)

	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Empty(t, items.gotAfter)
	assert.Empty(t, items.cancelled)
}

// A pass that ends mid-page stops before its next row and never reads the next
// page; the error carries the reason once, rather than one failed write per row
// left (Req 13).
func TestReconcileReservationsUC_PassContextEndsMidPage_StopsBetweenRows(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	first, second := uuid.New(), uuid.New()
	items := &fakeReconcileReserver{
		pages: map[string]*pb.ListStaleReservedResponse{
			"":   {Reservations: []*pb.StaleReservation{staleOf(first, uuid.New()), staleOf(second, uuid.New())}, Next: "p2"},
			"p2": {Reservations: []*pb.StaleReservation{staleOf(uuid.New(), uuid.New())}},
		},
		onCancel: cancel,
	}

	err := NewReconcileReservationsUC(&fakeListingReader{}, items).Handle(ctx)

	assert.ErrorIs(t, err, context.Canceled)
	require.Len(t, items.cancelled, 1, "the row after the pass ended is left for the next tick")
	assert.Equal(t, first, items.cancelled[0].item)
	assert.Equal(t, []string{""}, items.gotAfter, "no page is read once the pass has ended")
}

// A pass context that ends while a row's call is in flight fails that call with
// the context's error. That is the pass stopping, not the row failing: the row
// is not logged as failed, and the pass reports the stop once, even when the row
// was the last of the last page (Req 13).
func TestReconcileReservationsUC_PassContextEndsDuringARowCall_ReportsTheStopOnceAndNoRowFailure(t *testing.T) {
	cases := []struct {
		name string
		live bool
		// arm sets the call that ends the pass while it is in flight
		arm func(reader *fakeListingReader, items *fakeReconcileReserver, end func())
	}{
		{
			name: "during the listing check",
			arm:  func(reader *fakeListingReader, _ *fakeReconcileReserver, end func()) { reader.during = end },
		},
		{
			name: "during the confirm",
			live: true,
			arm:  func(_ *fakeListingReader, items *fakeReconcileReserver, end func()) { items.duringConfirm = end },
		},
		{
			name: "during the cancel",
			arm:  func(_ *fakeListingReader, items *fakeReconcileReserver, end func()) { items.duringCancel = end },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			logs := captureErrorLogs(t)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			item, listing := uuid.New(), uuid.New()
			items := &fakeReconcileReserver{stale: []*pb.StaleReservation{staleOf(item, listing)}}
			reader := &fakeListingReader{live: map[uuid.UUID]bool{listing: tc.live}}
			tc.arm(reader, items, cancel)

			err := NewReconcileReservationsUC(reader, items).Handle(ctx)

			require.ErrorIs(t, err, context.Canceled, "the pass reports that it was stopped")
			assert.Equal(t, 1, strings.Count(err.Error(), context.Canceled.Error()), "reported once")
			assert.Empty(t, logs.String(), "the row cut short is not logged as a failed row")
			assert.Empty(t, items.cancelled)
			assert.Empty(t, items.confirmed)
		})
	}
}
