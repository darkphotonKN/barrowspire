package config

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/mailbox"
	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/notification"
	"google.golang.org/grpc"
)

// tokenlessMethods are notification's original methods. They take the member
// in the request and the gateway calls them without forwarding a token, so
// they keep running without one. Every other method, the mailbox's first
// (FS-1GZGD R10, R11), reads its caller from the forwarded token.
var tokenlessMethods = map[string]bool{
	pb.NotificationService_GetNotification_FullMethodName:            true,
	pb.NotificationService_MarkNotificationAsRead_FullMethodName:     true,
	pb.NotificationService_MarkAllNotificationsAsRead_FullMethodName: true,
}

// authenticate is common/auth's token check for every method but the
// tokenless ones.
func authenticate(validate func(token string) (commonauth.Identity, error)) grpc.UnaryServerInterceptor {
	guard := commonauth.Auth(validate)
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if tokenlessMethods[info.FullMethod] {
			return handler(ctx, req)
		}
		return guard(ctx, req, info, handler)
	}
}

// notificationServer is the one NotificationService implementation: the
// notification methods and the mailbox methods side by side. The notification
// handler embeds the generated Unimplemented server, so a method neither
// defines (ClaimLetter until I-1GZGD-4) answers Unimplemented.
type notificationServer struct {
	*notificationMethods
	*mailboxMethods
}

// Aliases only to name the two embedded handlers apart.
type (
	notificationMethods = notification.Handler
	mailboxMethods      = mailbox.Handler
)

var _ pb.NotificationServiceServer = notificationServer{}

func newNotificationServer(n *notification.Handler, m *mailbox.Handler) notificationServer {
	return notificationServer{notificationMethods: n, mailboxMethods: m}
}
