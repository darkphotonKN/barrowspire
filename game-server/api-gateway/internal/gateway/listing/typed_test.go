package listing_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/listing"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	pbshared "github.com/darkphotonKN/barrowspire-server/common/api/proto/shared/v1"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// stubListingClient records what reached marketplace, so a test can assert on
// the request the gateway actually built rather than on the HTTP input.
type stubListingClient struct {
	err error

	calls       int
	gotReq      *pb.PlaceBidRequest
	gotListReq  *pb.ListItemRequest
	gotWithdraw *pb.WithdrawBidRequest
	gotMine     *pb.ListMyListingsRequest
	gotAuth     []string

	mine *pb.ListMyListingsResponse
}

func (s *stubListingClient) ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error) {
	s.calls++
	s.gotListReq = req
	s.recordAuth(ctx)
	return &pb.ListItemResponse{}, s.err
}

func (s *stubListingClient) PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error) {
	s.calls++
	s.gotReq = req
	s.recordAuth(ctx)
	return &pb.PlaceBidResponse{}, s.err
}

func (s *stubListingClient) WithdrawBid(ctx context.Context, req *pb.WithdrawBidRequest) (*pb.WithdrawBidResponse, error) {
	s.calls++
	s.gotWithdraw = req
	s.recordAuth(ctx)
	return &pb.WithdrawBidResponse{}, s.err
}

func (s *stubListingClient) ListMyListings(ctx context.Context, req *pb.ListMyListingsRequest) (*pb.ListMyListingsResponse, error) {
	s.calls++
	s.gotMine = req
	s.recordAuth(ctx)
	if s.err != nil {
		return nil, s.err
	}
	if s.mine == nil {
		return &pb.ListMyListingsResponse{}, nil
	}
	return s.mine, nil
}

func (s *stubListingClient) recordAuth(ctx context.Context) {
	if md, ok := metadata.FromOutgoingContext(ctx); ok {
		s.gotAuth = md.Get("authorization")
	}
}

// embedding stands in for AuthMiddleware's success path: it embeds a caller on
// the request context and falls through.
func embedding(id commonauth.Identity) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request = c.Request.WithContext(commonauth.EmbedIdentity(c.Request.Context(), id))
	}
}

func newRouter(client listing.ListingClient) *gin.Engine {
	r := gin.New()
	api := contract.New(r)
	listing.RegisterOperations(api, listing.NewHandler(client),
		contract.Protected(embedding(commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RolePlayer})),
		contract.SeamError, contract.Secured)
	return r
}

func placeBid(r *gin.Engine, listingID string, body string, headers map[string]string) *http.Response {
	h := map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer caller-token",
	}
	for k, v := range headers {
		h[k] = v
	}
	return testsupport.DoWithHeaders(r, http.MethodPost, "/api/marketplace/listings/"+listingID+"/bids", body, h).Result()
}

func TestPlaceBid_ForwardsTheBidToMarketplace(t *testing.T) {
	client := &stubListingClient{}
	listingID := uuid.New().String()
	key := uuid.New().String()

	res := placeBid(newRouter(client), listingID, `{"amount":150}`, map[string]string{"Idempotency-Key": key})

	require.Equal(t, http.StatusCreated, res.StatusCode)
	require.Equal(t, 1, client.calls)
	assert.Equal(t, listingID, client.gotReq.GetListingId())
	assert.Equal(t, int64(150), client.gotReq.GetAmount())
	assert.Equal(t, key, client.gotReq.GetIdempotencyKey())
	// marketplace re-validates the caller from the token, so it has to travel on
	assert.Equal(t, []string{"Bearer caller-token"}, client.gotAuth)
}

// The key is optional: a caller without one still bids, just without replay
// protection — the same rule marketplace applies.
func TestPlaceBid_IdempotencyKeyIsOptional(t *testing.T) {
	client := &stubListingClient{}

	res := placeBid(newRouter(client), uuid.New().String(), `{"amount":150}`, nil)

	require.Equal(t, http.StatusCreated, res.StatusCode)
	require.Equal(t, 1, client.calls)
	assert.Empty(t, client.gotReq.GetIdempotencyKey())
}

