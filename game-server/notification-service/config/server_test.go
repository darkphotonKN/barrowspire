package config

import (
	"context"
	"errors"
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/mailbox"
	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/notification"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

var admin = commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RoleAdmin}

func validate(token string) (commonauth.Identity, error) {
	if token == "good" {
		return admin, nil
	}
	return commonauth.Identity{}, errors.New("bad token")
}

// call runs the interceptor for method and reports the caller the handler saw.
func call(t *testing.T, ctx context.Context, method string) (commonauth.Identity, bool, error) {
	t.Helper()
	var (
		seen commonauth.Identity
		ok   bool
	)
	_, err := authenticate(validate)(ctx, nil, &grpc.UnaryServerInfo{FullMethod: method},
		func(ctx context.Context, _ any) (any, error) {
			seen, ok = commonauth.IdentityFromCtx(ctx)
			return nil, nil
		})
	return seen, ok, err
}

func withToken(token string) context.Context {
	return metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))
}

func TestAuthenticate_MailboxMethodsNeedAToken(t *testing.T) {
	methods := []string{
		pb.NotificationService_SendLetter_FullMethodName,
		pb.NotificationService_ListLetters_FullMethodName,
		pb.NotificationService_GetMailboxSummary_FullMethodName,
		pb.NotificationService_MarkLetterRead_FullMethodName,
		pb.NotificationService_ClaimLetter_FullMethodName,
	}
	for _, m := range methods {
		t.Run(m, func(t *testing.T) {
			_, _, err := call(t, context.Background(), m)
			assert.Equal(t, codes.Unauthenticated, status.Code(err))

			seen, ok, err := call(t, withToken("good"), m)
			require.NoError(t, err)
			require.True(t, ok)
			assert.Equal(t, admin, seen, "the token's identity rides into the handler")
		})
	}
}

// The original notification methods take the member in the request and the
// gateway calls them without a token; they stay as they were.
func TestAuthenticate_TheOriginalNotificationMethodsStayTokenless(t *testing.T) {
	for _, m := range []string{
		pb.NotificationService_GetNotification_FullMethodName,
		pb.NotificationService_MarkNotificationAsRead_FullMethodName,
		pb.NotificationService_MarkAllNotificationsAsRead_FullMethodName,
	} {
		_, _, err := call(t, context.Background(), m)
		assert.NoError(t, err, m)
	}
}

// A method nobody listed needs a token: the exemption is the list, not the
// default.
func TestAuthenticate_AnUnlistedMethodNeedsAToken(t *testing.T) {
	_, _, err := call(t, context.Background(), "/notification.NotificationService/SomethingNew")
	assert.Equal(t, codes.Unauthenticated, status.Code(err))
}

// Every mailbox method, ClaimLetter included (I-1GZGD-4), is the mailbox
// handler's: none falls through to the generated Unimplemented server.
func TestServer_TheMailboxMethodsAreServedByTheMailboxHandler(t *testing.T) {
	srv := newNotificationServer(notification.NewHandler(nil), mailbox.NewHandler(nil))
	ctx := context.Background()

	_, err := srv.ClaimLetter(ctx, &pb.ClaimLetterRequest{LetterId: uuid.NewString()})
	assert.Equal(t, codes.Unauthenticated, status.Code(err), "served by the mailbox handler")

	_, err = srv.ListLetters(ctx, &pb.ListLettersRequest{})
	assert.Equal(t, codes.Unauthenticated, status.Code(err), "served by the mailbox handler")
}
