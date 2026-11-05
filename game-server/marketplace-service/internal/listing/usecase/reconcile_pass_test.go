package usecase

import (
	"bytes"
	"log/slog"
	"testing"
)

// captureErrorLogs swaps the default logger for one that keeps only error lines,
// so a test can see whether a row was logged as failed.
func captureErrorLogs(t *testing.T) *bytes.Buffer {
	t.Helper()

	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelError})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	return &buf
}
