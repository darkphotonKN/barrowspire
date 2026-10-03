package account

import (
	"errors"
	"fmt"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/stretchr/testify/assert"
)

// FS-9KW9F §Requirements 17. The consumer this replaced auto-acked, so a failed
// account creation was discarded silently and the member never got an account.
// Its successor nacked with requeue, which redelivered a failing message
// instantly and forever — a hot loop against the database. A real failure now
// waits in a delay queue, and after the last retry it is parked, never dropped.
func TestDecideAck(t *testing.T) {
	dbDown := errors.New("database is down")

	tests := []struct {
		name       string
		err        error
		retryCount int
		want       ackDecision
	}{
		{"success acks", nil, 0, ackDone},
		{"redelivery acks, it is not a failure", commonconstants.ErrAlreadyProcessed, 0, ackAlreadyProcessed},
		{"wrapped redelivery still acks",
			fmt.Errorf("create account on signup: %w", commonconstants.ErrAlreadyProcessed), 0, ackAlreadyProcessed},
		{"a first failure waits in a retry queue", dbDown, 0, retryLater},
		{"the last retry still retries", dbDown, len(retryDelays) - 1, retryLater},
		{"retries exhausted parks the message", dbDown, len(retryDelays), deadLetter},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, decideAck(tt.err, tt.retryCount))
		})
	}
}
