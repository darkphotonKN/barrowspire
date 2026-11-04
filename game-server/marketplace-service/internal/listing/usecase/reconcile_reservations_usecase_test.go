package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type reservation struct{ item, listing uuid.UUID }

type fakeReconcileReserver struct {
	stale   []*pb.StaleReservation
	listErr error

	gotOlderThan time.Duration
	cancelled    []reservation
	confirmed    []reservation
}

func (f *fakeReconcileReserver) ListStaleReserved(ctx context.Context, olderThan time.Duration) (*pb.ListStaleReservedResponse, error) {
	f.gotOlderThan = olderThan
	if f.listErr != nil {
		return nil, f.listErr
	}
	return &pb.ListStaleReservedResponse{Reservations: f.stale}, nil
}

func (f *fakeReconcileReserver) CancelReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.CancelReservationResponse, error) {
	f.cancelled = append(f.cancelled, reservation{itemID, listingID})
	return &pb.CancelReservationResponse{}, nil
}

func (f *fakeReconcileReserver) ConfirmReservation(ctx context.Context, itemID, listingID uuid.UUID) (*pb.ConfirmReservationResponse, error) {
	f.confirmed = append(f.confirmed, reservation{itemID, listingID})
	return &pb.ConfirmReservationResponse{}, nil
}

type fakeListingReader struct {
	live map[uuid.UUID]bool
	err  error
}

func (f *fakeListingReader) HasLiveListing(ctx context.Context, itemID uuid.UUID) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return f.live[itemID], nil
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
	listings := &fakeListingReader{live: map[uuid.UUID]bool{item: true}}

	require.NoError(t, NewReconcileReservationsUC(listings, items).Handle(context.Background()))

	assert.Equal(t, []reservation{{item, listing}}, items.confirmed)
	assert.Empty(t, items.cancelled)
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
