package character

import (
	"net/http"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Handler struct {
	client CharacterClient
}

func NewHandler(client CharacterClient) *Handler {
	return &Handler{
		client: client,
	}
}

func (h *Handler) CreateCharacterAmqpHandler(c *gin.Context) {
	ctx := c.Request.Context()
	ctx, span := tracer.Start(ctx, "service.CreateMember")
	defer span.End()
	var req pb.CreateCharacterRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"statusCode": http.StatusBadRequest, "message": "Error parsing payload as JSON"})
		return
	}

	_, err := h.client.CreateCharacter(ctx, &req)
	if err != nil {
		status, ok := status.FromError(err)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{
				"statusCode": http.StatusInternalServerError,
				"message":    "Internal server error",
			})
			return
		}

		httpStatus := http.StatusInternalServerError
		switch status.Code() {
		case codes.InvalidArgument:
			httpStatus = http.StatusBadRequest
		case codes.AlreadyExists:
			httpStatus = http.StatusConflict
		}

		c.JSON(httpStatus, gin.H{
			"statusCode": httpStatus,
			"message":    status.Message(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Successfully created user",
		// "result":     member,
	})
}

var tracer = otel.Tracer("api-gateway")

func (h *Handler) CreateCharacterHandler(c *gin.Context) {
	ctx := c.Request.Context()
	ctx, span := tracer.Start(ctx, "service.CreateCharacter")
	defer span.End()
	var req pb.CreateCharacterRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"statusCode": http.StatusBadRequest, "message": "Error parsing payload as JSON"})
		return
	}

	character, err := h.client.CreateCharacter(ctx, &req)
	if err != nil {
		status, ok := status.FromError(err)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{
				"statusCode": http.StatusInternalServerError,
				"message":    "Internal server error",
			})
			return
		}

		httpStatus := http.StatusInternalServerError
		switch status.Code() {
		case codes.InvalidArgument:
			httpStatus = http.StatusBadRequest
		case codes.AlreadyExists:
			httpStatus = http.StatusConflict
		}

		c.JSON(httpStatus, gin.H{
			"statusCode": httpStatus,
			"message":    status.Message(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Successfully created character",
		"result":     character,
	})
}
