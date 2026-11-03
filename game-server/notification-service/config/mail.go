package config

import (
	"log/slog"
	"os"

	"github.com/darkphotonKN/barrowspire-server/notification-service/internal/notification"
)

// The dev defaults (FS-V6SFK R26), used when unset: the compose Mailpit as
// seen from the host. Its SMTP port 1025 is published on host port 1148,
// following the compose file's host-offset habit (like Redis on 6492).
const (
	devSMTPHost = "localhost"
	devSMTPPort = "1148"
	devSMTPFrom = "noreply@barrowspire.local"
)

// LoadSMTPConfig reads SMTP_HOST, SMTP_PORT, SMTP_FROM and the optional
// SMTP_USERNAME / SMTP_PASSWORD. An unset value takes its Mailpit dev default,
// and an unset SMTP_HOST is announced at startup so dev defaults never pass
// silently for a real relay. There is deliberately no "skip sending" switch.
func LoadSMTPConfig() notification.SMTPConfig {
	cfg := notification.SMTPConfig{
		Host:     getEnvAsString("SMTP_HOST", devSMTPHost),
		Port:     getEnvAsString("SMTP_PORT", devSMTPPort),
		From:     getEnvAsString("SMTP_FROM", devSMTPFrom),
		Username: os.Getenv("SMTP_USERNAME"),
		Password: os.Getenv("SMTP_PASSWORD"),
	}

	if os.Getenv("SMTP_HOST") == "" {
		slog.Warn("SMTP_HOST is unset, sending through dev mail defaults (compose Mailpit, host port 1148)",
			"host", cfg.Host,
			"port", cfg.Port,
			"from", cfg.From,
		)
	}

	return cfg
}