func TestPlaceBid_RejectsInvalidInputBeforeCallingMarketplace(t *testing.T) {
	tests := []struct {
		name      string
		listingID string
		body      string
		headers   map[string]string
	}{
		{
			name:      "malformed idempotency key",
			listingID: uuid.New().String(),
			body:      `{"amount":150}`,
			headers:   map[string]string{"Idempotency-Key": "not-a-uuid"},
		},
		{
			name:      "non-positive amount",
			listingID: uuid.New().String(),
			body:      `{"amount":0}`,
		},
		{
			name:      "missing amount",
			listingID: uuid.New().String(),
			body:      `{}`,
		},
		{
			name:      "malformed listing id",
			listingID: "not-a-uuid",
			body:      `{"amount":150}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &stubListingClient{}

			res := placeBid(newRouter(client), tt.listingID, tt.body, tt.headers)

			assert.Equal(t, http.StatusUnprocessableEntity, res.StatusCode)
			assert.Zero(t, client.calls, "an invalid request must not reach marketplace")
		})
	}
}

// A bid below the current price is marketplace's InvalidArgument, and must
// surface through the seam as a problem+json the client can switch on.
func TestPlaceBid_BidTooLowIsABadRequest(t *testing.T) {
	client := &stubListingClient{err: status.Error(codes.InvalidArgument, "invalid argument")}
	r := newRouter(client)

	w := testsupport.DoWithHeaders(r, http.MethodPost, "/api/marketplace/listings/"+uuid.New().String()+"/bids",
		`{"amount":150}`, map[string]string{"Content-Type": "application/json", "Authorization": "Bearer caller-token"})

	testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.ValidationFailed))
}

// ========================= CREATE LISTING =========================

func authedHeaders() map[string]string {
	return map[string]string{
		"Content-Type":  "application/json",
		"Authorization": "Bearer caller-token",
	}
}

func createListing(r *gin.Engine, body string) *httptest.ResponseRecorder {
	return testsupport.DoWithHeaders(r, http.MethodPost, "/api/marketplace/listings", body, authedHeaders())
}

// The listing does not exist yet when the request returns: marketplace reserves
// the item and the listing is born from the ItemReserved event. So the answer
// is 202 with nothing to read back.
func TestCreateListing_IsAcceptedWithNoBodyAndForwardsTheTerms(t *testing.T) {
	client := &stubListingClient{}
	itemID := uuid.New().String()
	endsAt := time.Date(2026, 12, 1, 18, 30, 0, 0, time.UTC)

	w := createListing(newRouter(client),
		`{"itemId":"`+itemID+`","startPrice":250,"endsAt":"`+endsAt.Format(time.RFC3339)+`"}`)

	require.Equal(t, http.StatusAccepted, w.Code)
	assert.Empty(t, w.Body.String(), "an accepted listing has nothing to read back")
	require.Equal(t, 1, client.calls)
	assert.Equal(t, itemID, client.gotListReq.GetItemId())
	assert.Equal(t, int64(250), client.gotListReq.GetStartPrice())
	assert.True(t, endsAt.Equal(client.gotListReq.GetEndsAt().AsTime()))
	assert.Equal(t, []string{"Bearer caller-token"}, client.gotAuth)
}

func TestCreateListing_RejectsInvalidInputBeforeCallingMarketplace(t *testing.T) {
	itemID := uuid.New().String()
	endsAt := `"2026-12-01T18:30:00Z"`

	tests := []struct {
		name string
		body string
	}{
		{"non-positive start price", `{"itemId":"` + itemID + `","startPrice":0,"endsAt":` + endsAt + `}`},
		{"missing start price", `{"itemId":"` + itemID + `","endsAt":` + endsAt + `}`},
		{"missing item id", `{"startPrice":250,"endsAt":` + endsAt + `}`},
		{"malformed item id", `{"itemId":"not-a-uuid","startPrice":250,"endsAt":` + endsAt + `}`},
		{"missing end time", `{"itemId":"` + itemID + `","startPrice":250}`},
		{"malformed end time", `{"itemId":"` + itemID + `","startPrice":250,"endsAt":"tomorrow"}`},
		{"seller smuggled in the body", `{"itemId":"` + itemID + `","startPrice":250,"endsAt":` + endsAt + `,"sellerId":"` + uuid.New().String() + `"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &stubListingClient{}

			w := createListing(newRouter(client), tt.body)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Zero(t, client.calls, "an invalid request must not reach marketplace")
		})
	}
}

