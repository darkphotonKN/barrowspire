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
	t.Setenv("POD_ADDR", "ws://game-0.game:5668/game/ws")

	assert.Equal(t, LoadPod(":5668").Addr, LoadPod(":5668").Addr)
	assert.Equal(t, "ws://game-0.game:5668/game/ws", LoadPod(":5668").Addr)
}
