package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordedSettlement is a geared delver's run whose settlements and messages
// are recorded.
func recordedSettlement(t *testing.T) (geared, *settlementsEmitter, *recordingSender) {
	t.Helper()
	g, emitter := gearedSettling(t)
	sender := &recordingSender{}
	g.s.sender = sender
	return g, emitter, sender
}

// settlementMessages are the settlement messages sent to the player, in order.
func settlementMessages(sender *recordingSender, playerID uuid.UUID) []types.Message {
	var out []types.Message
	for _, m := range sender.to(playerID) {
		if m.Action == string(constants.ActionSettlement) {
			out = append(out, m)
		}
	}
	return out
}

func carriedNames(t *testing.T, m types.Message) map[string]bool {
	t.Helper()
	carried, ok := m.Payload["carried"].([]types.SettlementCarriedItem)
	require.True(t, ok, "carried is a list of items")
	found := map[string]bool{}
	for _, item := range carried {
		found[item.Name] = item.Found
	}
	return found
}

func lostReasons(t *testing.T, m types.Message) map[string]string {
	t.Helper()
	lost, ok := m.Payload["lost"].([]types.SettlementLostItem)
	require.True(t, ok, "lost is a list of items")
	reasons := map[string]string{}
	for _, item := range lost {
		reasons[item.Name] = item.Reason
	}
	return reasons
}

// The player who escapes is sent their settlement record at once, pending:
// everything carried out, finds marked found, nothing lost. FS-GV8WN §G R19,
// I-GV8WN-8.
func TestSettlementRecord_Escape_SentPendingWithEverythingCarried(t *testing.T) {
	g, _, sender := recordedSettlement(t)
	g.escape(t)

	g.s.settleEscape(g.playerID)

	messages := settlementMessages(sender, g.playerID)
	require.Len(t, messages, 1)
	record := messages[0].Payload
	assert.Equal(t, "escaped", record["outcome"])
	assert.Equal(t, "pending", record["status"])
	assert.Equal(t, map[string]bool{
		"Barrow Seax": false, "Iron Band": true, "Lesser Heal Potion": true, "Barrow Helm": false,
	}, carriedNames(t, messages[0]), "brought-in items are not finds")
	assert.Empty(t, lostReasons(t, messages[0]))
}

// A death's record lists the unsafe finds lost and the stored potions drunk.
// FS-GV8WN §G R19.
func TestSettlementRecord_Death_ListsLostFindsAndWhatTheyDrank(t *testing.T) {
	g, _, sender := recordedSettlement(t)
	body, ok := g.s.EntityManager.GetEntity(g.entityID)
	require.True(t, ok)
	drunk := uuid.New()
	body.AddComponent(&components.PotionComponent{
		Consumed: []components.ConsumedItem{{InstanceID: drunk, Item: components.ItemComponent{Name: "Greater Heal Potion", ItemType: types.ItemTypeConsumable}}},
	})
	g.die(t)

	g.s.settleDeath(g.playerID)

	messages := settlementMessages(sender, g.playerID)
	require.Len(t, messages, 1)
	assert.Equal(t, "died", messages[0].Payload["outcome"])
	assert.Equal(t, map[string]bool{"Barrow Seax": false, "Barrow Helm": false}, carriedNames(t, messages[0]))
	assert.Equal(t, map[string]string{
		"Iron Band": "unsafe", "Lesser Heal Potion": "unsafe", "Greater Heal Potion": "consumed",
	}, lostReasons(t, messages[0]))
}

// The record carries the level seated at and reached, the experience earned,
// the kills and the time in the run. FS-GV8WN §G R19.
func TestSettlementRecord_CarriesLevelsExperienceKillsAndTime(t *testing.T) {
	s, _, _ := settlingRun(t)
	sender := &recordingSender{}
	s.sender = sender
	m := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 2, Experience: 100})
	body, ok := s.EntityManager.GetEntity(s.playerIDToEntitiesID[m.id])
	require.True(t, ok)
	sc, _ := body.GetComponent(ecs.ComponentTypeStats)
	stats := sc.(*components.StatsComponent)
	stats.Level, stats.Kills = 3, 4
	markEscaped(t, body)

	s.settleEscape(m.id)

	record := settlementMessages(sender, m.id)[0].Payload
	assert.Equal(t, 2, record["level_before"], "seated at")
	assert.Equal(t, 3, record["level_after"])
	assert.Equal(t, 4, record["kills"])
	assert.Contains(t, record, "experience_gained")
	assert.Contains(t, record, "seconds_in_run")
}

