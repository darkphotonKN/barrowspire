package notification

import (
	"context"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/mail"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// smtpSession is what the fake server received in one session.
type smtpSession struct {
	from string
	rcpt []string
	data string
}

// fakeSMTPServer speaks just enough SMTP for one plain (no TLS, no auth)
// session, the way Mailpit does in dev, and hands back what it received.
func fakeSMTPServer(t *testing.T) (host, port string, got <-chan smtpSession) {
	return fakeSMTPServerReplying(t, "")
}

// fakeSMTPServerReplying is fakeSMTPServer with RCPT answered by rcptReply
// when it is set, to play a server that rejects the recipient.
func fakeSMTPServerReplying(t *testing.T, rcptReply string) (host, port string, got <-chan smtpSession) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = ln.Close() })

	sessions := make(chan smtpSession, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		tp := textproto.NewConn(conn)
		var s smtpSession
		_ = tp.PrintfLine("220 fake ESMTP")
		for {
			line, err := tp.ReadLine()
			if err != nil {
				return
			}
			cmd := strings.ToUpper(strings.SplitN(line, " ", 2)[0])
			switch {
			case cmd == "EHLO" || cmd == "HELO":
				_ = tp.PrintfLine("250 fake")
			case strings.HasPrefix(strings.ToUpper(line), "MAIL FROM:"):
				s.from = strings.Trim(line[len("MAIL FROM:"):], "<> ")
				_ = tp.PrintfLine("250 ok")
			case strings.HasPrefix(strings.ToUpper(line), "RCPT TO:"):
				s.rcpt = append(s.rcpt, strings.Trim(line[len("RCPT TO:"):], "<> "))
				if rcptReply != "" {
					_ = tp.PrintfLine("%s", rcptReply)
					continue
				}
				_ = tp.PrintfLine("250 ok")
			case cmd == "DATA":
				_ = tp.PrintfLine("354 go ahead")
				data, err := io.ReadAll(tp.DotReader())
				if err != nil {
					return
				}
				s.data = string(data)
				_ = tp.PrintfLine("250 queued")
			case cmd == "QUIT":
				_ = tp.PrintfLine("221 bye")
				sessions <- s
				return
			default:
				_ = tp.PrintfLine("502 not implemented")
			}
		}
	}()

	host, port, err = net.SplitHostPort(ln.Addr().String())
	require.NoError(t, err)
	return host, port, sessions
}

// FS-V6SFK R26: the SMTP mailer sends one multipart/alternative message, from
// the configured address to the recipient, carrying both bodies.
func TestSMTPMailer_Send_DeliversBothBodies(t *testing.T) {
	host, port, sessions := fakeSMTPServer(t)
	mailer := NewSMTPMailer(SMTPConfig{Host: host, Port: port, From: "noreply@barrowspire.local"})
	want := Mail{
		To:      "delver@barrowspire.test",
		Subject: "Your Barrowspire verification code",
		Text:    "Hi Délver, your code is 049381.\n",
		HTML:    "<p>Hi Délver, your code is <b>049381</b>.</p>\n",
	}

	err := mailer.Send(context.Background(), want)
	require.NoError(t, err)

	var s smtpSession
	select {
	case s = <-sessions:
	case <-time.After(5 * time.Second):
		t.Fatal("the fake server saw no complete session")
	}
	assert.Equal(t, "noreply@barrowspire.local", s.from)
	assert.Equal(t, []string{want.To}, s.rcpt)

	msg, err := mail.ReadMessage(strings.NewReader(s.data))
	require.NoError(t, err)
	assert.Equal(t, want.Subject, msg.Header.Get("Subject"))
	assert.Equal(t, want.To, msg.Header.Get("To"))
	assert.Equal(t, "noreply@barrowspire.local", msg.Header.Get("From"))

	mediaType, params, err := mime.ParseMediaType(msg.Header.Get("Content-Type"))
	require.NoError(t, err)
	require.Equal(t, "multipart/alternative", mediaType)
	parts := multipart.NewReader(msg.Body, params["boundary"])
	bodies := map[string]string{}
	for {
		part, err := parts.NextPart() // decodes quoted-printable
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		partType, _, err := mime.ParseMediaType(part.Header.Get("Content-Type"))
		require.NoError(t, err)
		body, err := io.ReadAll(part)
		require.NoError(t, err)
		bodies[partType] = strings.ReplaceAll(string(body), "\r\n", "\n")
	}
	assert.Equal(t, want.Text, bodies["text/plain"])
	assert.Equal(t, want.HTML, bodies["text/html"])
}

// FS-V6SFK R27: an unreachable server is an error the caller can retry on.
func TestSMTPMailer_Send_ServerUnreachable_IsAnError(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	require.NoError(t, ln.Close()) // nothing listens here now

	err = NewSMTPMailer(SMTPConfig{Host: host, Port: port, From: "noreply@barrowspire.local"}).
		Send(context.Background(), Mail{To: "delver@barrowspire.test", Subject: "s", Text: "t", HTML: "h"})

	assert.Error(t, err)
}

// A recipient carrying a line break would inject headers: refused before any
// connection is made.
func TestSMTPMailer_Send_HeaderInjection_IsRefused(t *testing.T) {
	err := NewSMTPMailer(SMTPConfig{Host: "127.0.0.1", Port: "1", From: "noreply@barrowspire.local"}).
		Send(context.Background(), Mail{To: "a@b.c\r\nBcc: x@y.z", Subject: "s", Text: "t", HTML: "h"})

	var mailErr *MailError
	require.ErrorAs(t, err, &mailErr)
	assert.Equal(t, "build", mailErr.Stage)
	assert.ErrorContains(t, mailErr.Err, "line break")
}

// FS-V6SFK R25, R27: a rejected recipient comes back as a MailError naming the
// stage and the reply code. Its message leaves out the server's free text,
// which echoes the address.
func TestSMTPMailer_Send_RejectedRecipient_IsAClassifiedError(t *testing.T) {
	host, port, _ := fakeSMTPServerReplying(t, "550 5.1.1 <delver@barrowspire.test>: Recipient address rejected")

	err := NewSMTPMailer(SMTPConfig{Host: host, Port: port, From: "noreply@barrowspire.local"}).
		Send(context.Background(), Mail{To: "delver@barrowspire.test", Subject: "s", Text: "t", HTML: "h"})

	var mailErr *MailError
	require.ErrorAs(t, err, &mailErr)
	assert.Equal(t, "rcpt", mailErr.Stage)
	assert.Equal(t, 550, mailErr.Code)
	assert.NotContains(t, err.Error(), "delver@barrowspire.test")
	assert.NotContains(t, err.Error(), "Recipient address rejected")
}
