package config

import (
	"bytes"
	"log/slog"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/notification"
	"github.com/stretchr/testify/assert"
)

func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// FS-V6SFK R26: with SMTP_HOST unset the service mails Mailpit's dev defaults
// and says so at startup; with it set, the env decides and nothing is said.
func TestLoadSMTPConfig(t *testing.T) {
	tests := []struct {
		name        string
		env         map[string]string
		want        notification.SMTPConfig
		wantDevNote bool
	}{
		{
			name:        "host unset: the compose Mailpit's host port",
			env:         map[string]string{},
			want:        notification.SMTPConfig{Host: "localhost", Port: "1148", From: "noreply@barrowspire.local"},
			wantDevNote: true,
		},
		{
			name:        "host unset, port set: dev host on the given port",
			env:         map[string]string{"SMTP_PORT": "2525"},
			want:        notification.SMTPConfig{Host: "localhost", Port: "2525", From: "noreply@barrowspire.local"},
			wantDevNote: true,
		},
		{
			name: "host set: the env decides",
			env: map[string]string{
				"SMTP_HOST": "smtp.relay.example", "SMTP_PORT": "587", "SMTP_FROM": "hello@barrowspire.example",
				"SMTP_USERNAME": "relay-user", "SMTP_PASSWORD": "relay-pass",
			},
			want: notification.SMTPConfig{
				Host: "smtp.relay.example", Port: "587", From: "hello@barrowspire.example",
				Username: "relay-user", Password: "relay-pass",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, k := range []string{"SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "SMTP_USERNAME", "SMTP_PASSWORD"} {
				t.Setenv(k, tt.env[k])
			}
			logs := captureLogs(t)

			got := LoadSMTPConfig()

			assert.Equal(t, tt.want, got)
			assert.Equal(t, tt.wantDevNote, bytes.Contains(logs.Bytes(), []byte("dev mail defaults")))
			assert.NotContains(t, logs.String(), "relay-pass", "the password is never logged")
		})
	}
}
