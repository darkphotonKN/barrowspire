package payment_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/payment"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/payment"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

type stubPaymentClient struct {
	err     error
	webhook *pb.ProcessWebhookResponse
}

func (s *stubPaymentClient) ProcessWebhook(context.Context, *pb.ProcessWebhookRequest) (*pb.ProcessWebhookResponse, error) {
	return s.webhook, s.err
}

// newRouter mounts the webhook exactly as routes.go does: at the root, outside
// any auth group. It is the only payment route the gateway serves (FS-RG1B4).
func newRouter(client payment.PaymentClient) *gin.Engine {
	r := gin.New()
	h := payment.NewHandler(client)
	r.POST("/webhook/stripe", h.WebhookHandler)
	return r
}

// STRIPE STATUS PARITY (FS-22WKC §Requirements 11, I-22WKC-6).
//
// This package already had a shared handleGrpcError, so it is the one package
// that mapped consistently — and it already sent Unavailable to 503, which is
// why FS-22WKC §Requirements 5 was amended rather than followed.
//
// Three codes DO move, all of them from the old default arm. Every one moves
// non-2xx to non-2xx, and Stripe's retry behavior keys on 2xx-vs-not, so its
// handling is unchanged by construction. That is the argument this table
// records; the manual before/after in the PR body records the observation.
func TestWebhook_StatusParity_WithStripe(t *testing.T) {
	tests := []struct {
		name       string
		clientErr  error
		wantStatus int
		wantCode   errcode.Code
		moved      bool
	}{
		{
			name: "bad signature stays 400", clientErr: status.Error(codes.InvalidArgument, "signature mismatch"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "unknown event stays 404", clientErr: status.Error(codes.NotFound, "no such event type"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			name: "payment-service down stays 503", clientErr: status.Error(codes.Unavailable, "payment-service unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
		{
			name: "unmapped code stays 500", clientErr: status.Error(codes.Internal, "boom"),
			wantStatus: http.StatusInternalServerError, wantCode: errcode.Internal,
		},
		{
			name: "duplicate event 500 -> 409", clientErr: status.Error(codes.AlreadyExists, "event already processed"),
			wantStatus: http.StatusConflict, wantCode: errcode.AlreadyExists, moved: true,
		},
		{
			name: "rejected credential 500 -> 401", clientErr: status.Error(codes.Unauthenticated, "bad api key"),
			wantStatus: http.StatusUnauthorized, wantCode: errcode.Unauthenticated, moved: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRouter(&stubPaymentClient{err: tt.clientErr})

			// The signature header is REQUIRED for these cases to mean anything:
			// without it the handler's own guard answers 400 and the downstream
			// error is never reached, so an assertion of 400 would pass for the
			// wrong reason.
			w := testsupport.DoWithHeaders(r, http.MethodPost, "/webhook/stripe", `{"id":"evt_1"}`,
				map[string]string{"Stripe-Signature": "t=1,v1=abc"})

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))

			// The property Stripe actually depends on, asserted for every case
			// including the ones whose status moved.
			assert.True(t, w.Code < 200 || w.Code >= 300, "a failure must stay non-2xx or Stripe stops retrying")
		})
	}
}

// The webhook's own guards are the gateway's rules, so their wording is
// client-safe and survives. Stripe surfaces these strings in its dashboard when
// a delivery fails, which is the only place anyone debugging a webhook looks.
func TestWebhook_LocalGuards_KeepTheirWording(t *testing.T) {
	r := newRouter(&stubPaymentClient{})

	w := testsupport.Do(r, http.MethodPost, "/webhook/stripe", `{"id":"evt_1"}`)

	body := testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.ValidationFailed))
	assert.Equal(t, "Missing Stripe-Signature header", body["detail"])
}

func TestWebhook_WithSignature_ReachesDownstream(t *testing.T) {
	r := newRouter(&stubPaymentClient{webhook: &pb.ProcessWebhookResponse{}})

	w := testsupport.DoWithHeaders(r, http.MethodPost, "/webhook/stripe", `{"id":"evt_1"}`,
		map[string]string{"Stripe-Signature": "t=1,v1=abc"})

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, float64(http.StatusOK), testsupport.Decode(t, w)["statusCode"])
}

// FS-22WKC §Requirements 9: payment messages are the most sensitive in the
// gateway, since a downstream failure here can name a Stripe customer or a price id.
func TestWebhook_DownstreamMessages_NeverReachTheClient(t *testing.T) {
	const leak = "stripe: No such customer: 'cus_QXaBcDeFgHiJkL'"

	r := newRouter(&stubPaymentClient{err: status.Error(codes.NotFound, leak)})

	w := testsupport.DoWithHeaders(r, http.MethodPost, "/webhook/stripe", `{"id":"evt_1"}`,
		map[string]string{"Stripe-Signature": "t=1,v1=abc"})

	assert.NotContains(t, w.Body.String(), "cus_QXaBcDeFgHiJkL")
	assert.NotContains(t, w.Body.String(), "stripe:")
}
