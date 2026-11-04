// Package mailbox serves the in-game mailbox (FS-1GZGD): the player's letters,
// their summary, mark read and the claim, and the admin send. Every rule about a letter
// is notification-service's; this package checks shape and the admin role,
// forwards the caller's token, and passes notification's answers through.
//
// "Mail" in these paths is the in-game mailbox, never email (ADR-0044).
package mailbox

import (
	"context"
	"errors"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// LetterClient is what the mailbox operations need from notification-service.
// Each call carries the caller's forwarded token; notification reads the
// member from it, never from a request field.
type LetterClient interface {
	SendLetter(ctx context.Context, req *pb.SendLetterRequest) (*pb.SendLetterResponse, error)
	ListLetters(ctx context.Context, req *pb.ListLettersRequest) (*pb.ListLettersResponse, error)
	GetMailboxSummary(ctx context.Context, req *pb.GetMailboxSummaryRequest) (*pb.MailboxSummary, error)
	MarkLetterRead(ctx context.Context, req *pb.MarkLetterReadRequest) (*pb.MarkLetterReadResponse, error)
	ClaimLetter(ctx context.Context, req *pb.ClaimLetterRequest) (*pb.ClaimLetterResponse, error)
}

// Timeouts bound each mailbox call to notification-service, so a stuck
// notification never holds a player's request open: past it the answer is
// 503 SERVICE_UNAVAILABLE (FS-1GZGD R32). The deadline travels with the call,
// so notification stops working on an answer nobody waits for.
type Timeouts struct {
	// Read bounds the summary, the letters and mark read.
	Read time.Duration
	// Claim bounds a claim. It outlasts notification's own 10 s bound on the
	// claim's items and wallet steps, so a slow but healthy claim finishes.
	Claim time.Duration
	// Send bounds the admin send. It outlasts notification's 5 s items
	// resolve plus storing up to 1000 letters.
	Send time.Duration
}

// DefaultTimeouts are the mailbox deadlines the gateway runs with.
var DefaultTimeouts = Timeouts{Read: 5 * time.Second, Claim: 15 * time.Second, Send: 15 * time.Second}

// Handler holds the notification client the typed operations close over.
type Handler struct {
	client   LetterClient
	timeouts Timeouts
}

func NewHandler(client LetterClient, timeouts Timeouts) *Handler {
	return &Handler{client: client, timeouts: timeouts}
}

// within runs one notification call under d. notification not answering in
// time is its outage, Unavailable (503), not the 500 an unseen
// DeadlineExceeded would map to.
func within[O any](ctx context.Context, d time.Duration, call func(context.Context) (O, error)) (O, error) {
	ctx, cancel := context.WithTimeout(ctx, d)
	defer cancel()

	out, err := call(ctx)
	if err != nil && (status.Code(err) == codes.DeadlineExceeded || errors.Is(err, context.DeadlineExceeded)) {
		return out, status.Error(codes.Unavailable, "notification service did not answer in time")
	}
	return out, err
}