// Whether the end time is in the future is marketplace's rule, not the
// gateway's: its InvalidArgument surfaces through the seam.
func TestCreateListing_MarketplaceRefusalsGoThroughTheSeam(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"end time not in the future", status.Error(codes.InvalidArgument, "invalid argument"), http.StatusBadRequest, errcode.ValidationFailed},
		{"items-side refusal", status.Error(codes.Internal, "unhandled error"), http.StatusInternalServerError, errcode.Internal},
		{"marketplace unreachable", status.Error(codes.Unavailable, "unavailable"), http.StatusServiceUnavailable, errcode.ServiceUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &stubListingClient{err: tt.err}

			w := createListing(newRouter(client),
				`{"itemId":"`+uuid.New().String()+`","startPrice":250,"endsAt":"2026-12-01T18:30:00Z"}`)

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// ========================= WITHDRAW BID =========================

func withdrawBid(r *gin.Engine, listingID, bidID string) *httptest.ResponseRecorder {
	return testsupport.DoWithHeaders(r, http.MethodDelete,
		"/api/marketplace/listings/"+listingID+"/bids/"+bidID, "", authedHeaders())
}

func TestWithdrawBid_AnswersNoContentAndForwardsBothIDs(t *testing.T) {
	client := &stubListingClient{}
	listingID, bidID := uuid.New().String(), uuid.New().String()

	w := withdrawBid(newRouter(client), listingID, bidID)

	require.Equal(t, http.StatusNoContent, w.Code)
	assert.Empty(t, w.Body.String())
	require.Equal(t, 1, client.calls)
	assert.Equal(t, listingID, client.gotWithdraw.GetListingId())
	assert.Equal(t, bidID, client.gotWithdraw.GetBidId())
	// ownership is checked by marketplace against the token, so it must travel on
	assert.Equal(t, []string{"Bearer caller-token"}, client.gotAuth)
}

func TestWithdrawBid_RejectsMalformedIDsBeforeCallingMarketplace(t *testing.T) {
	tests := []struct {
		name      string
		listingID string
		bidID     string
	}{
		{"malformed listing id", "not-a-uuid", uuid.New().String()},
		{"malformed bid id", uuid.New().String(), "not-a-uuid"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &stubListingClient{}

			w := withdrawBid(newRouter(client), tt.listingID, tt.bidID)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Zero(t, client.calls, "an invalid request must not reach marketplace")
		})
	}
}

