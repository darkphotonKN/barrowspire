package payment

import (
	"io"
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/payment"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	client PaymentClient
}

func NewHandler(client PaymentClient) *Handler {
	return &Handler{
		client: client,
	}
}

func (h *Handler) SetupSubscriptionHandler(c *gin.Context) {
	const op = "SetupSubscriptionHandler"
	var req pb.SetupSubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	resp, err := h.client.SetupSubscription(c.Request.Context(), &req)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Successfully setup subscription product",
		"result":     resp,
	})
}

func (h *Handler) GetUserSubscriptionsHandler(c *gin.Context) {
	const op = "GetUserSubscriptionsHandler"
	customerID := c.Param("customerId")
	if customerID == "" {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Customer ID is required"))
		return
	}

	resp, err := h.client.GetUserSubscriptions(c.Request.Context(), &pb.GetUserSubscriptionsRequest{
		CustomerId: customerID,
	})
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Successfully retrieved subscriptions",
		"result":     resp,
	})
}

// WebhookHandler reads the raw Stripe webhook body and forwards it to payment-service.
// Must NOT use ShouldBindJSON — Stripe signature is calculated from raw bytes.
func (h *Handler) WebhookHandler(c *gin.Context) {
	const op = "WebhookHandler"
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Failed to read request body"))
		return
	}

	signature := c.GetHeader("Stripe-Signature")
	if signature == "" {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Missing Stripe-Signature header"))
		return
	}

	resp, err := h.client.ProcessWebhook(c.Request.Context(), &pb.ProcessWebhookRequest{
		Payload:         payload,
		StripeSignature: signature,
	})
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Webhook processed",
		"result":     resp,
	})
}
