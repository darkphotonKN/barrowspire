package listing_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/listing"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	pbshared "github.com/darkphotonKN/barrowspire-server/common/api/proto/shared/v1"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func listMyBids(r *gin.Engine, query string) *httptest.ResponseRecorder {
	return testsupport.DoWithHeaders(r, http.MethodGet, "/api/marketplace/bids/mine"+query, "", authedHeaders())
}

// myBid is one of the caller's bids on a listing that ends at ends.
func myBid(bidID, listingID, itemID string, amount int64, bidStatus string, ends time.Time) *pb.MyBid {
	return &pb.MyBid{
		BidId:     bidID,
		ListingId: listingID,
		Amount:    amount,
		Status:    bidStatus,
		PlacedAt:  timestamppb.New(ends.Add(-time.Hour)),
		Listing: &pb.MyBidListing{
			Status: "ACTIVE",
			EndsAt: timestamppb.New(ends),
			ItemId: itemID,
		},
	}
}

// FS-EYQ8K §Requirements 1–7: the caller's bids, in marketplace's order, each
// with its listing summary and its item embedded, and the page's nextCursor.
func TestListMyBids_AnswersTheCallersBidsWithListingAndItem(t *testing.T) {
	ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
	leading := myBid("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222",
		"44444444-4444-4444-4444-444444444444", 120, "WINNING", ends)
	leading.Listing.CurrentPrice = proto.Int64(120)
	leading.Listing.BuyoutPrice = proto.Int64(500)
	// a second bid of the caller's on an auction that has ended unsettled;
	// items has no such instance, so it carries no item
	outbid := myBid("55555555-5555-5555-5555-555555555555", "66666666-6666-6666-6666-666666666666",
		"77777777-7777-7777-7777-777777777777", 80, "OUTBID", ends)
	outbid.Listing.Ended = true
	outbid.Listing.CurrentPrice = proto.Int64(95)

	client := &stubListingClient{myBids: &pb.ListMyBidsResponse{
		Bids:       []*pb.MyBid{leading, outbid},
		Pagination: &pbshared.PageInfo{NextCursor: "next-page"},
	}}
	items := &stubItemSummaries{byID: map[string]*pbitems.ItemSummary{
		"44444444-4444-4444-4444-444444444444": {
			Id: "44444444-4444-4444-4444-444444444444", Name: "Longsword", ItemType: "weapon", Rarity: "runed",
			ItemLevel: 1, RequiredLevel: 1,
		},
	}}

	w := listMyBids(newRouterWithItems(client, items), "?cursor=this-page&limit=2")

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{
		"bids": [
			{
				"bidId": "11111111-1111-1111-1111-111111111111",
				"listingId": "22222222-2222-2222-2222-222222222222",
				"amount": 120,
				"status": "WINNING",
				"placedAt": "2026-12-02T17:00:00Z",
				"listing": {
					"status": "ACTIVE",
					"endsAt": "2026-12-02T18:00:00Z",
					"ended": false,
					"currentPrice": 120,
					"buyoutPrice": 500
				},
				"item": {
					"id": "44444444-4444-4444-4444-444444444444",
					"name": "Longsword",
					"itemType": "weapon",
					"rarity": "runed",
					"itemLevel": 1,
					"requiredLevel": 1,
					"affixes": []
				}
			},
			{
				"bidId": "55555555-5555-5555-5555-555555555555",
				"listingId": "66666666-6666-6666-6666-666666666666",
				"amount": 80,
				"status": "OUTBID",
				"placedAt": "2026-12-02T17:00:00Z",
				"listing": {
					"status": "ACTIVE",
					"endsAt": "2026-12-02T18:00:00Z",
					"ended": true,
					"currentPrice": 95
				}
			}
		],
		"nextCursor": "next-page"
	}`, stripSchema(t, w.Body.Bytes()))

	require.Equal(t, 1, client.calls)
	assert.Equal(t, "this-page", client.gotMyBids.GetCursor())
	assert.Equal(t, int32(2), client.gotMyBids.GetLimit())
	// the bidder is taken from the token downstream, so it has to travel on
	assert.Equal(t, []string{"Bearer caller-token"}, client.gotAuth)

	require.Equal(t, 1, items.calls, "one summaries call for the whole page")
	assert.ElementsMatch(t, []string{
		"44444444-4444-4444-4444-444444444444",
		"77777777-7777-7777-7777-777777777777",
	}, items.gotIDs)
}

// FS-EYQ8K §Edge States "No bids": an empty list, no nextCursor, and no items
// call for nothing.
func TestListMyBids_NoBidsIsAnEmptyPage(t *testing.T) {
	client := &stubListingClient{}
	items := &stubItemSummaries{}

	w := listMyBids(newRouterWithItems(client, items), "")

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"bids":[]}`, stripSchema(t, w.Body.Bytes()))
	assert.Equal(t, int32(50), client.gotMyBids.GetLimit(), "an omitted limit takes the default")
	assert.Zero(t, items.calls)
}

