package notification

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testCode = "049381"

// fakeMailer records every mail it is asked to send, or fails them all.
type fakeMailer struct {
	err  error
	sent []Mail
}

func (f *fakeMailer) Send(ctx context.Context, mail Mail) error {
	if f.err != nil {
		return f.err
	}
	f.sent = append(f.sent, mail)
	return nil
}

func verificationRequested(eventID string) *commonconstants.MemberVerificationRequestedEventPayload {
	return &commonconstants.MemberVerificationRequestedEventPayload{
		EventID:   eventID,
		MemberID:  uuid.NewString(),
		Name:      "Delver",
		Email:     "delver@barrowspire.test",
		Code:      testCode,
		ExpiresAt: time.Now().Add(15 * time.Minute),
	}
}

// FS-V6SFK R24, R25: a new event sends one mail to the payload's address,
// writes no in-app notification, and records the event in the inbox in the
// same transaction.
func TestProcessVerificationRequested_NewEvent_SendsOneMail(t *testing.T) {
	store, mailer := newFakeStore(), &fakeMailer{}
	svc := store.service()
	svc.mailer = mailer
	payload := verificationRequested(uuid.NewString())

	err := svc.ProcessVerificationRequested(context.Background(), payload)

	require.NoError(t, err)
	require.Len(t, mailer.sent, 1)
	assert.Equal(t, payload.Email, mailer.sent[0].To)
	assert.Empty(t, store.committed, "no in-app notification row")
	assert.True(t, store.committedEvents[inboxKey{uuid.MustParse(payload.EventID), commonconstants.MemberVerificationRequestedEvent}])
}

// FS-V6SFK R24: once the inbox row has committed, a redelivery sends nothing.
func TestProcessVerificationRequested_Redelivery_SendsNoSecondMail(t *testing.T) {
	store, mailer := newFakeStore(), &fakeMailer{}
	svc := store.service()
	svc.mailer = mailer
	payload := verificationRequested(uuid.NewString())

	require.NoError(t, svc.ProcessVerificationRequested(context.Background(), payload))
	err := svc.ProcessVerificationRequested(context.Background(), payload)

	assert.ErrorIs(t, err, commonconstants.ErrAlreadyProcessed)
	assert.Len(t, mailer.sent, 1)
}

// FS-V6SFK R25, R27: a send failure is logged at error level with the member
// and event ids, is transient so the consumer retries it, and leaves the event
// unprocessed so the retry sends. The code is in no log line.
func TestProcessVerificationRequested_SendFails_LeavesTheEventUnprocessed(t *testing.T) {
	logs := captureErrorLogs(t)
	store, mailer := newFakeStore(), &fakeMailer{err: errors.New("dial tcp 127.0.0.1:1025: connection refused")}
	svc := store.service()
	svc.mailer = mailer
	payload := verificationRequested(uuid.NewString())

	err := svc.ProcessVerificationRequested(context.Background(), payload)

	assert.ErrorIs(t, err, commonconstants.ErrTransient)
	assert.Empty(t, store.committedEvents, "inbox mark rolled back")
	assert.Contains(t, logs.String(), "level=ERROR")
	assert.Contains(t, logs.String(), payload.EventID)
	assert.Contains(t, logs.String(), payload.MemberID)
	assert.NotContains(t, logs.String(), testCode)
	assert.NotContains(t, err.Error(), testCode)

	mailer.err = nil
	require.NoError(t, svc.ProcessVerificationRequested(context.Background(), payload))
	assert.Len(t, mailer.sent, 1, "the redelivery sends")
}

// An event id that is not a uuid cannot be deduplicated: it fails permanently
// (dead-lettered, never retried) before any mail or transaction.
func TestProcessVerificationRequested_InvalidEventID_IsPermanent(t *testing.T) {
	store, mailer := newFakeStore(), &fakeMailer{}
	svc := store.service()
	svc.mailer = mailer

	err := svc.ProcessVerificationRequested(context.Background(), verificationRequested("not-a-uuid"))

	require.Error(t, err)
	assert.NotErrorIs(t, err, commonconstants.ErrTransient)
	assert.Empty(t, mailer.sent)
	assert.Zero(t, store.txCount)
}

// FS-V6SFK R25: the subject, and plain-text and HTML bodies naming the member,
// the code and the 15-minute expiry. The HTML escapes the member's name.
func TestVerificationMail(t *testing.T) {
	payload := verificationRequested(uuid.NewString())
	payload.Name = `<b>Delver</b>`

	mail, err := verificationMail(payload)

	require.NoError(t, err)
	assert.Equal(t, payload.Email, mail.To)
	assert.Equal(t, "Your Barrowspire verification code", mail.Subject)
	for _, body := range []string{mail.Text, mail.HTML} {
		assert.Contains(t, body, testCode)
		assert.Contains(t, body, "15 minutes")
	}
	assert.Contains(t, mail.Text, "<b>Delver</b>")
	assert.Contains(t, mail.HTML, "&lt;b&gt;Delver&lt;/b&gt;")
	assert.False(t, strings.Contains(mail.HTML, "<b>Delver</b>"), "name is escaped in HTML")
}

// FS-V6SFK R25: a send error's free text can echo the recipient address (a
// RCPT rejection usually does). Neither the error log nor the error handed to
// the consumer, which logs it again, carries it: only the classification
// (stage and SMTP reply code) and the two ids.
func TestProcessVerificationRequested_SendFails_LogsTheClassificationNotTheServerText(t *testing.T) {
	serverText := errors.New("550 5.1.1 <delver@barrowspire.test>: Recipient address rejected")
	tests := []struct {
		name      string
		sendErr   error
		wantInLog []string
	}{
		{"classified smtp failure", &MailError{Stage: "rcpt", Code: 550, Err: serverText}, []string{"stage=rcpt", "smtp_code=550"}},
		{"unclassified failure", serverText, []string{"stage=unknown"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureErrorLogs(t)
			store := newFakeStore()
			svc := store.service()
			svc.mailer = &fakeMailer{err: tt.sendErr}
			payload := verificationRequested(uuid.NewString())

			err := svc.ProcessVerificationRequested(context.Background(), payload)

			assert.ErrorIs(t, err, commonconstants.ErrTransient)
			for _, want := range tt.wantInLog {
				assert.Contains(t, logs.String(), want)
			}
			for _, leaked := range []string{payload.Email, "Recipient address rejected"} {
				assert.NotContains(t, logs.String(), leaked, "log line")
				assert.NotContains(t, err.Error(), leaked, "returned error")
			}
		})
	}
}
