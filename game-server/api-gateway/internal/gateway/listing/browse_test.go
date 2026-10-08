package listing_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	pbshared "github.com/darkphotonKN/barrowspire-server/common/api/proto/shared/v1"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// stubItemSummaries answers the summaries it holds for whichever ids were asked
// for, the way items omits an unknown id.
type stubItemSummaries struct {
	byID map[string]*pbitems.ItemSummary
	err  error

	calls  int
	gotIDs []string
}

func (s *stubItemSummaries) GetItemSummaries(ctx context.Context, req *pbitems.GetItemSummariesRequest) (*pbitems.GetItemSummariesResponse, error) {
	s.calls++
	s.gotIDs = req.GetIds()
	if s.err != nil {
		return nil, s.err
	}
	res := &pbitems.GetItemSummariesResponse{}
	for _, id := range req.GetIds() {
		if summary, ok := s.byID[id]; ok {
			res.Summaries = append(res.Summaries, summary)
		}
	}
	return res, nil
}

// captureLogs routes the default logger into a buffer for the rest of the test,
// so a test can say which failures page someone (level=ERROR) and which do not.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	original := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(original) })
	return &buf
}

// assertPages checks whether a join failure was logged at ERROR. A caller that
// went away is not a fault of ours and must not page anyone.
func assertPages(t *testing.T, logs *bytes.Buffer, want bool) {
	t.Helper()
	if want {
		assert.Contains(t, logs.String(), "level=ERROR", "a join failure that is ours must page")
		return
	}
	assert.NotContains(t, logs.String(), "level=ERROR", "a caller that went away must not page anyone")
}

// browse sends no Authorization header: the page is for signed-out visitors.
func browse(r http.Handler, query string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/marketplace/listings"+query, nil)
	r.ServeHTTP(w, req)
	return w
}

func browsable(id, itemID string, ends time.Time) *pb.Listing {
	return &pb.Listing{
		Id:         id,
		SellerId:   "22222222-2222-2222-2222-222222222222",
		ItemId:     itemID,
		StartPrice: 50,
		Status:     "ACTIVE",
		EndsAt:     timestamppb.New(ends),
		CreatedAt:  timestamppb.New(ends.Add(-24 * time.Hour)),
		UpdatedAt:  timestamppb.New(ends.Add(-24 * time.Hour)),
		MinimumBid: 50,
	}
}

