package commonhelpers

import (
	"log/slog"
	"os"
	"strings"
)

func SetupLogger(environment string) {
	// debug is opt-in, so a typo or missing ENVIRONMENT never turns it on in prod
	level := slog.LevelInfo
	if strings.EqualFold(environment, "development") {
		level = slog.LevelDebug
	}

	handler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	})

	slog.SetDefault(slog.New(handler))

	slog.Info("intialized logger.", "default level", level, "environment", environment)
}
