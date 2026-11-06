package itemreserver

import (
	"context"
	"errors"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// fakeClient records the request items-service would receive.
type fakeClient struct {
	ItemReserverClient
	gotReserve       *pb.ReserveItemRequest
	gotList          *pb.ListStaleReservedRequest
	gotCancel        *pb.CancelReservationRequest
	gotConfirm       *pb.ConfirmReservationRequest
	gotRelease       *pb.ReleaseConfirmedReservationRequest
	gotListConfirmed *pb.ListConfirmedReservationsRequest
	// reserveErr is what items-service answers ReserveItem with; nil reserves.
	reserveErr error
}

func (f *fakeClient) ListStaleReserved(ctx context.Context, req *pb.ListStaleReservedRequest) (*pb.ListStaleReservedResponse, error) {
	f.gotList = req
	return &pb.ListStaleReservedResponse{Next: "page-2"}, nil
}

func (f *fakeClient) CancelReservation(ctx context.Context, req *pb.CancelReservationRequest) (*pb.CancelReservationResponse, error) {
	f.gotCancel = req
	return &pb.CancelReservationResponse{}, nil
}

func (f *fakeClient) ConfirmReservation(ctx context.Context, req *pb.ConfirmReservationRequest) (*pb.ConfirmReservationResponse, error) {
	f.gotConfirm = req
	return &pb.ConfirmReservationResponse{}, nil
}

func (f *fakeClient) ReleaseConfirmedReservation(ctx context.Context, req *pb.ReleaseConfirmedReservationRequest) (*pb.ReleaseConfirmedReservationResponse, error) {
	f.gotRelease = req
	return &pb.ReleaseConfirmedReservationResponse{Released: true}, nil
}

func (f *fakeClient) ListConfirmedReservations(ctx context.Context, req *pb.ListConfirmedReservationsRequest) (*pb.ListConfirmedReservationsResponse, error) {
	f.gotListConfirmed = req
	return &pb.ListConfirmedReservationsResponse{Next: "page-2"}, nil
}

func (f *fakeClient) ReserveItem(ctx context.Context, req *pb.ReserveItemRequest) (*pb.ReserveItemResponse, error) {
	f.gotReserve = req
	if f.reserveErr != nil {
		return nil, f.reserveErr
	}
	return &pb.ReserveItemResponse{}, nil
}

// FS-HBXZN §Requirements B7–B9: items' answer is translated into what this
// service's error mapping reads, never into a worn check of its own.
func TestReserveItem_TranslatesItemsAnswer(t *testing.T) {
	tests := []struct {
		name        string
		itemsErr    error
		wantRefusal errcode.Code
		wantIs      error
	}{
		{"worn refusal", status.Convert(errcode.Refuse(errcode.ItemWorn)).Err(), errcode.ItemWorn, nil},
		{"not available refusal", status.Convert(errcode.Refuse(errcode.ItemNotAvailable)).Err(), errcode.ItemNotAvailable, nil},
		{"not in the stash refusal (FS-3R77D)", status.Convert(errcode.Refuse(errcode.ItemNotInStash)).Err(), errcode.ItemNotInStash, nil},
		{"not found", status.Error(codes.NotFound, "item not found"), "", commonconstants.ErrNotFound},
		{"unavailable", status.Error(codes.Unavailable, "down"), "", commonconstants.ErrTransient},
		{"deadline exceeded", status.Error(codes.DeadlineExceeded, "slow"), "", commonconstants.ErrTransient},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &fakeClient{reserveErr: tt.itemsErr}

			_, err := NewItemReserver(client).ReserveItem(memberCtx(), uuid.New(), 150, nil, time.Now().Add(time.Hour))

			require.Error(t, err)
			var refusal *errcode.Refusal
			if tt.wantRefusal != "" {
				require.ErrorAs(t, err, &refusal)
				assert.Equal(t, tt.wantRefusal, refusal.Code)
			} else {
				assert.False(t, errors.As(err, &refusal), "only a refusal may read as one")
			}
			if tt.wantIs != nil {
				assert.ErrorIs(t, err, tt.wantIs)
			}
		})
	}
}

// Anything items answers that is neither a refusal, not-found nor transient
// stays an unexpected failure: not a refusal, not not-found. It still names the
// item, so the Internal log line says which one failed.
func TestReserveItem_OtherItemsFailuresStayUnexpected(t *testing.T) {
	for _, itemsErr := range []error{
		status.Error(codes.Internal, "failed to reserve item"),
		// a FailedPrecondition with no registered reason is not a refusal to pass on
		status.Error(codes.FailedPrecondition, "no reason"),
	} {
		client := &fakeClient{reserveErr: itemsErr}
		itemID := uuid.New()

		_, err := NewItemReserver(client).ReserveItem(memberCtx(), itemID, 150, nil, time.Now().Add(time.Hour))

		require.Error(t, err)
		var refusal *errcode.Refusal
		assert.False(t, errors.As(err, &refusal))
		assert.NotErrorIs(t, err, commonconstants.ErrNotFound)
		assert.NotErrorIs(t, err, commonconstants.ErrTransient)
		assert.ErrorIs(t, err, itemsErr, "items' answer stays in the chain")
		assert.Contains(t, err.Error(), itemID.String())
	}
}

