package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// PARTY_SIZE is the party cap and the matchmaker's match size: 2 when unset,
// 2 to 4 when set, anything else a startup error. FS-R82NV §Requirements 8;
// I-R82NV-1 decision 4 (no party of one).
func TestLoadPartySize(t *testing.T) {
	tests := []struct {
		name    string
		env     string
		want    int
		wantErr bool
	}{
		{"unset defaults to two", "", 2, false},
		{"two", "2", 2, false},
		{"four, the most", "4", 4, false},
		{"spaces around a number", " 3 ", 3, false},
		{"one is no party", "1", 0, true},
		{"five is over the cap", "5", 0, true},
		{"zero", "0", 0, true},
		{"negative", "-2", 0, true},
		{"not a number", "two", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PARTY_SIZE", tt.env)

			got, err := LoadPartySize()

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "PARTY_SIZE", "the error names the setting to fix")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}
