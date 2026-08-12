package notification

import (
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	client NotificationClient
}

func NewHandler(client NotificationClient) *Handler {
	return &Handler{
		client: client,
	}
}

func (h *Handler) GetNotificationsByUserIDHandler(c *gin.Context) {
	const op = "GetNotificationsByUserIDHandler"
	// Get the user ID string from context (set by auth middleware)
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	// Create the gRPC request
	req := &pb.NotificationRequest{
		UserId: userIdStr.(string),
		// Limit and Offset are optional, can be added from query params if needed
	}

	// Call the notification service
	response, err := h.client.GetNotification(c.Request.Context(), req)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode":    http.StatusOK,
		"message":       "Successfully retrieved notifications",
		"notifications": response.Notifications,
		"total":         response.Total,
	})
}

func (h *Handler) MarkNotificationAsReadHandler(c *gin.Context) {
	const op = "MarkNotificationAsReadHandler"
	// 從 URL 參數取得 notification ID
	notificationID := c.Param("id")
	if notificationID == "" {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Notification ID is required"))
		return
	}

	// 從 auth middleware 取得 user_id
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	// 建立 gRPC request
	req := &pb.MarkNotificationAsReadRequest{
		NotificationId: notificationID,
		UserId:         userIdStr.(string),
	}

	// 呼叫 notification service
	response, err := h.client.MarkNotificationAsRead(c.Request.Context(), req)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"success":    response.Success,
		"message":    response.Message,
	})
}

func (h *Handler) MarkAllNotificationsAsReadHandler(c *gin.Context) {
	const op = "MarkAllNotificationsAsReadHandler"
	// 從 auth middleware 取得 user_id
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	// 建立 gRPC request
	req := &pb.MarkAllNotificationsAsReadRequest{
		UserId: userIdStr.(string),
	}

	// 呼叫 notification service
	response, err := h.client.MarkAllNotificationsAsRead(c.Request.Context(), req)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode":    http.StatusOK,
		"success":       response.Success,
		"message":       response.Message,
		"updated_count": response.UpdatedCount,
	})
}
