package gameserver

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// settlementLog records each player's own settlement, published the moment
// they resolve (FS-GV8WN §A). Embedded in the run-end spies.
type settlementLog struct {
	settledMu sync.Mutex
	settled   []*types.RawSettlement
}

func (l *settlementLog) PublishSettlement(_ context.Context, settlement *types.RawSettlement) {
	l.settledMu.Lock()
	defer l.settledMu.Unlock()
	l.settled = append(l.settled, settlement)
}

// awaitRemoved waits for a run to have removed member's body: a member still
// unsettled is settled and removed on the run's next tick, never beside it
// (FS-GV8WN §A R2).
func awaitRemoved(t *testing.T, run *game.Session, member uuid.UUID, msg string) {
	t.Helper()
	require.Eventually(t, func() bool { return !run.HasPlayer(member) }, time.Second, 5*time.Millisecond, msg)
}

// settlementsOf is every settlement published for member.
func (l *settlementLog) settlementsOf(member uuid.UUID) []*types.RawSettlement {
	l.settledMu.Lock()
	defer l.settledMu.Unlock()
	var of []*types.RawSettlement
	for _, s := range l.settled {
		if s.Player.MemberID == member.String() {
			of = append(of, s)
		}
	}
	return of
}

// settledInRun is every member the run settled: by their own settlement, or by
// its end (FS-GV8WN §A, §E R14).
func (l *settlementLog) settledInRun(ended *types.RawMatchState) []string {
	l.settledMu.Lock()
	defer l.settledMu.Unlock()
	members := make([]string, 0, len(l.settled)+len(ended.Players))
	for _, s := range l.settled {
		members = append(members, s.Player.MemberID)
	}
	for _, p := range ended.Players {
		members = append(members, p.MemberID)
	}
	return members
}
