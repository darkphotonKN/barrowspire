package notification

import (
	"context"
	"fmt"
)

// Mail is one outbound email: a plain-text body and an HTML alternative.
type Mail struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Mailer delivers outbound email (FS-V6SFK R26). The service owns this
// interface; SMTPMailer is the one implementation, chosen by config.
type Mailer interface {
	Send(ctx context.Context, mail Mail) error
}

// MailError is how a Mailer reports a failed send: the protocol stage that
// failed and, when the server answered, its reply code. Error() never carries
// the server's free text, which can echo the recipient address (FS-V6SFK R25:
// log lines carry the member id and event id only). The underlying error stays
// reachable through Unwrap for errors.Is, never for logging.
type MailError struct {
	Stage string // "dial", "greeting", "starttls", "auth", "mail", "rcpt", "data", "quit", "build"
	Code  int    // the SMTP reply code, 0 when the server gave none
	Err   error
}

func (e *MailError) Error() string {
	if e.Code != 0 {
		return fmt.Sprintf("mail send failed at %s: smtp reply %d", e.Stage, e.Code)
	}
	return fmt.Sprintf("mail send failed at %s", e.Stage)
}

func (e *MailError) Unwrap() error { return e.Err }
