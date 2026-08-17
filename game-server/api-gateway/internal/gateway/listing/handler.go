package listing

import (
	"io"
	"net/http"
	"strings"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"github.com/gin-gonic/gin"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
)

type Handler struct {
	client ListingClient
}

func NewHandler(client ListingClient) *Handler {
	return &Handler{
		client: client,
	}
}

func (h *Handler) CreateListingHandler(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(401, gin.H{"error": "missing authorization"})
		return
	}
	if !strings.HasPrefix(authHeader, "Bearer ") {
		c.JSON(401, gin.H{"error": "malformed authorization"})
		return
	}

	var req pb.ListItemRequest
	body, _ := io.ReadAll(c.Request.Body)
	if err := protojson.Unmarshal(body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"statusCode": http.StatusBadRequest,
			"message":    "Invalid request body",
			"error":      err.Error(),
		})
		return
	}

	ctx := metadata.AppendToOutgoingContext(
		c.Request.Context(),
		"authorization", authHeader,
	)

	listing, err := h.client.ListItem(ctx, &req)
	if err != nil {
		st, ok := status.FromError(err)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{
				"statusCode": http.StatusInternalServerError,
				"message":    "Listing service internal server error",
			})
			return
		}

		httpStatus := http.StatusInternalServerError
		switch st.Code() {
		case codes.InvalidArgument:
			httpStatus = http.StatusBadRequest
		case codes.AlreadyExists:
			httpStatus = http.StatusConflict
		}

		c.JSON(httpStatus, gin.H{
			"statusCode": httpStatus,
			"message":    st.Message(),
		})
		return
	}

	resp := ListItemResponse{
		ID:         listing.Id,
		SellerID:   listing.SellerId,
		StartPrice: listing.StartPrice,
		Status:     listing.Status,
		EndsAt:     listing.EndsAt.AsTime().Format(time.RFC3339),
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "List item successfully",
		"result":     resp,
	})
}
