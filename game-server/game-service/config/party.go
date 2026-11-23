package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// The bounds of PARTY_SIZE and MATCH_SIZE. Two is the smallest group worth calling a party or a
// match (a party of one is no party, a match of one is a solo run); four is the most FS-R82NV
// allows.
const (
	defaultPartySize = 3
	defaultMatchSize = 2
	minGroupSize     = 2
	maxGroupSize     = 4
)

// PartySettings are the pod's group sizes: Cap is the party cap, MatchSize how many players the
// matchmaker puts in a random match. Two settings, never derived from each other (ADR-0091).
type PartySettings struct {
	Cap       int
	MatchSize int
}

/**
* Reads PARTY_SIZE and MATCH_SIZE together. Either one invalid is an error, and
* the pod does not start.
* FS-R82NV §Change: Party cap 3, match size its own setting S1-S3.
**/
func LoadPartySettings() (PartySettings, error) {
	partyCap, err := LoadPartySize()
	if err != nil {
		return PartySettings{}, err
	}
	matchSize, err := LoadMatchSize()
	if err != nil {
		return PartySettings{}, err
	}
	return PartySettings{Cap: partyCap, MatchSize: matchSize}, nil
}

/**
* Reads PARTY_SIZE: the party cap, and only that. Unset is 3; anything but a
* whole number from 2 to 4 is an error, and the pod does not start.
* FS-R82NV §Change: Party cap 3, match size its own setting S1; ADR-0091.
**/
func LoadPartySize() (int, error) {
	return loadGroupSize("PARTY_SIZE", defaultPartySize)
}

/**
* Reads MATCH_SIZE: how many players the matchmaker puts in a random match.
* Apart from the party cap, so parties can grow while random matches stay as
* they are. Unset is 2; anything but a whole number from 2 to 4 is an error,
* and the pod does not start.
* FS-R82NV §Change: Party cap 3, match size its own setting S2; ADR-0091.
**/
func LoadMatchSize() (int, error) {
	return loadGroupSize("MATCH_SIZE", defaultMatchSize)
}

// loadGroupSize reads env as a whole number from minGroupSize to maxGroupSize, or def when unset.
// Every error names env.
func loadGroupSize(env string, def int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(env))
	if raw == "" {
		return def, nil
	}
	size, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s %q is not a whole number: %w", env, raw, err)
	}
	if size < minGroupSize || size > maxGroupSize {
		return 0, fmt.Errorf("%s %d is outside %d to %d", env, size, minGroupSize, maxGroupSize)
	}
	return size, nil
}
