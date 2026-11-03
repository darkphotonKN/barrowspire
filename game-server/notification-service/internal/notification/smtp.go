package notification

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"

	"github.com/google/uuid"
)

// smtpTimeout bounds one whole send when the caller's context has no deadline,
// so a server that accepts the connection and then stalls cannot hold the
// consumer (and its inbox transaction) forever.
const smtpTimeout = 30 * time.Second

// SMTPConfig is where and as whom SMTPMailer sends (FS-V6SFK R26). Username
// and Password are optional; when Username is empty no AUTH is attempted.
type SMTPConfig struct {
	Host     string
	Port     string
	From     string
	Username string
	Password string
}

// SMTPMailer is the Mailer that speaks SMTP: Mailpit in dev, a real relay
// elsewhere. It upgrades to TLS whenever the server offers STARTTLS.
type SMTPMailer struct {
	cfg SMTPConfig
}

func NewSMTPMailer(cfg SMTPConfig) *SMTPMailer {
	return &SMTPMailer{cfg: cfg}
}

// Send delivers mail as one multipart/alternative message: the plain-text
// body first, the HTML alternative second. Every failure is a *MailError.
func (m *SMTPMailer) Send(ctx context.Context, mail Mail) error {
	if strings.ContainsAny(mail.To, "\r\n") || strings.ContainsAny(mail.Subject, "\r\n") {
		return &MailError{Stage: "build", Err: errors.New("recipient or subject contains a line break")}
	}

	msg, err := m.message(mail)
	if err != nil {
		return mailError("build", err)
	}

	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, smtpTimeout)
		defer cancel()
	}

	var dialer net.Dialer
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(m.cfg.Host, m.cfg.Port))
	if err != nil {
		return mailError("dial", err)
	}
	deadline, _ := ctx.Deadline()
	if err := conn.SetDeadline(deadline); err != nil {
		_ = conn.Close()
		return mailError("dial", err)
	}

	client, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return mailError("greeting", err)
	}
	// After a successful Quit this is a no-op error; on any earlier failure it
	// drops the connection, which is all that is left to do.
	defer func() { _ = client.Close() }()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: m.cfg.Host}); err != nil {
			return mailError("starttls", err)
		}
	}
	if m.cfg.Username != "" {
		auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
		if err := client.Auth(auth); err != nil {
			return mailError("auth", err)
		}
	}

	if err := client.Mail(m.cfg.From); err != nil {
		return mailError("mail", err)
	}
	if err := client.Rcpt(mail.To); err != nil {
		return mailError("rcpt", err)
	}
	w, err := client.Data()
	if err != nil {
		return mailError("data", err)
	}
	if _, err := w.Write(msg); err != nil {
		return mailError("data", err)
	}
	if err := w.Close(); err != nil {
		return mailError("data", err)
	}
	if err := client.Quit(); err != nil {
		return mailError("quit", err)
	}
	return nil
}

// message renders the RFC 5322 message: headers, then a multipart/alternative
// body whose parts are quoted-printable UTF-8.
func (m *SMTPMailer) message(mail Mail) ([]byte, error) {
	var buf bytes.Buffer
	body := multipart.NewWriter(&buf)

	header := func(k, v string) { fmt.Fprintf(&buf, "%s: %s\r\n", k, v) }
	header("From", m.cfg.From)
	header("To", mail.To)
	header("Subject", mime.QEncoding.Encode("utf-8", mail.Subject))
	header("Date", time.Now().UTC().Format(time.RFC1123Z))
	header("Message-ID", fmt.Sprintf("<%s@%s>", uuid.NewString(), domainOf(m.cfg.From)))
	header("MIME-Version", "1.0")
	header("Content-Type", mime.FormatMediaType("multipart/alternative", map[string]string{"boundary": body.Boundary()}))
	buf.WriteString("\r\n")

	for _, part := range []struct{ contentType, content string }{
		{"text/plain; charset=UTF-8", mail.Text},
		{"text/html; charset=UTF-8", mail.HTML},
	} {
		w, err := body.CreatePart(textproto.MIMEHeader{
			"Content-Type":              {part.contentType},
			"Content-Transfer-Encoding": {"quoted-printable"},
		})
		if err != nil {
			return nil, err
		}
		qp := quotedprintable.NewWriter(w)
		if _, err := qp.Write([]byte(part.content)); err != nil {
			return nil, err
		}
		if err := qp.Close(); err != nil {
			return nil, err
		}
	}
	if err := body.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// mailError classifies a failed stage, keeping the server's reply code when
// it gave one and dropping its free text from the message.
func mailError(stage string, err error) *MailError {
	e := &MailError{Stage: stage, Err: err}
	var reply *textproto.Error
	if errors.As(err, &reply) {
		e.Code = reply.Code
	}
	return e
}

// domainOf is the part of an address after the @, for the Message-ID.
func domainOf(address string) string {
	if at := strings.LastIndex(address, "@"); at >= 0 {
		return address[at+1:]
	}
	return "localhost"
}
