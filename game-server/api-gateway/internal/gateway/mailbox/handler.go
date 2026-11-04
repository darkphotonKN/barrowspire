// Package mailbox serves the in-game mailbox (FS-1GZGD): the player's letters,
// their summary and mark read, and the admin send. Every rule about a letter
// is notification-service's; this package checks shape and the admin role,
// forwards the caller's token, and passes notification's answers through.
//
// "Mail" in these paths is the in-game mailbox, never email (ADR-0044).
package mailbox

import (
	"context"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
)

// LetterClient is what the mailbox operations need from notification-service.
// Each call carries the caller's forwarded token; notification reads the
// member from it, never from a request field.
type LetterClient interface {
	SendLetter(ctx context.Context, req *pb.SendLetterRequest) (*pb.SendLetterResponse, error)
	ListLetters(ctx context.Context, req *pb.ListLettersRequest) (*pb.ListLettersResponse, error)
	GetMailboxSummary(ctx context.Context, req *pb.GetMailboxSummaryRequest) (*pb.MailboxSummary, error)
	MarkLetterRead(ctx context.Context, req *pb.MarkLetterReadRequest) (*pb.MarkLetterReadResponse, error)
}

// Handler holds the notification client the typed operations close over.
type Handler struct {
	client LetterClient
}

func NewHandler(client LetterClient) *Handler {
	return &Handler{client: client}
}
