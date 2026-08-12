package notification_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/notification"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
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

type stubNotificationClient struct {
	err error

	notifications *pb.NotificationResponse
	markRead      *pb.MarkNotificationAsReadResponse
	markAllRead   *pb.MarkAllNotificationsAsReadResponse
}

func (s *stubNotificationClient) GetNotification(context.Context, *pb.NotificationRequest) (*pb.NotificationResponse, error) {
	return s.notifications, s.err
}

func (s *stubNotificationClient) MarkNotificationAsRead(context.Context, *pb.MarkNotificationAsReadRequest) (*pb.MarkNotificationAsReadResponse, error) {
	return s.markRead, s.err
}

func (s *stubNotificationClient) MarkAllNotificationsAsRead(context.Context, *pb.MarkAllNotificationsAsReadRequest) (*pb.MarkAllNotificationsAsReadResponse, error) {
	return s.markAllRead, s.err
}

const testIdentity = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

func newRouter(client notification.NotificationClient, identity string) *gin.Engine {
	r := gin.New()
	h := notification.NewHandler(client)

	g := r.Group("/notification")
	g.Use(func(c *gin.Context) {
		if identity != "" {
			c.Set("userIdStr", identity)
		}
		c.Next()
	})
	g.GET("/", h.GetNotificationsByUserIDHandler)
	g.PATCH("/:id/read", h.MarkNotificationAsReadHandler)
	g.PATCH("/read-all", h.MarkAllNotificationsAsReadHandler)

	return r
}

// FS-0001 §Requirements 4, 5, 7. Three switches here, each handling only
// NotFound and InvalidArgument.
func TestNotificationHandler_DownstreamFailures_ResolveThroughTheSeam(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		clientErr  error
		wantStatus int
		wantCode   errcode.Code
	}{
		{
			name: "list not found", method: http.MethodGet, path: "/notification/",
			clientErr:  status.Error(codes.NotFound, "no notifications"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			// CHANGED: no Unavailable arm — was 500. This is the endpoint the
			// issue named as most likely to meet a downstream that is simply not up.
			name: "list while downstream is down", method: http.MethodGet, path: "/notification/",
			clientErr:  status.Error(codes.Unavailable, "notification-service unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
		{
			// CHANGED: no PermissionDenied arm — was 500.
			name: "mark read on someone else's notification", method: http.MethodPatch, path: "/notification/n1/read",
			clientErr:  status.Error(codes.PermissionDenied, "not yours"),
			wantStatus: http.StatusForbidden, wantCode: errcode.Forbidden,
		},
		{
			name: "mark read not found", method: http.MethodPatch, path: "/notification/n1/read",
			clientErr:  status.Error(codes.NotFound, "no such notification"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			name: "mark all rejected", method: http.MethodPatch, path: "/notification/read-all",
			clientErr:  status.Error(codes.InvalidArgument, "bad user id"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			// CHANGED: was 500.
			name: "mark all while downstream is down", method: http.MethodPatch, path: "/notification/read-all",
			clientErr:  status.Error(codes.Unavailable, "notification-service unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRouter(&stubNotificationClient{err: tt.clientErr}, testIdentity)

			w := testsupport.Do(r, tt.method, tt.path, "")

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// Identity comes from the JWT middleware; its absence is a wiring fault. Status
// unchanged at 401 (§Requirements 12), now carrying a code.
func TestNotificationHandler_MissingIdentity_Returns401(t *testing.T) {
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/notification/"},
		{http.MethodPatch, "/notification/n1/read"},
		{http.MethodPatch, "/notification/read-all"},
	} {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			w := testsupport.Do(newRouter(&stubNotificationClient{}, ""), tc.method, tc.path, "")

			testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
		})
	}
}

// FS-0001 §Requirements 9.
func TestNotificationHandler_DownstreamMessages_NeverReachTheClient(t *testing.T) {
	const leak = "pq: relation \"notifications\" does not exist"

	r := newRouter(&stubNotificationClient{err: status.Error(codes.NotFound, leak)}, testIdentity)

	w := testsupport.Do(r, http.MethodGet, "/notification/", "")

	assert.NotContains(t, w.Body.String(), "notifications\"")
	assert.NotContains(t, w.Body.String(), "pq:")
}

// FS-0001 §Requirements 12.
func TestNotificationHandler_SuccessResponses_AreUnchanged(t *testing.T) {
	client := &stubNotificationClient{
		notifications: &pb.NotificationResponse{},
		markRead:      &pb.MarkNotificationAsReadResponse{},
		markAllRead:   &pb.MarkAllNotificationsAsReadResponse{},
	}

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/notification/"},
		{http.MethodPatch, "/notification/n1/read"},
		{http.MethodPatch, "/notification/read-all"},
	} {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			w := testsupport.Do(newRouter(client, testIdentity), tc.method, tc.path, "")

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
			assert.NotContains(t, testsupport.Decode(t, w), "code")
		})
	}
}
