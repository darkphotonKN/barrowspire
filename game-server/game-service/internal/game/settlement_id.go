package game

import (
	"slices"
	"strings"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
)

// settlementNamespace is the fixed UUIDv5 namespace every settlement row id is
// derived under. Never change it: a changed namespace gives a settlement
// retried across a deploy a new id, and its plunder would be stored twice.
var settlementNamespace = uuid.MustParse("aaee2167-41bf-4867-a171-7c3463576efe")

// settlementIDs are the outbox row ids of one settlement's pair. Each id is the
// MessageId the consumers dedup on, so the same settlement written twice (a
// retry after a commit that errored but did commit) collapses onto one row per
// event. FS-GV8WN §B R7, ADR-0040 §2.
type settlementIDs struct {
	ItemsExtracted uuid.UUID
	MatchEnded     uuid.UUID
}

// newSettlementIDs derives the pair's ids from the run (or field visit) id, the
// member key, and each event's routing key: the same inputs always give the
// same ids, and any other run, member or event gives other ones.
func newSettlementIDs(runID uuid.UUID, memberKey string) settlementIDs {
	return settlementIDs{
		ItemsExtracted: settlementEventID(runID, memberKey, commonconstants.ItemsExtracted),
		MatchEnded:     settlementEventID(runID, memberKey, commonconstants.GameMatchEnded),
	}
}

func settlementEventID(runID uuid.UUID, memberKey string, routingKey string) uuid.UUID {
	// NewSHA1 is UUIDv5
	return uuid.NewSHA1(settlementNamespace, []byte(runID.String()+"/"+memberKey+"/"+routingKey))
}

// sweepMemberKey is the member key of a run's sweep: the items.extracted its end
// writes when everyone was already settled (FS-GV8WN R14).
const sweepMemberKey = "sweep"

// membersKey is the member key of a pair that carries memberIDs: the member's
// own id for one, and for several their ids sorted and joined, so the order
// they were listed in never changes the ids.
func membersKey(memberIDs []string) string {
	sorted := slices.Clone(memberIDs)
	slices.Sort(sorted)
	return strings.Join(slices.Compact(sorted), ",")
}
