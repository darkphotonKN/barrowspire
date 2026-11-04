package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// The pool budget (FS-1GZGD ADR-0044 §Consequences): a claim holds a
// connection across its items and wallet calls, and a letter request or a
// cold-cache welcome holds one across its items resolve. Capped claims plus
// those consumers must leave connections for the reads, mark read and every
// other consumer, so a slow items or wallet never freezes the service.
func TestDBPool_ClaimCapLeavesConnectionsForEverythingElse(t *testing.T) {
	assert.GreaterOrEqual(t, dbMaxOpenConns, 8)
	assert.GreaterOrEqual(t, MaxConcurrentClaims, 1)
	assert.Less(t, MaxConcurrentClaims+resolvingConsumers, dbMaxOpenConns,
		"capped claims and the consumers that resolve items inside a transaction leave a connection free")
}
