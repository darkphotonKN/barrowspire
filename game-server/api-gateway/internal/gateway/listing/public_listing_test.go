package listing_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/listing"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

// FS-GKHYD §Requirements 1–4: the public reads never carry a member id or a
// sold price, and always say whether the listing is the caller's.

var memberFields = []string{"sellerId", "buyerId", "soldPrice"}

// settled is a listing as marketplace answers it once sold: every member fact
// present, so a test can prove the gateway drops them.
func settled(id, itemID, listingStatus string, own bool) *pb.Listing {
	l := browsable(id, itemID, time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC))
	l.Status = listingStatus
	l.BuyerId = proto.String("33333333-3333-3333-3333-333333333333")
	l.SoldPrice = proto.Int64(175)
	l.Own = own
	return l
}

func assertPublic(t *testing.T, listing map[string]any, wantOwn bool) {
	t.Helper()
	for _, f := range memberFields {
		assert.NotContains(t, listing, f, "a public read never carries %s", f)
	}
	assert.Equal(t, wantOwn, listing["own"], "own is always present and is marketplace's answer")
}

func TestBrowseListings_CarriesNoMemberIDsAndAlwaysOwn(t *testing.T) {
	client := &stubListingClient{browse: &pb.BrowseListingsResponse{Listings: []*pb.Listing{
		settled("11111111-1111-1111-1111-111111111111", "44444444-4444-4444-4444-444444444444", "ACTIVE", true),
		settled("55555555-5555-5555-5555-555555555555", "66666666-6666-6666-6666-666666666666", "ACTIVE", false),
	}}}

	w := browse(newRouter(client), "")

	require.Equal(t, http.StatusOK, w.Code)
	listings := testsupport.Decode(t, w)["listings"].([]any)
	require.Len(t, listings, 2)
	assertPublic(t, listings[0].(map[string]any), true)
	assertPublic(t, listings[1].(map[string]any), false)
	assert.NotContains(t, w.Body.String(), "22222222-2222-2222-2222-222222222222", "the seller's id appears nowhere")
	assert.NotContains(t, w.Body.String(), "33333333-3333-3333-3333-333333333333", "the buyer's id appears nowhere")
}

// Any status, settled ones included: no buyer, no sold price, no seller.
func TestGetListing_CarriesNoMemberIDsInAnyStatus(t *testing.T) {
	for _, st := range []string{"ACTIVE", "PENDING_SETTLEMENT", "SOLD", "CANCELLED", "EXPIRED", "SETTLEMENT_FAILED"} {
		for _, own := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/own=%v", st, own), func(t *testing.T) {
				client := &stubListingClient{one: settled(oneListingID, oneItemID, st, own)}

				w := getListing(newRouter(client), oneListingID)

				require.Equal(t, http.StatusOK, w.Code)
				assertPublic(t, testsupport.Decode(t, w), own)
				assert.NotContains(t, w.Body.String(), "22222222-2222-2222-2222-222222222222")
				assert.NotContains(t, w.Body.String(), "33333333-3333-3333-3333-333333333333")
			})
		}
	}
}

// FS-GKHYD §Requirements 11: the caller's Authorization travels to marketplace
// when there is one and is never invented when there is not. The gateway does
// not judge it: a token marketplace cannot validate is served anonymously
// there, so these routes answer 200 either way and never 401.
func TestPublicReads_ForwardTheCallersAuthorizationOnlyWhenPresent(t *testing.T) {
	ops := []struct {
		name string
		path string
		stub func() *stubListingClient
	}{
		{"browse-listings", "/api/marketplace/listings", func() *stubListingClient { return &stubListingClient{} }},
		{"get-listing", "/api/marketplace/listings/" + oneListingID, func() *stubListingClient {
			return &stubListingClient{one: settled(oneListingID, oneItemID, "ACTIVE", false)}
		}},
	}
	cases := []struct {
		name     string
		header   string
		wantAuth []string
	}{
		{"signed in", "Bearer caller-token", []string{"Bearer caller-token"}},
		{"expired or invalid token", "Bearer not-a-real-token", []string{"Bearer not-a-real-token"}},
		{"signed out", "", nil},
	}

	for _, op := range ops {
		for _, tc := range cases {
			t.Run(op.name+"/"+tc.name, func(t *testing.T) {
				client := op.stub()
				headers := map[string]string{}
				if tc.header != "" {
					headers["Authorization"] = tc.header
				}

				w := testsupport.DoWithHeaders(publicRouter(client), http.MethodGet, op.path, "", headers)

				require.Equal(t, http.StatusOK, w.Code, "a public read never refuses the caller")
				require.Equal(t, 1, client.calls)
				assert.Equal(t, tc.wantAuth, client.gotAuth)
			})
		}
	}
}

