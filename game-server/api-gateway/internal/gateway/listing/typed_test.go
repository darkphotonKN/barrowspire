package listing_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/listing"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
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
	gotAuth     []string
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
