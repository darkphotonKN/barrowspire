package game

import (
	"testing"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-P9G8R §B (Requirements 14–16); §Acceptance Criteria "Consumed items
// leave the stash" (game-service rows). I-P9G8R-3.

// A run's end lists, for each delver, the stored potions they drank: both of
// a survivor's, a fallen delver's too (their body stays to the end, R15), and
// none for one who drank only a potion found in the run.
func TestEndSession_ResolvedRun_PublishesEachDelversConsumedItems(t *testing.T) {
	s := coopRun(t)
	outbox := &capturingOutbox{}
	s.sessionCloser = &homeReturner{run: s}
	s.eventEmitter = NewService(committingTxDB(t), outbox, noWake{})
	s.sender = &recordingSender{}

	survivorID, survivor := seatedDelver(t, s, "warrior", 300, 300)
	fallenID, fallen := seatedDelver(t, s, "mage", 600, 300)
	finderID, finder := seatedDelver(t, s, "archer", 900, 300)
	for _, delver := range []*ecs.Entity{survivor, fallen, finder} {
		hurt(t, delver, 10, 100)
	}
	first, second, fallensPotion := healthPotion(25), healthPotion(25), healthPotion(25)
	inConsumableSlot(t, s, survivor, 1, first)
	inConsumableSlot(t, s, survivor, 2, second)
	inConsumableSlot(t, s, fallen, 1, fallensPotion)
	inConsumableSlot(t, s, finder, 1, lootedHealthPotion(25))

	for _, playerID := range []uuid.UUID{survivorID, fallenID, finderID} {
		s.Drink(playerID)
	}
	tick(s)
	ticks(s, constants.GameFrameRate)
	s.Drink(survivorID)
	tick(s)
	require.Len(t, potionOf(t, survivor).ConsumedItemIDs, 2, "both of the survivor's potions were drunk")

	// the fallen delver dies after drinking; the others escape and the party resolves
	kill(t, fallen)
	tick(s)
	markEscaped(t, survivor)
	markEscaped(t, finder)
	tick(s)
	require.Len(t, s.endSessionCh, 1, "the party has resolved")
	<-s.endSessionCh

	s.endSession()

	byMember := map[string]*pb.PlayerItems{}
	for _, items := range outbox.itemsExtracted(t).GetPlayerItems() {
		byMember[items.GetMemberId()] = items
	}
	require.Len(t, byMember, 3, "one entry per delver, the fallen one included")
	assert.ElementsMatch(t,
		[]string{first.InstanceID.String(), second.InstanceID.String()},
		byMember[survivorID.String()].GetConsumedItemIds())
	assert.Equal(t, []string{fallensPotion.InstanceID.String()}, byMember[fallenID.String()].GetConsumedItemIds())
	assert.Empty(t, byMember[finderID.String()].GetConsumedItemIds(), "a potion found in the run has no row to delete")
}
