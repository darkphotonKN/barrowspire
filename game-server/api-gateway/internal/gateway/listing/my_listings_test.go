package listing_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/listing"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

// FS-8EGFA §Requirements 14: my listings gain the item and the price facts,
// joined the same way browse joins them, and an ACTIVE listing past its end is
// reported ended rather than dropped.
func TestListMyListings_EmbedsEachItemAndCarriesThePriceFacts(t *testing.T) {
	ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
	withBid := browsable("11111111-1111-1111-1111-111111111111", "44444444-4444-4444-4444-444444444444", ends)
	withBid.CurrentPrice = proto.Int64(75)
	withBid.MinimumBid = 76
	withBid.BidCount = 2
	ended := browsable("55555555-5555-5555-5555-555555555555", "66666666-6666-6666-6666-666666666666", ends)
	ended.Ended = true

	client := &stubListingClient{mine: &pb.ListMyListingsResponse{Listings: []*pb.Listing{withBid, ended}}}
	items := &stubItemSummaries{byID: map[string]*pbitems.ItemSummary{
		"44444444-4444-4444-4444-444444444444": {
			Id: "44444444-4444-4444-4444-444444444444", Name: "Longsword", ItemType: "weapon", Rarity: "runed",
		},
	}}

	w := listMyListings(newRouterWithItems(client, items), "")

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{
		"listings": [
			{
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
				"ended": false,
				"item": {
					"id": "44444444-4444-4444-4444-444444444444",
					"name": "Longsword",
					"itemType": "weapon",
					"rarity": "runed"
				}
			},
			{
				"id": "55555555-5555-5555-5555-555555555555",
				"itemId": "66666666-6666-6666-6666-666666666666",
				"sellerId": "22222222-2222-2222-2222-222222222222",
				"startPrice": 50,
				"status": "ACTIVE",
				"endsAt": "2026-12-02T18:00:00Z",
				"createdAt": "2026-12-01T18:00:00Z",
				"updatedAt": "2026-12-01T18:00:00Z",
				"minimumBid": 50,
				"bidCount": 0,
				"ended": true
			}
		]
	}`, stripSchema(t, w.Body.Bytes()))

	require.Equal(t, 1, items.calls, "one summaries call for the whole page")
	assert.ElementsMatch(t, []string{
		"44444444-4444-4444-4444-444444444444",
		"66666666-6666-6666-6666-666666666666",
	}, items.gotIDs)
}

// FS-8EGFA §Requirements 16, as for browse: my listings are never answered
// without their items.
func TestListMyListings_AJoinFailureFailsTheWholePage(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
		pages      bool
	}{
		{"items unavailable", status.Error(codes.Unavailable, "unavailable"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		{"items errors", status.Error(codes.Internal, "boom"), http.StatusInternalServerError, errcode.Internal, true},
		{"items timed out", status.Error(codes.DeadlineExceeded, "context deadline exceeded"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		// the caller went away: passed through as Canceled, which the seam
		// renders as 500 to a client that is no longer listening
		{"caller canceled", status.Error(codes.Canceled, "context canceled"), http.StatusInternalServerError, errcode.Internal, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
			client := &stubListingClient{mine: &pb.ListMyListingsResponse{
				Listings: []*pb.Listing{browsable("11111111-1111-1111-1111-111111111111", "44444444-4444-4444-4444-444444444444", ends)},
			}}

			w := listMyListings(newRouterWithItems(client, &stubItemSummaries{err: tt.err}), "")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
			assertPages(t, logs, tt.pages)
			assert.NotContains(t, w.Body.String(), "11111111-1111-1111-1111-111111111111", "no partial page")
		})
	}
}

// The enrichment changes nothing about who may ask: without a caller it is
// still 401, and neither marketplace nor items is called.
func TestListMyListings_StillRefusesAnUnauthenticatedCaller(t *testing.T) {
	client := &stubListingClient{}
	items := &stubItemSummaries{}

	r := gin.New()
	api := contract.New(r)
	listing.RegisterOperations(api, listing.NewHandler(client, items),
		contract.Protected(func(c *gin.Context) {}), // passes without embedding a caller
		contract.SeamError, contract.Secured)

	w := testsupport.Do(r, http.MethodGet, "/api/marketplace/listings/mine", "")

	testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
	assert.Zero(t, client.calls)
	assert.Zero(t, items.calls)
}