// Once items-service applies it, the same record is sent again, confirmed.
// FS-GV8WN §G R20.
func TestSettlementRecord_Confirmed_SentAgainOnceApplied(t *testing.T) {
	g, emitter, sender := recordedSettlement(t)
	g.escape(t)
	g.s.settleEscape(g.playerID)
	require.Len(t, emitter.confirms, 1)
	require.NotNil(t, emitter.confirms[0], "the settlement asks to be told once applied")

	emitter.confirms[0]()

	messages := settlementMessages(sender, g.playerID)
	require.Len(t, messages, 2)
	assert.Equal(t, "confirmed", messages[1].Payload["status"])
	assert.Equal(t, carriedNames(t, messages[0]), carriedNames(t, messages[1]), "the same content")
}

// A drunk stored potion is kept on the body, for the record to name it.
func TestDrink_StoredPotion_KeptForTheRecord(t *testing.T) {
	s := coopRun(t)
	_, delver := seatedDelver(t, s, "warrior", 300, 300)
	hurt(t, delver, 10, 100)
	potion := healthPotion(25)
	inConsumableSlot(t, s, delver, 1, potion)

	playerID := s.playerEntityIDToPlayerID[delver.ID]
	s.Drink(playerID)
	tick(s)

	consumed := potionOf(t, delver).Consumed
	require.Len(t, consumed, 1)
	assert.Equal(t, potion.Name, consumed[0].Item.Name)
	assert.Equal(t, *potion.InstanceID, consumed[0].InstanceID)
}

// A body keeps the level it was seated at. FS-GV8WN §G R19 (level_before).
func TestSeat_KeepsTheLevelSeatedAt(t *testing.T) {
	s := coopRun(t)
	m := seatMember(t, s, types.CharacterInPlay{ID: uuid.New(), Name: "Wren", Class: "warrior", Level: 3})

	assert.Equal(t, 3, m.body.player.SeatedLevel)
}

// Only the settled player is sent their record; a teammate is sent nothing.
// FS-GV8WN §G R19.
func TestSettlementRecord_OnlyToTheSettledPlayer(t *testing.T) {
	s, _, _ := settlingRun(t)
	sender := &recordingSender{}
	s.sender = sender
	escapee, _ := seatedDelver(t, s, "warrior", 300, 300)
	teammate, _ := seatedDelver(t, s, "mage", 600, 300)

	s.handlePlayerEscape(escapee)

	assert.Len(t, settlementMessages(sender, escapee), 1)
	assert.Empty(t, settlementMessages(sender, teammate))
}

// A solo player's record reaches them before the run's end does, so the record
// is up to hold the return to the town. FS-GV8WN §G R23 (I-GV8WN-9 note).
func TestSettlementRecord_SoloEscape_BeforeTheRunsEnd(t *testing.T) {
	s, _, _ := settlingRun(t)
	sender := &recordingSender{}
	s.sender = sender
	solo, _ := seatedDelver(t, s, "warrior", 300, 300)

	s.handlePlayerEscape(solo)
	s.endSession()

	var order []string
	for _, m := range sender.to(solo) {
		if m.Action == string(constants.ActionSettlement) || m.Action == string(constants.ActionEndGame) {
			order = append(order, m.Action)
		}
	}
	assert.Equal(t, []string{string(constants.ActionSettlement), string(constants.ActionEndGame)}, order)
}

// The record names the run it settles, so a late confirmation is never taken
// for another run's. FS-GV8WN §G R20.
func TestSettlementRecord_NamesItsRun(t *testing.T) {
	g, _, sender := recordedSettlement(t)
	g.escape(t)

	g.s.settleEscape(g.playerID)

	assert.Equal(t, g.s.ID.String(), settlementMessages(sender, g.playerID)[0].Payload["run_id"])
}
