package types

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A roll's payload is its heading and nothing else: a distance, a speed or a
// time a client adds is dropped at the parse. A missing or non-number field
// reads as 0, so the roll is refused on the tick, silently, as a zero heading
// is: a roll is never answered. FS-7P736 §A R2, R6.
func TestParsePayload_Roll_IsTheHeadingAlone(t *testing.T) {
	tests := []struct {
		name  string
		frame string
		want  PlayerRollPayload
	}{
		{"a heading", `{"action":"roll","payload":{"dir_x":0.6,"dir_y":-0.8}}`, PlayerRollPayload{DirX: 0.6, DirY: -0.8}},
		{"extras dropped", `{"action":"roll","payload":{"dir_x":1,"dir_y":0,"distance":1e6,"speed":1e6,"duration":9}}`, PlayerRollPayload{DirX: 1}},
		{"no heading", `{"action":"roll","payload":{}}`, PlayerRollPayload{}},
		{"no payload", `{"action":"roll"}`, PlayerRollPayload{}},
		{"text for a number", `{"action":"roll","payload":{"dir_x":"1","dir_y":0}}`, PlayerRollPayload{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var msg Message
			require.NoError(t, json.Unmarshal([]byte(tt.frame), &msg))
			parsed, err := msg.ParsePayload()
			require.NoError(t, err)
			assert.Equal(t, tt.want, parsed)
		})
	}
}