func memberCtx() context.Context {
	return metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)
}

func TestReserveItemRequestCarriesTheListingTerms(t *testing.T) {
	itemID := uuid.New()
	endsAt := time.Now().Add(24 * time.Hour)
	client := &fakeClient{}
	ctx := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)

	_, err := NewItemReserver(client).ReserveItem(ctx, itemID, 150, nil, endsAt)

	require.NoError(t, err)
	require.NotNil(t, client.gotReserve)
	assert.Equal(t, itemID.String(), client.gotReserve.GetItemId())
	assert.Equal(t, int64(150), client.gotReserve.GetStartPrice())
	require.NotNil(t, client.gotReserve.GetEndsAt(), "ends_at must be sent, or the event carries 1970-01-01")
	assert.True(t, endsAt.Equal(client.gotReserve.GetEndsAt().AsTime()))
	assert.Nil(t, client.gotReserve.BuyoutPrice, "no buyout must stay absent, not become 0")
}

func TestReserveItemRequestCarriesTheBuyoutPrice(t *testing.T) {
	client := &fakeClient{}
	ctx := metadata.NewIncomingContext(
		context.Background(),
		metadata.New(map[string]string{"authorization": "Bearer test-token"}),
	)
	buyout := 900

	_, err := NewItemReserver(client).ReserveItem(ctx, uuid.New(), 150, &buyout, time.Now().Add(time.Hour))

	require.NoError(t, err)
	require.NotNil(t, client.gotReserve.BuyoutPrice)
	assert.Equal(t, int64(900), client.gotReserve.GetBuyoutPrice())
}

// reconcilerCtx is the worker's context: a background ticker, no request and so
// no token to forward. The reconcile calls must go out without one.
func reconcilerCtx() context.Context {
	return context.Background()
}

// The reconciler sends an age, which items-service measures on its own clock,
// not a cutoff computed on this one, and the keyset position and page size it
// reads with; items' next comes back (FS-9BJCP Req 1).
func TestListStaleReservedRequestCarriesAgePositionAndLimit(t *testing.T) {
	client := &fakeClient{}

	res, err := NewItemReserver(client).ListStaleReserved(reconcilerCtx(), 10*time.Minute, "page-1", 100)

	require.NoError(t, err)
	assert.Equal(t, "page-2", res.GetNext())
	require.NotNil(t, client.gotList.GetOlderThan(), "a missing age would read as zero")
	assert.Equal(t, 10*time.Minute, client.gotList.GetOlderThan().AsDuration())
	assert.Equal(t, "page-1", client.gotList.GetAfter())
	assert.Equal(t, int32(100), client.gotList.GetLimit())
}

// Cancel and confirm both name the listing, so items-service fences the write to
// that one reservation.
func TestReservationWritesCarryItemAndListing(t *testing.T) {
	itemID, listingID := uuid.New(), uuid.New()
	client := &fakeClient{}
	reserver := NewItemReserver(client)

	_, err := reserver.CancelReservation(reconcilerCtx(), itemID, listingID)
	require.NoError(t, err)
	_, err = reserver.ConfirmReservation(reconcilerCtx(), itemID, listingID)
	require.NoError(t, err)

	assert.Equal(t, itemID.String(), client.gotCancel.GetItemId())
	assert.Equal(t, listingID.String(), client.gotCancel.GetListingId())
	assert.Equal(t, itemID.String(), client.gotConfirm.GetItemId())
	assert.Equal(t, listingID.String(), client.gotConfirm.GetListingId())
}

// Release names the listing too, so items-service releases only the confirmed
// reservation for that listing (FS-04ZB6 Req 4), and items' answer comes back.
func TestReleaseConfirmedReservationCarriesItemAndListing(t *testing.T) {
	itemID, listingID := uuid.New(), uuid.New()
	client := &fakeClient{}

	res, err := NewItemReserver(client).ReleaseConfirmedReservation(reconcilerCtx(), itemID, listingID)

	require.NoError(t, err)
	assert.True(t, res.GetReleased())
	assert.Equal(t, itemID.String(), client.gotRelease.GetItemId())
	assert.Equal(t, listingID.String(), client.gotRelease.GetListingId())
}

// The backstop sends an age, measured on items' clock like the stale list's, and
// the keyset position and page size it reads with (FS-04ZB6 Req 5, 12).
func TestListConfirmedReservationsRequestCarriesAgePositionAndLimit(t *testing.T) {
	client := &fakeClient{}

	res, err := NewItemReserver(client).ListConfirmedReservations(reconcilerCtx(), 10*time.Minute, "page-1", 100)

	require.NoError(t, err)
	assert.Equal(t, "page-2", res.GetNext())
	require.NotNil(t, client.gotListConfirmed.GetOlderThan(), "a missing age is refused by items")
	assert.Equal(t, 10*time.Minute, client.gotListConfirmed.GetOlderThan().AsDuration())
	assert.Equal(t, "page-1", client.gotListConfirmed.GetAfter())
	assert.Equal(t, int32(100), client.gotListConfirmed.GetLimit())
}
