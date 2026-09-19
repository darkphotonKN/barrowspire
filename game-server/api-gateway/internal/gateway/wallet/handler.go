package wallet

import (
	"context"
	"net/http"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Handler struct {
	client WalletClient
}

func NewHandler(client WalletClient) *Handler {
	return &Handler{
		client: client,
	}
}

// goldRequest is the body shared by deposit and withdraw. The account is never
// named: it is derived from the authenticated member downstream, so a caller
// can only ever move their own gold.
type goldRequest struct {
	Gold int64 `json:"gold" binding:"required,gt=0"`
}

func (h *Handler) CreateAccountHandler(c *gin.Context) {
	res, err := h.client.CreateAccount(h.ctx(c), &pb.CreateAccountRequest{})
	if err != nil {
		respondWithGRPCError(c, err)
		return
	}

	c.JSON(http.StatusCreated, res)
}

func (h *Handler) GetAccountHandler(c *gin.Context) {
	res, err := h.client.GetAccount(h.ctx(c), &pb.GetAccountRequest{})
	if err != nil {
		respondWithGRPCError(c, err)
		return
	}

	c.JSON(http.StatusOK, res)
}

func (h *Handler) DepositHandler(c *gin.Context) {
	var req goldRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "gold must be a positive amount"})
		return
	}

	res, err := h.client.Deposit(h.ctx(c), &pb.DepositRequest{Gold: req.Gold})
	if err != nil {
		respondWithGRPCError(c, err)
		return
	}

	c.JSON(http.StatusOK, res)
}

func (h *Handler) WithdrawHandler(c *gin.Context) {
	var req goldRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "gold must be a positive amount"})
		return
	}

	res, err := h.client.Withdraw(h.ctx(c), &pb.WithdrawRequest{Gold: req.Gold})
	if err != nil {
		respondWithGRPCError(c, err)
		return
	}

	c.JSON(http.StatusOK, res)
}

// ctx threads the caller's bearer token onto the request context so the client
// can forward it as gRPC metadata. AuthMiddleware has already validated the
// token; this only carries it onward.
func (h *Handler) ctx(c *gin.Context) context.Context {
	return WithBearer(c.Request.Context(), c.GetHeader("Authorization"))
}

// respondWithGRPCError translates a downstream status into an HTTP response,
// keeping wallet's own error vocabulary out of the client's view.
func respondWithGRPCError(c *gin.Context, err error) {
	st, ok := status.FromError(err)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	switch st.Code() {
	case codes.Unauthenticated:
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
	case codes.NotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
	case codes.AlreadyExists:
		c.JSON(http.StatusConflict, gin.H{"error": "account already exists"})
	case codes.InvalidArgument:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
	// wallet returns FailedPrecondition when a withdrawal exceeds available gold
	case codes.FailedPrecondition:
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "insufficient available gold"})
	// OCC lost the race after its retries; the caller may safely try again
	case codes.Aborted:
		c.JSON(http.StatusConflict, gin.H{"error": "concurrent update, please retry"})
	case codes.Unavailable:
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "wallet service unavailable"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}
