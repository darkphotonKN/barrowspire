package game

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// The settlement ids are pinned: a settlement retried across a deploy must
// derive the ids it derived before, or its plunder is stored twice. Changing
// the namespace, the name format or the routing keys fails here. The expected
// values were computed outside Go as UUIDv5(namespace, "<run>/<member key>/<routing key>").
// FS-GV8WN §B R7, ADR-0040 §2.
func TestNewSettlementIDs_Golden(t *testing.T) {
	runID := uuid.MustParse("0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f")
	solo := "11111111-1111-4111-8111-111111111111"
	teammate := "22222222-2222-4222-8222-222222222222"

	tests := []struct {
		name      string
		memberKey string
		want      settlementIDs
	}{
		{
			name:      "one member",
			memberKey: membersKey([]string{solo}),
			want: settlementIDs{
				ItemsExtracted: uuid.MustParse("f3383622-4115-541d-94f6-e7d0d68b4090"),
				MatchEnded:     uuid.MustParse("b3db63cf-7bfc-5a7e-a144-4f8530519a57"),
			},
		},
		{
			name:      "several members, listed in any order",
			memberKey: membersKey([]string{teammate, solo, teammate}),
			want: settlementIDs{
				ItemsExtracted: uuid.MustParse("9ecf4d99-f14b-53c7-89ff-c0d4d67b376a"),
				MatchEnded:     uuid.MustParse("cf9b8125-60e7-5665-8fca-3ba9651e80eb"),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, newSettlementIDs(runID, tt.memberKey))
		})
	}
}