func TestBrowseListings_AnswersWithoutATokenAndEmbedsEachItem(t *testing.T) {
	ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
	withBid := browsable("11111111-1111-1111-1111-111111111111", "44444444-4444-4444-4444-444444444444", ends)
	withBid.CurrentPrice = proto.Int64(75)
	withBid.MinimumBid = 76
	withBid.BidCount = 2
	opening := browsable("55555555-5555-5555-5555-555555555555", "66666666-6666-6666-6666-666666666666", ends.Add(time.Hour))

	client := &stubListingClient{browse: &pb.BrowseListingsResponse{
		Listings:   []*pb.Listing{withBid, opening},
		Pagination: &pbshared.PageInfo{NextCursor: "next-page"},
	}}
	items := &stubItemSummaries{byID: map[string]*pbitems.ItemSummary{
		"44444444-4444-4444-4444-444444444444": {
			Id: "44444444-4444-4444-4444-444444444444", Name: "Longsword", ItemType: "weapon", Rarity: "runed",
			Description: proto.String("A notched blade"), WeaponType: proto.String("sword"),
			AttackPower: proto.Int32(12), CriticalRate: proto.Float64(0.25),
		},
		"66666666-6666-6666-6666-666666666666": {
			Id: "66666666-6666-6666-6666-666666666666", Name: "Iron Helm", ItemType: "armor", Rarity: "normal",
			ArmorSlot: proto.String("head"), DefenseRating: proto.Int32(4), MagicResistance: proto.Int32(0),
		},
	}}

	w := browse(newRouterWithItems(client, items), "?cursor=this-page&limit=2")

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
					"description": "A notched blade",
					"itemType": "weapon",
					"rarity": "runed",
					"weaponType": "sword",
					"attackPower": 12,
					"criticalRate": 0.25
				}
			},
			{
				"id": "55555555-5555-5555-5555-555555555555",
				"itemId": "66666666-6666-6666-6666-666666666666",
				"sellerId": "22222222-2222-2222-2222-222222222222",
				"startPrice": 50,
				"status": "ACTIVE",
				"endsAt": "2026-12-02T19:00:00Z",
				"createdAt": "2026-12-01T19:00:00Z",
				"updatedAt": "2026-12-01T19:00:00Z",
				"minimumBid": 50,
				"bidCount": 0,
				"ended": false,
				"item": {
					"id": "66666666-6666-6666-6666-666666666666",
					"name": "Iron Helm",
					"itemType": "armor",
					"rarity": "normal",
					"armorSlot": "head",
					"defenseRating": 4,
					"magicResistance": 0
				}
			}
		],
		"nextCursor": "next-page"
	}`, stripSchema(t, w.Body.Bytes()))

	require.Equal(t, 1, client.calls)
	assert.Equal(t, "this-page", client.gotBrowse.GetCursor())
	assert.Equal(t, int32(2), client.gotBrowse.GetLimit())
	assert.Empty(t, client.gotAuth, "a public read forwards no token")

	require.Equal(t, 1, items.calls, "one summaries call for the whole page")
	assert.ElementsMatch(t, []string{
		"44444444-4444-4444-4444-444444444444",
		"66666666-6666-6666-6666-666666666666",
	}, items.gotIDs)
}

// items omits an id it has no instance for; that one row renders without an
// item rather than failing the page.
func TestBrowseListings_AMissingSummaryLeavesItemAbsent(t *testing.T) {
	ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
	client := &stubListingClient{browse: &pb.BrowseListingsResponse{
		Listings: []*pb.Listing{browsable("11111111-1111-1111-1111-111111111111", "44444444-4444-4444-4444-444444444444", ends)},
	}}

	w := browse(newRouterWithItems(client, &stubItemSummaries{}), "")

	require.Equal(t, http.StatusOK, w.Code)
	body := testsupport.Decode(t, w)
	listings := body["listings"].([]any)
	require.Len(t, listings, 1)
	assert.NotContains(t, listings[0].(map[string]any), "item")
}

// No listings, no summaries call: an empty page never touches items.
func TestBrowseListings_NoListingsIsAnEmptyPage(t *testing.T) {
	client := &stubListingClient{}
	items := &stubItemSummaries{}

	w := browse(newRouterWithItems(client, items), "")

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"listings":[]}`, stripSchema(t, w.Body.Bytes()))
	assert.Equal(t, int32(50), client.gotBrowse.GetLimit(), "an omitted limit takes the default")
	assert.Zero(t, items.calls)
}

// FS-8EGFA §Requirements 16: rows are never returned without their items. A
// join failure fails the request: 503 when items is unreachable, 500 otherwise
// — never items' own code, which would mislead (a 401 from items would sign the
// visitor out).
func TestBrowseListings_AJoinFailureFailsTheWholePage(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
		pages      bool
	}{
		{"items unavailable", status.Error(codes.Unavailable, "unavailable"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		{"items not dialable", errors.New("failed to connect to items service: no instances"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		{"items refuses the caller", status.Error(codes.Unauthenticated, "missing metadata"), http.StatusInternalServerError, errcode.Internal, true},
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
			client := &stubListingClient{browse: &pb.BrowseListingsResponse{
				Listings: []*pb.Listing{browsable("11111111-1111-1111-1111-111111111111", "44444444-4444-4444-4444-444444444444", ends)},
			}}

			w := browse(newRouterWithItems(client, &stubItemSummaries{err: tt.err}), "")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
			assertPages(t, logs, tt.pages)
			assert.NotContains(t, w.Body.String(), "11111111-1111-1111-1111-111111111111", "no partial page")
		})
	}
}

func TestBrowseListings_RejectsAnOutOfBoundsLimitBeforeCallingMarketplace(t *testing.T) {
	for _, limit := range []string{"0", "101", "lots"} {
		t.Run(limit, func(t *testing.T) {
			client := &stubListingClient{}

			w := browse(newRouter(client), "?limit="+limit)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Zero(t, client.calls, "an invalid request must not reach marketplace")
		})
	}
}

// The cursor is opaque to the gateway: marketplace judges it, and its refusal
// comes back through the seam as list-my-listings' does.
func TestBrowseListings_MarketplaceRefusalsGoThroughTheSeam(t *testing.T) {
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

			w := browse(newRouterWithItems(&stubListingClient{err: tt.err}, items), "?cursor=garbage")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
			assert.Zero(t, items.calls)
		})
	}
}
