package auth

import (
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
)

type Handler struct {
	client AuthClient
}

func NewHandler(client AuthClient) *Handler {
	return &Handler{
		client: client,
	}
}

type Signup struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) CreateMemberHandler(c *gin.Context) {
	const op = "CreateMemberHandler"
	ctx := c.Request.Context()
	ctx, span := tracer.Start(ctx, "service.CreateMember")
	defer span.End()
	var req pb.CreateMemberRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	member, err := h.client.CreateMember(ctx, &req)
	if err != nil {
		httperr.Write(c, "CreateMember", err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Successfully created user",
		"result":     member,
	})
}

var tracer = otel.Tracer("api-gateway")

func (h *Handler) LoginMemberHandler(c *gin.Context) {
	const op = "LoginMemberHandler"
	ctx := c.Request.Context()
	ctx, span := tracer.Start(ctx, "service.LoginMember")
	defer span.End()
	span.AddEvent("start bind json")
	var req pb.LoginRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}
	span.AddEvent("before grpc call")
	response, err := h.client.LoginMember(ctx, &req)
	span.AddEvent("after grpc call")
	if err != nil {
		httperr.Write(c, "LoginMember", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Successfully logged in",
		"result":     response,
	})
}

func (h *Handler) ValidateTokenHandler(c *gin.Context) {
	const op = "ValidateTokenHandler"
	var req pb.ValidateTokenRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	response, err := h.client.ValidateToken(c.Request.Context(), &req)
	if err != nil {
		httperr.Write(c, "ValidateToken", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"valid":      response.Valid,
		"memberId":   response.MemberId,
	})
}