// FS-GKHYD Edge States (amended 2026-11-05): own makes the two public reads
// viewer-relative, so every answer says it varies by Authorization, and one
// read with a bearer is marked private: a shared cache must never hand a
// seller's own=true to anyone else.
func TestPublicReads_SayTheyVaryByAuthorization(t *testing.T) {
	ops := []struct {
		name   string
		path   string
		client func() *stubListingClient
	}{
		{"browse-listings", "/api/marketplace/listings", func() *stubListingClient { return &stubListingClient{} }},
		{"get-listing", "/api/marketplace/listings/" + oneListingID, func() *stubListingClient {
			return &stubListingClient{one: settled(oneListingID, oneItemID, "ACTIVE", false)}
		}},
	}
	cases := []struct {
		name             string
		header           string
		wantCacheControl string
	}{
		{"signed in", "Bearer caller-token", "private"},
		{"signed out", "", ""},
	}

	for _, op := range ops {
		for _, tc := range cases {
			t.Run(op.name+"/"+tc.name, func(t *testing.T) {
				headers := map[string]string{}
				if tc.header != "" {
					headers["Authorization"] = tc.header
				}

				// CORS sets Vary: Origin first in the real router; adding
				// Authorization must not replace it.
				r := gin.New()
				r.Use(func(c *gin.Context) { c.Header("Vary", "Origin") })
				listing.RegisterOperations(contract.New(r), listing.NewHandler(op.client(), &stubItemSummaries{}),
					contract.Protected(func(*gin.Context) {}), contract.SeamError, contract.Secured)

				w := testsupport.DoWithHeaders(r, http.MethodGet, op.path, "", headers)

				require.Equal(t, http.StatusOK, w.Code)
				assert.Equal(t, []string{"Origin", "Authorization"}, w.Header().Values("Vary"))
				assert.Equal(t, tc.wantCacheControl, w.Header().Get("Cache-Control"))
			})
		}
	}
}

// The item join asks items for public facts only: the caller's bearer, which
// the gateway forwards to marketplace, must never reach items on any read that
// joins items (typed.go embedItems), signed in or not.
func TestItemJoin_NeverForwardsTheCallersAuthorizationToItems(t *testing.T) {
	ends := time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)
	ops := []struct {
		name   string
		path   string
		client *stubListingClient
	}{
		{"browse-listings", "/api/marketplace/listings", &stubListingClient{browse: &pb.BrowseListingsResponse{
			Listings: []*pb.Listing{settled(oneListingID, oneItemID, "ACTIVE", true)},
		}}},
		{"get-listing", "/api/marketplace/listings/" + oneListingID, &stubListingClient{
			one: settled(oneListingID, oneItemID, "ACTIVE", true),
		}},
		{"list-my-bids", "/api/marketplace/bids/mine", &stubListingClient{myBids: &pb.ListMyBidsResponse{
			Bids: []*pb.MyBid{myBid("77777777-7777-7777-7777-777777777777", oneListingID, oneItemID, 60, "ACTIVE", ends)},
		}}},
	}

	for _, op := range ops {
		t.Run(op.name, func(t *testing.T) {
			items := &stubItemSummaries{}

			w := testsupport.DoWithHeaders(newRouterWithItems(op.client, items), http.MethodGet, op.path, "",
				map[string]string{"Authorization": "Bearer caller-token"})

			require.Equal(t, http.StatusOK, w.Code)
			require.Equal(t, []string{"Bearer caller-token"}, op.client.gotAuth, "marketplace gets the bearer")
			require.Equal(t, 1, items.calls, "the read joins items")
			assert.Empty(t, items.gotAuth, "items is never told who is asking")
		})
	}
}

