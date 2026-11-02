package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// The bounds of PARTY_SIZE. Two is the smallest group worth calling a party
// (and a match of one is a solo run); four is the most FS-R82NV allows.
const (
	defaultPartySize = 2
	minPartySize     = 2
	maxPartySize     = 4
)

/**
* Reads PARTY_SIZE: the party cap and the matchmaker's match size, one setting
* so a full party and a random roster are the same shape. Unset is 2; anything
* but a whole number from 2 to 4 is an error, and the pod does not start.
* FS-R82NV §Requirements 8.
**/
func LoadPartySize() (int, error) {
	raw := strings.TrimSpace(os.Getenv("PARTY_SIZE"))
	if raw == "" {
		return defaultPartySize, nil
	}
	size, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("PARTY_SIZE %q is not a whole number: %w", raw, err)
	}
	if size < minPartySize || size > maxPartySize {
		return 0, fmt.Errorf("PARTY_SIZE %d is outside %d to %d", size, minPartySize, maxPartySize)
	}
	return size, nil
}
