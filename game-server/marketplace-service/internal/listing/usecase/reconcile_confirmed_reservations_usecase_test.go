package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/marketplace-service/internal/listing/domain/listing"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeConfirmedReserver serves pages keyed by the position asked for: "" is the
// first page, and each page's next names the following one.
type fakeConfirmedReserver struct {
	pages   map[string]*pb.ListConfirmedReservationsResponse
	listErr map[string]error
	// releaseErr fails the release of these listing ids
	releaseErr map[uuid.UUID]error
	// notReleased answers released = false for these listing ids: the item moved
	// on between the page and the release
	notReleased map[uuid.UUID]bool

	gotOlderThan []time.Duration
	gotAfter     []string
	gotLimit     []int
	gotDeadlines []time.Time
	released     []reservation
	releaseCalls []reservation
}

// listCallCap ends a pass that never stops paging, so a test of a loop that
// should have stopped fails instead of hanging.
const listCallCap = 1000

func (f *fakeConfirmedReserver) ListConfirmedReservations(ctx context.Context, olderThan time.Duration, after string, limit int) (*pb.ListConfirmedReservationsResponse, error) {
	f.gotOlderThan = append(f.gotOlderThan, olderThan)
	f.gotAfter = append(f.gotAfter, after)
	f.gotLimit = append(f.gotLimit, limit)
	deadline, _ := ctx.Deadline()
	f.gotDeadlines = append(f.gotDeadlines, deadline)
	if len(f.gotAfter) > listCallCap {
		return nil, errors.New("test fake: the pass never stopped paging")
	}
	if err := f.listErr[after]; err != nil {
		return nil, err
	}
	if page, ok := f.pages[after]; ok {
		return page, nil
	}
	return &pb.ListConfirmedReservationsResponse{}, nil
}

func (f *fakeConfirmedReserver) ReleaseConfirmedReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ReleaseConfirmedReservationResponse, error) {
	f.releaseCalls = append(f.releaseCalls, reservation{itemID, listingID})
	if err := f.releaseErr[listingID]; err != nil {
		return nil, err
	}
	if f.notReleased[listingID] {
		return &pb.ReleaseConfirmedReservationResponse{Released: false}, nil
	}
	f.released = append(f.released, reservation{itemID, listingID})
	return &pb.ReleaseConfirmedReservationResponse{Released: true}, nil
}

// fakeListingStatusReader answers by listing id; an id missing from statuses has
// no listing at all. It records each lookup, one per page.
type fakeListingStatusReader struct {
	statuses map[uuid.UUID]listing.ListingStatus
	// a lookup asking for any failing id answers an error, as a failed query would
	failing map[uuid.UUID]bool

	lookups [][]uuid.UUID
}

func (f *fakeListingStatusReader) ListingStatuses(ctx context.Context, listingIDs []uuid.UUID) (map[uuid.UUID]listing.ListingStatus, error) {
	f.lookups = append(f.lookups, listingIDs)
	found := map[uuid.UUID]listing.ListingStatus{}
	for _, id := range listingIDs {
		if f.failing[id] {
			return nil, errors.New("db down")
		}
		if status, ok := f.statuses[id]; ok {
			found[id] = status
		}
	}
	return found, nil
}

func confirmedOf(item, listing uuid.UUID) *pb.ConfirmedReservation {
	return &pb.ConfirmedReservation{ItemId: item.String(), ListingId: listing.String()}
}

func onePage(rows ...*pb.ConfirmedReservation) map[string]*pb.ListConfirmedReservationsResponse {
	return map[string]*pb.ListConfirmedReservationsResponse{"": {Reservations: rows}}
}

// FS-04ZB6 Req 12: an item confirmed for a listing that was never created goes
// back to its seller, but only once the grace has passed on items' clock, so a
// consumer between its confirm and its insert is never raced.
func TestReconcileConfirmedReservationsUC_NoListing_ReleasesAfterTheGrace(t *testing.T) {
	item, listingID := uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{pages: onePage(confirmedOf(item, listingID))}

	require.NoError(t, NewReconcileConfirmedReservationsUC(&fakeListingStatusReader{}, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listingID}}, items.released)
	assert.Equal(t, []time.Duration{10 * time.Minute}, items.gotOlderThan, "the grace is sent as an age, never a cutoff from this clock")
}

