package notification

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls notification-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials notification-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with notification-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial notification service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) GetNotification(ctx context.Context, req *pb.NotificationRequest) (*pb.NotificationResponse, error) {
	client := pb.NewNotificationServiceClient(c.conn)

	response, err := client.GetNotification(ctx, req)
	return response, err
}

func (c *Client) MarkNotificationAsRead(ctx context.Context, req *pb.MarkNotificationAsReadRequest) (*pb.MarkNotificationAsReadResponse, error) {
	client := pb.NewNotificationServiceClient(c.conn)
	response, err := client.MarkNotificationAsRead(ctx, req)
	return response, err

}

func (c *Client) MarkAllNotificationsAsRead(ctx context.Context, req *pb.MarkAllNotificationsAsReadRequest) (*pb.MarkAllNotificationsAsReadResponse, error) {

	client := pb.NewNotificationServiceClient(c.conn)
	response, err := client.MarkAllNotificationsAsRead(ctx, req)
	return response, err
}

// Mailbox (FS-1GZGD): the in-game letters live in notification-service too,
// so the mailbox operations share this connection. Each call carries the
// caller's forwarded token on ctx.

func (c *Client) SendLetter(ctx context.Context, req *pb.SendLetterRequest) (*pb.SendLetterResponse, error) {
	return pb.NewNotificationServiceClient(c.conn).SendLetter(ctx, req)
}

func (c *Client) ListLetters(ctx context.Context, req *pb.ListLettersRequest) (*pb.ListLettersResponse, error) {
	return pb.NewNotificationServiceClient(c.conn).ListLetters(ctx, req)
}

func (c *Client) GetMailboxSummary(ctx context.Context, req *pb.GetMailboxSummaryRequest) (*pb.MailboxSummary, error) {
	return pb.NewNotificationServiceClient(c.conn).GetMailboxSummary(ctx, req)
}

func (c *Client) MarkLetterRead(ctx context.Context, req *pb.MarkLetterReadRequest) (*pb.MarkLetterReadResponse, error) {
	return pb.NewNotificationServiceClient(c.conn).MarkLetterRead(ctx, req)
}

func (c *Client) ClaimLetter(ctx context.Context, req *pb.ClaimLetterRequest) (*pb.ClaimLetterResponse, error) {
	return pb.NewNotificationServiceClient(c.conn).ClaimLetter(ctx, req)
}
