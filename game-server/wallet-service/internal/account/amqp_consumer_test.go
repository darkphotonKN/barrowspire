package account

import (
	"errors"
	"fmt"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/stretchr/testify/assert"
)

// FS-0006 §Requirements 17. The consumer this replaced auto-acked, so a failed
// account creation was discarded silently and the member never got an account.
// Nothing about that was visible in a test, which is the point of pulling the
// decision out of the delivery.
func TestDecideAck(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want ackDecision
	}{
		{"success acks", nil, ackDone},
		{"redelivery acks, it is not a failure", commonconstants.ErrAlreadyProcessed, ackAlreadyProcessed},
		{"wrapped redelivery still acks",
			fmt.Errorf("create account on signup: %w", commonconstants.ErrAlreadyProcessed), ackAlreadyProcessed},
		{"a real failure REQUEUES, never acks", errors.New("database is down"), nackRequeue},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, decideAck(tt.err))
		})
	}
}
