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

func (h *Handler) CreateCustomerHandler(c *gin.Context) {
	const op = "CreateCustomerHandler"
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	resp, err := h.client.CreateCustomer(c.Request.Context(), &pb.CreateCustomerRequest{
		UserId: userIdStr.(string),
		Email:  req.Email,
	})
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Successfully created customer",
		"result":     resp,
	})
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

func (h *Handler) SubscribeHandler(c *gin.Context) {
	const op = "SubscribeHandler"
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	var req struct {
		ProductID string `json:"product_id" binding:"required"`
		Email     string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	ctx := c.Request.Context()

	// Step 1: Auto-create Stripe customer
	custResp, err := h.client.CreateCustomer(ctx, &pb.CreateCustomerRequest{
		UserId: userIdStr.(string),
		Email:  req.Email,
	})
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	// Step 2: Subscribe with the customer ID
	resp, err := h.client.Subscribe(ctx, &pb.SubscribeRequest{
		ProductId:  req.ProductID,
		CustomerId: custResp.CustomerId,
	})
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Successfully subscribed",
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

func (h *Handler) CheckPermissionHandler(c *gin.Context) {
	const op = "CheckPermissionHandler"
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	resp, err := h.client.CheckPermission(c.Request.Context(), &pb.CheckPermissionRequest{
		UserId: userIdStr.(string),
	})
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode":     http.StatusOK,
		"message":        "Permission check successful",
		"has_permission": resp.HasPermission,
	})
}
