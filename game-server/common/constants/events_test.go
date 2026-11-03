package commonconstants_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
	"time"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
)

// FS-V6SFK R25, ADR-0043: the verification code travels in the payload but
// never into a log line, even when the whole payload is handed to slog.
func TestMemberVerificationRequestedEventPayload_LogValue_OmitsTheCode(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	payload := commonconstants.MemberVerificationRequestedEventPayload{
		EventID:   "event-1",
		MemberID:  "member-1",
		Name:      "Delver",
		Email:     "delver@barrowspire.test",
		Code:      "493817",
		ExpiresAt: time.Now(),
	}

	logger.Debug("payload", "event", payload)

	got := buf.String()
	if strings.Contains(got, payload.Code) {
		t.Fatalf("log line carries the code: %s", got)
	}
	if strings.Contains(got, payload.Email) {
		t.Fatalf("log line carries the address: %s", got)
	}
	for _, want := range []string{"event_id=event-1", "member_id=member-1"} {
		if !strings.Contains(got, want) {
			t.Errorf("log line %q is missing %q", got, want)
		}
	}
}
