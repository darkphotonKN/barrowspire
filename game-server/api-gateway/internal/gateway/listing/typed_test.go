package listing_test

import (
	"context"
	"net/http"
	"testing"

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

	calls   int
	gotReq  *pb.PlaceBidRequest
	gotAuth []string
}

func (s *stubListingClient) ListItem(context.Context, *pb.ListItemRequest) (*pb.ListItemResponse, error) {
	return nil, nil
}

func (s *stubListingClient) PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error) {
	s.calls++
	s.gotReq = req
	if md, ok := metadata.FromOutgoingContext(ctx); ok {
		s.gotAuth = md.Get("authorization")
	}
	return &pb.PlaceBidResponse{}, s.err
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