func TestWithdrawBid_MarketplaceRefusalsGoThroughTheSeam(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   errcode.Code
	}{
		{"another member's bid", status.Error(codes.PermissionDenied, "permission denied"), http.StatusForbidden, errcode.Forbidden},
		{"unknown bid", status.Error(codes.NotFound, "not found"), http.StatusNotFound, errcode.NotFound},
		{"bid not withdrawable", status.Error(codes.FailedPrecondition, "failed precondition"), http.StatusBadRequest, errcode.FailedPrecondition},
		{"contention", status.Error(codes.Aborted, "aborted"), http.StatusConflict, errcode.Conflict},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &stubListingClient{err: tt.err}

			w := withdrawBid(newRouter(client), uuid.New().String(), uuid.New().String())

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// ========================= LIST MY LISTINGS =========================

func listMyListings(r *gin.Engine, query string) *httptest.ResponseRecorder {
	return testsupport.DoWithHeaders(r, http.MethodGet, "/api/marketplace/listings/mine"+query, "", authedHeaders())
}

func TestListMyListings_AnswersThePageInTheDocumentedShape(t *testing.T) {
	sold := &pb.Listing{
		Id:         "11111111-1111-1111-1111-111111111111",
		SellerId:   "22222222-2222-2222-2222-222222222222",
		BuyerId:    proto.String("33333333-3333-3333-3333-333333333333"),
		ItemId:     "44444444-4444-4444-4444-444444444444",
		StartPrice: 100,
		SoldPrice:  proto.Int64(175),
		Status:     "SOLD",
		EndsAt:     timestamppb.New(time.Date(2026, 12, 1, 18, 0, 0, 0, time.UTC)),
		CreatedAt:  timestamppb.New(time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)),
		UpdatedAt:  timestamppb.New(time.Date(2026, 12, 1, 18, 5, 0, 0, time.UTC)),
	}
	active := &pb.Listing{
		Id:         "55555555-5555-5555-5555-555555555555",
		SellerId:   "22222222-2222-2222-2222-222222222222",
		ItemId:     "66666666-6666-6666-6666-666666666666",
		StartPrice: 250,
		Status:     "ACTIVE",
		EndsAt:     timestamppb.New(time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC)),
		CreatedAt:  timestamppb.New(time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)),
		UpdatedAt:  timestamppb.New(time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)),
	}
	client := &stubListingClient{mine: &pb.ListMyListingsResponse{
		Listings:   []*pb.Listing{sold, active},
		Pagination: &pbshared.PageInfo{NextCursor: "next-page"},
	}}

	w := listMyListings(newRouter(client), "?cursor=this-page&limit=2")

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{
		"listings": [
			{
				"id": "11111111-1111-1111-1111-111111111111",
				"itemId": "44444444-4444-4444-4444-444444444444",
				"sellerId": "22222222-2222-2222-2222-222222222222",
				"buyerId": "33333333-3333-3333-3333-333333333333",
				"startPrice": 100,
				"soldPrice": 175,
				"status": "SOLD",
				"endsAt": "2026-12-01T18:00:00Z",
				"createdAt": "2026-11-01T09:00:00Z",
				"updatedAt": "2026-12-01T18:05:00Z"
			},
			{
				"id": "55555555-5555-5555-5555-555555555555",
				"itemId": "66666666-6666-6666-6666-666666666666",
				"sellerId": "22222222-2222-2222-2222-222222222222",
				"startPrice": 250,
				"status": "ACTIVE",
				"endsAt": "2026-12-02T18:00:00Z",
				"createdAt": "2026-10-01T09:00:00Z",
				"updatedAt": "2026-10-01T09:00:00Z"
			}
		],
		"nextCursor": "next-page"
	}`, stripSchema(t, w.Body.Bytes()))

	require.Equal(t, 1, client.calls)
	assert.Equal(t, "this-page", client.gotMine.GetCursor())
	assert.Equal(t, int32(2), client.gotMine.GetLimit())
	// the seller is taken from the token downstream, so it has to travel on
	assert.Equal(t, []string{"Bearer caller-token"}, client.gotAuth)
}

// A member with nothing listed has an empty page, not a missing resource. The
// last page carries no nextCursor at all.
func TestListMyListings_NoListingsIsAnEmptyPage(t *testing.T) {
	client := &stubListingClient{}

	w := listMyListings(newRouter(client), "")

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"listings":[]}`, stripSchema(t, w.Body.Bytes()))
	assert.Equal(t, int32(50), client.gotMine.GetLimit(), "an omitted limit takes list-entries' default")
}

// A listing marketplace sent without a required timestamp is a server fault. It
// must not reach the client as a believable 1970 date.
func TestListMyListings_MissingTimestampIsAServerError(t *testing.T) {
	now := timestamppb.Now()
	client := &stubListingClient{mine: &pb.ListMyListingsResponse{
		Listings: []*pb.Listing{{
			Id:        uuid.NewString(),
			ItemId:    uuid.NewString(),
			SellerId:  uuid.NewString(),
			Status:    "ACTIVE",
			CreatedAt: now,
			UpdatedAt: now,
		}},
	}}

	w := listMyListings(newRouter(client), "")

	require.Equal(t, http.StatusInternalServerError, w.Code)
	assert.NotContains(t, w.Body.String(), "1970")
}

func TestListMyListings_RejectsAnOutOfBoundsLimitBeforeCallingMarketplace(t *testing.T) {
	for _, limit := range []string{"0", "101", "lots"} {
		t.Run(limit, func(t *testing.T) {
			client := &stubListingClient{}

			w := listMyListings(newRouter(client), "?limit="+limit)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Zero(t, client.calls, "an invalid request must not reach marketplace")
		})
	}
}

// The cursor is opaque to the gateway: only marketplace can tell it is
// malformed, and its InvalidArgument surfaces through the seam.
func TestListMyListings_MarketplaceRefusalsGoThroughTheSeam(t *testing.T) {
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
			client := &stubListingClient{err: tt.err}

			w := listMyListings(newRouter(client), "?cursor=garbage")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// stripSchema drops the $schema link huma adds to response bodies, so a test
// compares only the documented fields.
func stripSchema(t *testing.T, body []byte) string {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(body, &m))
	delete(m, "$schema")
	out, err := json.Marshal(m)
	require.NoError(t, err)
	return string(out)
}
