package member

import (
	"errors"
	"fmt"
	"testing"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/stretchr/testify/assert"
)

// FS-9KW9F §Requirements 17, §Edge States. The two deliberate wedges — an
// unknown member, and an account id another member already holds — must reach
// nackRequeue rather than being acked away. Both are consumer bugs, and a
// silently acked one leaves a member without the claim forever with nothing
// recording why.
func TestDecideAck(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want ackDecision
	}{
		{"success acks", nil, ackDone},
		{"redelivery acks, it is not a failure", commonconstants.ErrAlreadyProcessed, ackAlreadyProcessed},
		{"wrapped redelivery still acks",
			fmt.Errorf("record account: %w", commonconstants.ErrAlreadyProcessed), ackAlreadyProcessed},
		{"unknown member requeues, never acks",
			fmt.Errorf("record account: %w", commonconstants.ErrNotFound), nackRequeue},
		{"duplicate account id requeues, never acks",
			errors.New(`pq: duplicate key value violates unique constraint "members_account_id_key"`), nackRequeue},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, decideAck(tt.err))
		})
	}
}
