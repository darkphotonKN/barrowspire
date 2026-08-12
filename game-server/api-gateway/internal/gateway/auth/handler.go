package auth

import (
	"log/slog"
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
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

func (h *Handler) CreateMemberAmqpHandler(c *gin.Context) {
	const op = "CreateMemberAmqpHandler"
	ctx := c.Request.Context()
	ctx, span := tracer.Start(ctx, "service.CreateMember")
	defer span.End()
	var req pb.CreateMemberRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	_, err := h.client.CreateMember(ctx, &req)
	if err != nil {
		httperr.Write(c, "CreateMemberAmqp", err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Successfully created user",
		// "result":     member,
	})
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

func (h *Handler) CheckEmailExistsHandler(c *gin.Context) {
	const op = "CheckEmailExistsHandler"
	email := c.Query("email")
	if email == "" {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Email query parameter is required"))
		return
	}

	req := &pb.CheckEmailRequest{Email: email}
	response, err := h.client.CheckEmailExists(c.Request.Context(), req)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"exists":     response.Exists,
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

func (h *Handler) GetMemberByIdHandler(c *gin.Context) {
	const op = "GetMemberByIdHandler"
	// Get the user ID string from context (set by auth middleware)
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	// Create the request
	req := &pb.GetMemberRequest{
		Id: userIdStr.(string),
	}

	// Call the service
	member, err := h.client.GetMember(c.Request.Context(), req)

	if err != nil {
		httperr.Write(c, "GetMemberById", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Successfully retrieved member",
		"result":     member,
	})
}

func (h *Handler) UpdatePasswordMemberHandler(c *gin.Context) {
	const op = "UpdatePasswordMemberHandler"
	var req pb.UpdatePasswordRequest

	// Get the user ID string from context (set by auth middleware)
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	// Set the ID from context
	req.Id = userIdStr.(string)

	response, err := h.client.UpdateMemberPassword(c.Request.Context(), &req)
	if err != nil {
		httperr.Write(c, "UpdatePasswordMember", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    response.Message,
		"success":    response.Success,
	})
}

func (h *Handler) UpdateInfoMemberHandler(c *gin.Context) {
	const op = "UpdateInfoMemberHandler"
	var req pb.UpdateMemberInfoRequest

	// Get the user ID string from context (set by auth middleware)
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	// Set the ID from context
	req.Id = userIdStr.(string)

	member, err := h.client.UpdateMemberInfo(c.Request.Context(), &req)
	if err != nil {
		httperr.Write(c, "UpdateInfoMember", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Successfully updated member info",
		"result":     member,
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

// RequestAvatarUploadRequest is the HTTP request body for avatar upload request
type RequestAvatarUploadRequest struct {
	Filename string `json:"filename" binding:"required"`
}

func (h *Handler) RequestAvatarUploadHandler(c *gin.Context) {
	const op = "RequestAvatarUploadHandler"
	slog.Debug("checking incoming avatar upload request", "request body", c.Request.Body)

	// Get the user ID string from context (set by auth middleware)
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	var req RequestAvatarUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	// Create gRPC request
	grpcReq := &pb.RequestAvatarUploadRequest{
		MemberId: userIdStr.(string),
		Filename: req.Filename,
	}

	response, err := h.client.RequestAvatarUpload(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, "RequestAvatarUpload", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Avatar upload request successful",
		"result":     response,
	})
}

// ConfirmAvatarUploadRequest is the HTTP request body for avatar upload confirmation
type ConfirmAvatarUploadRequest struct {
	UploadID string `json:"upload_id" binding:"required"`
}

func (h *Handler) ConfirmAvatarUploadHandler(c *gin.Context) {
	const op = "ConfirmAvatarUploadHandler"
	// Get the user ID string from context (set by auth middleware)
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	var req ConfirmAvatarUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	// Create gRPC request
	grpcReq := &pb.ConfirmAvatarUploadRequest{
		MemberId: userIdStr.(string),
		UploadId: req.UploadID,
	}

	response, err := h.client.ConfirmAvatarUpload(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, "ConfirmAvatarUpload", err)
		return
	}

	if !response.Success {
		// The downstream's own message is not client-safe (§Requirements 9), so it
		// is logged and replaced. Precision that used to live in this string now
		// belongs in a domain code — see §Edge States.
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Avatar upload could not be confirmed"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    response.Message,
		"success":    response.Success,
		"avatar_url": response.AvatarUrl,
	})
}
