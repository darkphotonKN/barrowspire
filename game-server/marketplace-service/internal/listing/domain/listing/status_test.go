package listing

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// A listing is live while it is on sale and while its settlement runs; every
// reconciler treats PENDING_SETTLEMENT as live (CONTEXT.md), and any status a
// listing ends in is not.
func TestListingStatus_IsLive(t *testing.T) {
	tests := []struct {
		status ListingStatus
		live   bool
	}{
		{StatusActive, true},
		{StatusPendingSettlement, true},
		{StatusSold, false},
		{StatusExpired, false},
		{StatusCancelled, false},
		{StatusSettlementFailed, false},
	}
	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			assert.Equal(t, tt.live, tt.status.IsLive())
		})
	}
}

// LiveStatuses is the one statement of the live set: SQL that filters on it
// takes it from here, so it can never drift from IsLive. A caller that changes
// the slice it was handed must not change the set.
func TestLiveStatuses_AreExactlyTheStatusesThatAreLive(t *testing.T) {
	all := []ListingStatus{StatusActive, StatusPendingSettlement, StatusSold, StatusExpired, StatusCancelled, StatusSettlementFailed}
	var live []ListingStatus
	for _, s := range all {
		if s.IsLive() {
			live = append(live, s)
		}
	}

	assert.ElementsMatch(t, live, LiveStatuses())

	handed := LiveStatuses()
	handed[0] = StatusSold
	assert.ElementsMatch(t, live, LiveStatuses())
}