// A listing that exists in any status means the item's listing was created; the
// backstop only ever frees an item whose listing was never created. A live one
// needs nothing; an ended one over a still-LISTED item (a failed ReturnItem, say)
// is stuck for another reason and is left for a human (FS-04ZB6 Req 12).
func TestReconcileConfirmedReservationsUC_ListingExists_NeverReleases(t *testing.T) {
	for _, status := range []listing.ListingStatus{
		listing.StatusActive,
		listing.StatusPendingSettlement,
		listing.StatusSold,
		listing.StatusExpired,
		listing.StatusCancelled,
		listing.StatusSettlementFailed,
	} {
		t.Run(string(status), func(t *testing.T) {
			item, listingID := uuid.New(), uuid.New()
			items := &fakeConfirmedReserver{pages: onePage(confirmedOf(item, listingID))}
			listings := &fakeListingStatusReader{statuses: map[uuid.UUID]listing.ListingStatus{listingID: status}}

			require.NoError(t, NewReconcileConfirmedReservationsUC(listings, items).Handle(context.Background()))

			assert.Empty(t, items.released)
		})
	}
}

// A row without both ids has no fenced release to make: it alone is skipped, and
// the rows after it are still handled.
func TestReconcileConfirmedReservationsUC_RowUnreadable_SkipsOnlyThatRow(t *testing.T) {
	item, listingID := uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{pages: onePage(
		&pb.ConfirmedReservation{ItemId: "nope", ListingId: uuid.NewString()},
		&pb.ConfirmedReservation{ItemId: uuid.NewString(), ListingId: ""},
		confirmedOf(item, listingID),
	)}
	listings := &fakeListingStatusReader{}

	require.NoError(t, NewReconcileConfirmedReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listingID}}, items.released)
	assert.Equal(t, [][]uuid.UUID{{listingID}}, listings.lookups, "only readable rows are looked up")
}

// Not knowing is not the same as no listing: a failed lookup must never free an
// item whose listing may exist. The page it was for is left for the next tick,
// and the pages after it are still handled.
func TestReconcileConfirmedReservationsUC_LookupFails_ReleasesNothingOnThatPageAndReadsOn(t *testing.T) {
	failing, item, listingID := uuid.New(), uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{pages: map[string]*pb.ListConfirmedReservationsResponse{
		"":       {Reservations: []*pb.ConfirmedReservation{confirmedOf(uuid.New(), failing), confirmedOf(uuid.New(), uuid.New())}, Next: "page-2"},
		"page-2": {Reservations: []*pb.ConfirmedReservation{confirmedOf(item, listingID)}},
	}}
	listings := &fakeListingStatusReader{failing: map[uuid.UUID]bool{failing: true}}

	require.NoError(t, NewReconcileConfirmedReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listingID}}, items.released)
}

// The listings are looked up once per page, never once per row.
func TestReconcileConfirmedReservationsUC_LooksUpEachPagesListingsInOneQuery(t *testing.T) {
	a, b, c := uuid.New(), uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{pages: map[string]*pb.ListConfirmedReservationsResponse{
		"":       {Reservations: []*pb.ConfirmedReservation{confirmedOf(uuid.New(), a), confirmedOf(uuid.New(), b)}, Next: "page-2"},
		"page-2": {Reservations: []*pb.ConfirmedReservation{confirmedOf(uuid.New(), c)}},
	}}
	listings := &fakeListingStatusReader{statuses: map[uuid.UUID]listing.ListingStatus{b: listing.StatusActive}}

	require.NoError(t, NewReconcileConfirmedReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, [][]uuid.UUID{{a, b}, {c}}, listings.lookups)
	assert.Len(t, items.released, 2, "a and c have no listing; b's is live")
}

// FS-04ZB6 Req 5, 12: each tick reads every page, so a full page of rows that
// keep failing or being skipped cannot starve the rows behind it. Each page is
// asked for after the previous page's position, and the read stops at the page
// with no next.
func TestReconcileConfirmedReservationsUC_ReadsEveryPagePastRowsThatFailOrAreSkipped(t *testing.T) {
	failing, ended := []*pb.ConfirmedReservation{}, map[uuid.UUID]listing.ListingStatus{}
	releaseFails := map[uuid.UUID]error{}
	for i := 0; i < confirmedReservationsPage; i++ {
		l := uuid.New()
		if i%2 == 0 {
			releaseFails[l] = errors.New("items down")
		} else {
			ended[l] = listing.StatusExpired
		}
		failing = append(failing, confirmedOf(uuid.New(), l))
	}
	item, listingID := uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{
		pages: map[string]*pb.ListConfirmedReservationsResponse{
			"":       {Reservations: failing, Next: "page-2"},
			"page-2": {Reservations: []*pb.ConfirmedReservation{confirmedOf(item, listingID)}},
		},
		releaseErr: releaseFails,
	}
	listings := &fakeListingStatusReader{statuses: ended}

	require.NoError(t, NewReconcileConfirmedReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listingID}}, items.released)
	assert.Equal(t, []string{"", "page-2"}, items.gotAfter)
	assert.Equal(t, []int{confirmedReservationsPage, confirmedReservationsPage}, items.gotLimit)
}

