package commonhelpers

import (
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSetupLogger_DebugOnlyInDevelopment(t *testing.T) {
	prev := slog.Default()
	t.Cleanup(func() { slog.SetDefault(prev) })

	tests := []struct {
		environment string
		wantDebug   bool
	}{
		{"development", true},
		{"DEVELOPMENT", true},
		{"production", false},
		{"PRODUCTION", false},
		{"", false},
		{"prod", false},
	}

	for _, tt := range tests {
		t.Run(tt.environment, func(t *testing.T) {
			SetupLogger(tt.environment)

			assert.Equal(t, tt.wantDebug, slog.Default().Enabled(context.Background(), slog.LevelDebug))
			assert.True(t, slog.Default().Enabled(context.Background(), slog.LevelInfo))
		})
	}
}
