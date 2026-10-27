package config

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadPod_ID(t *testing.T) {
	hostname, err := os.Hostname()
	require.NoError(t, err)

	tests := []struct {
		name          string
		podID         string
		wantBase      string
		wantGenerated bool
	}{
		{"POD_ID set uses it as the base", "game-7f9c", "game-7f9c", false},
		{"POD_ID unset falls back to the hostname", "", hostname, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("POD_ID", tt.podID)

			pod := LoadPod(":5668")

			assert.True(t, strings.HasPrefix(pod.ID, tt.wantBase+"-"), "got %q", pod.ID)
			assert.Greater(t, len(pod.ID), len(tt.wantBase)+1, "missing the boot suffix")
			assert.Equal(t, tt.wantGenerated, pod.Generated)
		})
	}
}

// A restarted pod keeps its name (same POD_ID / hostname) but must not inherit
// the dead process's liveness or queued players. FS-K2HKP §Requirements 3–5.
func TestLoadPod_ID_IsUniquePerProcessStart(t *testing.T) {
	t.Setenv("POD_ID", "game-7f9c")

	first := LoadPod(":5668")
	restarted := LoadPod(":5668")

	assert.NotEqual(t, first.ID, restarted.ID)
}

func TestLoadPod_Addr_IsStableAcrossStarts(t *testing.T) {
	t.Setenv("POD_NAME", "game-0")
	t.Setenv("POD_ADDR_TEMPLATE", "ws://{pod}.game:{port}/game/ws")

	assert.Equal(t, LoadPod(":5668").Addr, LoadPod(":5668").Addr)
	assert.Equal(t, "ws://game-0.game:5668/game/ws", LoadPod(":5668").Addr)
}

func TestLoadPod_Addr_FromTemplate(t *testing.T) {
	tests := []struct {
		name     string
		podName  string
		template string
		want     string
	}{
		{"default template follows the port", "game-1", "", "ws://localhost:5668/game/ws"},
		{"pod name and port", "game-1", "wss://play.example/{pod}/game/ws", "wss://play.example/game-1/game/ws"},
		{"ordinal from the trailing number", "game-12", "wss://g{ordinal}.example:{port}/game/ws", "wss://g12.example:5668/game/ws"},
		{"no trailing number is ordinal 0", "laptop", "wss://g{ordinal}.example/game/ws", "wss://g0.example/game/ws"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("POD_NAME", tt.podName)
			if tt.template != "" {
				t.Setenv("POD_ADDR_TEMPLATE", tt.template)
			}

			pod := LoadPod(":5668")

			assert.Equal(t, tt.want, pod.Addr)
			assert.Equal(t, tt.podName, pod.Name)
		})
	}
}