// A page that cannot be read ends the pass with the error; the rows already read
// were handled, and the next tick starts from the first page again.
func TestReconcileConfirmedReservationsUC_LaterPageFails_ReturnsTheErrorAfterHandlingEarlierRows(t *testing.T) {
	item, listingID := uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{
		pages: map[string]*pb.ListConfirmedReservationsResponse{
			"": {Reservations: []*pb.ConfirmedReservation{confirmedOf(item, listingID)}, Next: "page-2"},
		},
		listErr: map[string]error{"page-2": errors.New("items down")},
	}

	err := NewReconcileConfirmedReservationsUC(&fakeListingStatusReader{}, items).Handle(context.Background())

	assert.Error(t, err)
	assert.Equal(t, []reservation{{item, listingID}}, items.released)
}

// A release that fails is retried on the next tick; the rows after it are still
// released on this one.
func TestReconcileConfirmedReservationsUC_ReleaseFails_TheNextRowIsStillReleased(t *testing.T) {
	stuck, item, listingID := uuid.New(), uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{
		pages:      onePage(confirmedOf(uuid.New(), stuck), confirmedOf(item, listingID)),
		releaseErr: map[uuid.UUID]error{stuck: errors.New("items down")},
	}

	require.NoError(t, NewReconcileConfirmedReservationsUC(&fakeListingStatusReader{}, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listingID}}, items.released)
}

// A release that matches nothing (the item was sold on, released or relisted
// since the page was read) is logged and the pass moves on: the next row is
// still released.
func TestReconcileConfirmedReservationsUC_ReleaseMatchesNothing_TheNextRowIsStillReleased(t *testing.T) {
	movedOn, item, listingID := uuid.New(), uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{
		pages:       onePage(confirmedOf(uuid.New(), movedOn), confirmedOf(item, listingID)),
		notReleased: map[uuid.UUID]bool{movedOn: true},
	}

	require.NoError(t, NewReconcileConfirmedReservationsUC(&fakeListingStatusReader{}, items).Handle(context.Background()))

	assert.Len(t, items.releaseCalls, 2, "both rows are asked to release")
	assert.Equal(t, []reservation{{item, listingID}}, items.released)
}

// An items that answers the position it was just sent as next has made no
// progress: paging it again would spin the reconcile goroutine forever. The
// pass stops with an error after the rows it did read.
func TestReconcileConfirmedReservationsUC_NextEqualsTheCursorSent_StopsPaging(t *testing.T) {
	item, listingID := uuid.New(), uuid.New()
	items := &fakeConfirmedReserver{pages: map[string]*pb.ListConfirmedReservationsResponse{
		"":       {Next: "page-2"},
		"page-2": {Reservations: []*pb.ConfirmedReservation{confirmedOf(item, listingID)}, Next: "page-2"},
	}}

	err := NewReconcileConfirmedReservationsUC(&fakeListingStatusReader{}, items).Handle(context.Background())

	assert.Error(t, err)
	assert.Equal(t, []string{"", "page-2"}, items.gotAfter)
	assert.Equal(t, []reservation{{item, listingID}}, items.released, "the rows of the page read are still handled")
}

// The pass runs under its own deadline, well inside the reconcile tick, so an
// items that keeps answering new pages (or hangs) cannot hold the goroutine past
// the next tick's stale-reservation pass.
func TestReconcileConfirmedReservationsUC_RunsUnderADeadlineInsideTheTick(t *testing.T) {
	items := &fakeConfirmedReserver{pages: onePage()}
	before := time.Now()

	require.NoError(t, NewReconcileConfirmedReservationsUC(&fakeListingStatusReader{}, items).Handle(context.Background()))

	require.Len(t, items.gotDeadlines, 1)
	deadline := items.gotDeadlines[0]
	require.False(t, deadline.IsZero(), "items is paged under a deadline")
	assert.False(t, deadline.After(before.Add(reconcilePassTimeout).Add(time.Second)))
	assert.Less(t, reconcilePassTimeout, 5*time.Minute, "the deadline ends the pass before the next tick")
}

// A deadline that runs out between pages ends the pass with the deadline error;
// it never reads another page.
func TestReconcileConfirmedReservationsUC_DeadlinePassed_StopsPaging(t *testing.T) {
	items := &fakeConfirmedReserver{}
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()

	err := NewReconcileConfirmedReservationsUC(&fakeListingStatusReader{}, items).Handle(ctx)

	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Empty(t, items.gotAfter)
}
