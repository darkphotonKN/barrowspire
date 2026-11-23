package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// sizeCase is one row of a size setting's table: what the env holds and what loading it gives.
type sizeCase struct {
	name    string
	env     string
	want    int
	wantErr bool
}

// runSizeCases sets env to each row's value, loads it, and checks the result; an error must name
// the setting, so an operator knows which one to fix.
func runSizeCases(t *testing.T, env string, load func() (int, error), tests []sizeCase) {
	t.Helper()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(env, tt.env)

			got, err := load()

			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), env, "the error names the setting to fix")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

// PARTY_SIZE is the party cap only: 3 when unset, 2 to 4 when set, anything else a startup
// error. FS-R82NV §Change: Party cap 3, match size its own setting S1; I-R82NV-1 decision 4
// (no party of one).
func TestLoadPartySize(t *testing.T) {
	runSizeCases(t, "PARTY_SIZE", LoadPartySize, []sizeCase{
		{"unset defaults to three", "", 3, false},
		{"two", "2", 2, false},
		{"three", "3", 3, false},
		{"four, the most", "4", 4, false},
		{"spaces around a number", " 3 ", 3, false},
		{"one is no party", "1", 0, true},
		{"five is over the cap", "5", 0, true},
		{"zero", "0", 0, true},
		{"negative", "-2", 0, true},
		{"not a number", "two", 0, true},
	})
}

// MATCH_SIZE is the random queue's match size, apart from the party cap: 2 when unset, 2 to 4
// when set, anything else a startup error. FS-R82NV §Change: Party cap 3, match size its own
// setting S2; ADR-0091.
func TestLoadMatchSize(t *testing.T) {
	runSizeCases(t, "MATCH_SIZE", LoadMatchSize, []sizeCase{
		{"unset defaults to two", "", 2, false},
		{"two", "2", 2, false},
		{"three", "3", 3, false},
		{"four, the most", "4", 4, false},
		{"spaces around a number", " 3 ", 3, false},
		{"one is a solo run, not a match", "1", 0, true},
		{"five is over the most", "5", 0, true},
		{"zero", "0", 0, true},
		{"negative", "-2", 0, true},
		{"not a number", "two", 0, true},
	})
}

// The two settings are independent: setting one never moves the other. S3.
func TestSizeSettings_Independent(t *testing.T) {
	t.Setenv("PARTY_SIZE", "4")
	t.Setenv("MATCH_SIZE", "")

	party, err := LoadPartySize()
	require.NoError(t, err)
	match, err := LoadMatchSize()
	require.NoError(t, err)

	assert.Equal(t, 4, party)
	assert.Equal(t, 2, match, "MATCH_SIZE unset keeps its own default, whatever PARTY_SIZE says")
}

// With neither set, a pod caps parties at 3 and matches 2 players; a bad value in either stops it.
// FS-R82NV §Change: Party cap 3, match size its own setting S1-S3, its third acceptance row.
func TestLoadPartySettings(t *testing.T) {
	t.Run("both unset", func(t *testing.T) {
		t.Setenv("PARTY_SIZE", "")
		t.Setenv("MATCH_SIZE", "")

		got, err := LoadPartySettings()

		require.NoError(t, err)
		assert.Equal(t, PartySettings{Cap: 3, MatchSize: 2}, got)
	})
	for _, env := range []string{"PARTY_SIZE", "MATCH_SIZE"} {
		t.Run(env+" invalid", func(t *testing.T) {
			t.Setenv("PARTY_SIZE", "")
			t.Setenv("MATCH_SIZE", "")
			t.Setenv(env, "5")

			_, err := LoadPartySettings()

			require.Error(t, err)
			assert.Contains(t, err.Error(), env, "the error names the setting to fix")
		})
	}
}
