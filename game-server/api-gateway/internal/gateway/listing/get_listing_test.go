package listing_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

const (
	oneListingID = "11111111-1111-1111-1111-111111111111"
	oneItemID    = "44444444-4444-4444-4444-444444444444"
)

// getListing sends no Authorization header: the read is public.
func getListing(r http.Handler, id string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/marketplace/listings/"+id, nil)
	r.ServeHTTP(w, req)
	return w
}

// FS-8EGFA §Requirements 13: one listing, any status, public, with its item
// joined. An ACTIVE listing past its end answers ended.
func TestGetListing_AnswersWithoutATokenAndEmbedsTheItem(t *testing.T) {
	ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
	one := browsable(oneListingID, oneItemID, ends)
	one.CurrentPrice = proto.Int64(75)
	one.MinimumBid = 76
	one.BidCount = 2
	one.Ended = true

	client := &stubListingClient{one: one}
	items := &stubItemSummaries{byID: map[string]*pbitems.ItemSummary{
		oneItemID: {Id: oneItemID, Name: "Longsword", ItemType: "weapon", Rarity: "runed"},
	}}

	w := getListing(newRouterWithItems(client, items), oneListingID)

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{
		"id": "11111111-1111-1111-1111-111111111111",
		"itemId": "44444444-4444-4444-4444-444444444444",
		"sellerId": "22222222-2222-2222-2222-222222222222",
		"startPrice": 50,
		"status": "ACTIVE",
		"endsAt": "2026-12-02T18:00:00Z",
		"createdAt": "2026-12-01T18:00:00Z",
		"updatedAt": "2026-12-01T18:00:00Z",
		"currentPrice": 75,
		"minimumBid": 76,
		"bidCount": 2,
		"ended": true,
		"item": {
			"id": "44444444-4444-4444-4444-444444444444",
			"name": "Longsword",
			"itemType": "weapon",
			"rarity": "runed"
		}
	}`, stripSchema(t, w.Body.Bytes()))

	require.Equal(t, 1, client.calls)
	assert.Equal(t, oneListingID, client.gotGet.GetListingId())
	assert.Empty(t, client.gotAuth, "a public read forwards no token")
	assert.Equal(t, []string{oneItemID}, items.gotIDs)
}

func TestGetListing_AMissingSummaryLeavesItemAbsent(t *testing.T) {
	client := &stubListingClient{one: browsable(oneListingID, oneItemID, time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC))}

	w := getListing(newRouterWithItems(client, &stubItemSummaries{}), oneListingID)

	require.Equal(t, http.StatusOK, w.Code)
	assert.NotContains(t, testsupport.Decode(t, w), "item")
}

func TestGetListing_RejectsANonUUIDBeforeCallingMarketplace(t *testing.T) {
	client := &stubListingClient{}

	w := getListing(newRouter(client), "not-a-uuid")

	testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
	assert.Zero(t, client.calls)
}

func TestGetListing_MarketplaceRefusalsGoThroughTheSeam(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"unknown id", status.Error(codes.NotFound, "not found"), http.StatusNotFound, errcode.NotFound},
		{"marketplace unreachable", status.Error(codes.Unavailable, "unavailable"), http.StatusServiceUnavailable, errcode.ServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			items := &stubItemSummaries{}

			w := getListing(newRouterWithItems(&stubListingClient{err: tt.err}, items), oneListingID)

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
			assert.Zero(t, items.calls)
		})
	}
}

// FS-8EGFA §Requirements 16: never answered without its item.
func TestGetListing_AJoinFailureFailsTheRequest(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
		pages      bool
	}{
		{"items unavailable", status.Error(codes.Unavailable, "unavailable"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		{"items not dialable", errors.New("failed to connect to items service"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		{"items errors", status.Error(codes.Internal, "boom"), http.StatusInternalServerError, errcode.Internal, true},
		{"items timed out", status.Error(codes.DeadlineExceeded, "context deadline exceeded"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		// the caller went away: passed through as Canceled, which the seam
		// renders as 500 to a client that is no longer listening
		{"caller canceled", status.Error(codes.Canceled, "context canceled"), http.StatusInternalServerError, errcode.Internal, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			client := &stubListingClient{one: browsable(oneListingID, oneItemID, time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC))}

			w := getListing(newRouterWithItems(client, &stubItemSummaries{err: tt.err}), oneListingID)

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
			assertPages(t, logs, tt.pages)
			assert.NotContains(t, w.Body.String(), oneListingID, "no partial answer")
		})
	}
}

// The static /listings/mine route must win over /listings/{listing_id}: "mine"
// is never taken for a listing id, and never answered as a public read.
func TestGetListing_DoesNotCaptureMine(t *testing.T) {
	client := &stubListingClient{}

	w := listMyListings(newRouter(client), "")

	require.Equal(t, http.StatusOK, w.Code)
	assert.NotNil(t, client.gotMine, "mine routed to list-my-listings")
	assert.Nil(t, client.gotGet, "mine was not read as a listing id")
}
