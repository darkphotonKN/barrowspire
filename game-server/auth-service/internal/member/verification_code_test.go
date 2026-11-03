package member

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-V6SFK §Requirements 12: a code is always 6 digits, so a small draw keeps
// its leading zeros rather than coming out as "7".
func TestNewVerificationCode_ZeroPadsSmallDraws(t *testing.T) {
	tests := []struct {
		name   string
		random []byte
		want   string
	}{
		{"zero", bytes.Repeat([]byte{0}, 8), "000000"},
		{"seven", append(bytes.Repeat([]byte{0}, 2), 0x07), "000007"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := newVerificationCode(bytes.NewReader(tt.random))

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

// A failing random source is an error, never a predictable code.
func TestNewVerificationCode_RandomSourceFails_IsAnError(t *testing.T) {
	_, err := newVerificationCode(bytes.NewReader(nil))

	assert.Error(t, err)
}
