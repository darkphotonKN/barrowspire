package example

import (
	"fmt"
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/example"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	client ExampleClient
}

func NewHandler(client ExampleClient) *Handler {
	return &Handler{
		client: client,
	}
}

func (h *Handler) CreateExample(c *gin.Context) {
	var request *pb.CreateExampleRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		// Wrapped rather than passed through: the bind error names Go types and
		// offsets, which is diagnostic detail for us and noise (or worse) for a
		// client. Wrapping keeps it in the log and out of the body.
		httperr.Write(c, "CreateExample", fmt.Errorf("%w: %v", apperr.ErrValidation, err))
		return
	}

	example, err := h.client.CreateExample(c.Request.Context(), request)
	if err != nil {
		httperr.Write(c, "CreateExample", err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"statusCode": http.StatusOK, "message": "success", "result": example})
}

func (h *Handler) GetExample(c *gin.Context) {
	id := c.Param("id")

	// Convert REST request to gRPC request
	grpcReq := &pb.GetExampleRequest{
		Id: id,
	}

	// Call the service
	example, err := h.client.GetExample(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, "GetExample", err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"statusCode": http.StatusOK, "message": "success", "result": example})
}