// A bid marketplace sent without a required timestamp is a server fault. It
// must not reach the client as a believable 1970 date.
func TestListMyBids_MissingTimestampIsAServerError(t *testing.T) {
	ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
	noPlacedAt := myBid("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222",
		"44444444-4444-4444-4444-444444444444", 120, "WINNING", ends)
	noPlacedAt.PlacedAt = nil
	noEndsAt := myBid("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222",
		"44444444-4444-4444-4444-444444444444", 120, "WINNING", ends)
	noEndsAt.Listing.EndsAt = nil
	noListing := myBid("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222",
		"44444444-4444-4444-4444-444444444444", 120, "WINNING", ends)
	noListing.Listing = nil

	for name, bid := range map[string]*pb.MyBid{
		"no placedAt": noPlacedAt, "no endsAt": noEndsAt, "no listing": noListing,
	} {
		t.Run(name, func(t *testing.T) {
			client := &stubListingClient{myBids: &pb.ListMyBidsResponse{Bids: []*pb.MyBid{bid}}}

			w := listMyBids(newRouter(client), "")

			testsupport.AssertProblem(t, w, http.StatusInternalServerError, string(errcode.Internal))
			assert.NotContains(t, w.Body.String(), "1970")
		})
	}
}

func TestListMyBids_RejectsAnOutOfBoundsLimitBeforeCallingMarketplace(t *testing.T) {
	for _, limit := range []string{"0", "101", "lots"} {
		t.Run(limit, func(t *testing.T) {
			client := &stubListingClient{}

			w := listMyBids(newRouter(client), "?limit="+limit)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Zero(t, client.calls, "an invalid request must not reach marketplace")
		})
	}
}

// The cursor is opaque to the gateway: only marketplace can tell it is
// malformed, and its InvalidArgument surfaces through the seam as
// list-my-listings' does.
func TestListMyBids_MarketplaceRefusalsGoThroughTheSeam(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"malformed cursor", status.Error(codes.InvalidArgument, "malformed cursor"), http.StatusBadRequest, errcode.ValidationFailed},
		{"marketplace unreachable", status.Error(codes.Unavailable, "unavailable"), http.StatusServiceUnavailable, errcode.ServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			items := &stubItemSummaries{}

			w := listMyBids(newRouterWithItems(&stubListingClient{err: tt.err}, items), "?cursor=garbage")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
			assert.Zero(t, items.calls)
		})
	}
}

// FS-EYQ8K §Requirements 7 and §Edge States: as for listings, a page of bids is
// never answered without its items.
func TestListMyBids_AJoinFailureFailsTheWholePage(t *testing.T) {
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
		// an items Unauthenticated must never sign the caller out
		{"items refuses auth", status.Error(codes.Unauthenticated, "unauthenticated"), http.StatusInternalServerError, errcode.Internal, true},
		{"caller canceled", status.Error(codes.Canceled, "context canceled"), http.StatusInternalServerError, errcode.Internal, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
			client := &stubListingClient{myBids: &pb.ListMyBidsResponse{Bids: []*pb.MyBid{
				myBid("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222",
					"44444444-4444-4444-4444-444444444444", 120, "WINNING", ends),
			}}}

			w := listMyBids(newRouterWithItems(client, &stubItemSummaries{err: tt.err}), "")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
			assertPages(t, logs, tt.pages)
			assert.NotContains(t, w.Body.String(), "11111111-1111-1111-1111-111111111111", "no partial page")
		})
	}
}

// Without a caller it is 401, and neither marketplace nor items is called.
func TestListMyBids_RefusesAnUnauthenticatedCaller(t *testing.T) {
	client := &stubListingClient{}
	items := &stubItemSummaries{}

	r := gin.New()
	api := contract.New(r)
	listing.RegisterOperations(api, listing.NewHandler(client, items),
		contract.Protected(func(c *gin.Context) {}), // passes without embedding a caller
		contract.SeamError, contract.Secured)

	w := testsupport.Do(r, http.MethodGet, "/api/marketplace/bids/mine", "")

	testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
	assert.Zero(t, client.calls)
	assert.Zero(t, items.calls)
}