// publicRouter registers the operations with a protect middleware that would
// refuse every request, so a public operation that ran it would answer 401.
func publicRouter(client listing.ListingClient) *gin.Engine {
	r := gin.New()
	api := contract.New(r)
	listing.RegisterOperations(api, listing.NewHandler(client, &stubItemSummaries{}),
		contract.Protected(func(c *gin.Context) {}), // passes without embedding a caller
		contract.SeamError, contract.Secured)
	return r
}

// The contract: the two public reads answer the public listing, which has no
// member fields and a required own, and declare no security; list-my-listings
// keeps the seller's shape with no own.
func TestPublicReads_ContractShape(t *testing.T) {
	api := contract.New(gin.New())
	listing.RegisterOperations(api, listing.NewHandler(&stubListingClient{}, &stubItemSummaries{}),
		contract.Protected(func(*gin.Context) {}), contract.SeamError, contract.Secured)
	doc := api.OpenAPI()

	browseOp := doc.Paths["/api/marketplace/listings"].Get
	getOp := doc.Paths["/api/marketplace/listings/{listing_id}"].Get
	mineOp := doc.Paths["/api/marketplace/listings/mine"].Get
	require.NotNil(t, browseOp)
	require.NotNil(t, getOp)
	require.NotNil(t, mineOp)

	for name, op := range map[string]*huma.Operation{"browse-listings": browseOp, "get-listing": getOp} {
		assert.Empty(t, op.Security, "%s stays public", name)
		assert.NotContains(t, op.Responses, "401", "%s never answers 401", name)
		for _, p := range op.Parameters {
			assert.NotEqual(t, "Authorization", p.Name, "%s does not document the forwarded header", name)
		}
	}

	public := resolve(t, doc, getOp.Responses["200"].Content["application/json"].Schema)
	page := resolve(t, doc, browseOp.Responses["200"].Content["application/json"].Schema)
	assert.Equal(t, public, resolve(t, doc, page.Properties["listings"].Items), "browse pages the public listing")
	for _, f := range memberFields {
		assert.NotContains(t, public.Properties, f)
	}
	require.Contains(t, public.Properties, "own")
	assert.Equal(t, "boolean", public.Properties["own"].Type)
	assert.Contains(t, public.Required, "own")

	mine := resolve(t, doc, resolve(t, doc, mineOp.Responses["200"].Content["application/json"].Schema).Properties["listings"].Items)
	for _, f := range memberFields {
		assert.Contains(t, mine.Properties, f, "list-my-listings keeps %s", f)
	}
	assert.NotContains(t, mine.Properties, "own")
}

func resolve(t *testing.T, doc *huma.OpenAPI, s *huma.Schema) *huma.Schema {
	t.Helper()
	require.NotNil(t, s)
	if s.Ref == "" {
		return s
	}
	out := doc.Components.Schemas.SchemaFromRef(s.Ref)
	require.NotNil(t, out, "schema %s is registered", s.Ref)
	return out
}

// A public listing missing a required timestamp is a server fault, as on the
// seller's own read: never a believable 1970 date.
func TestGetListing_MissingTimestampIsAServerError(t *testing.T) {
	l := settled(oneListingID, oneItemID, "ACTIVE", false)
	l.EndsAt = nil

	w := getListing(newRouter(&stubListingClient{one: l}), oneListingID)

	require.Equal(t, http.StatusInternalServerError, w.Code)
	assert.NotContains(t, w.Body.String(), "1970")
}
