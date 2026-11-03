package game

import (
	"context"
	"log/slog"
	"maps"
	"slices"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// takenOut picks, from every item in the world, the items a body takes out.
type takenOut func(items map[uuid.UUID]*components.ItemComponent) map[uuid.UUID]*components.ItemComponent

// everything is what an escape takes out: worn and carried, finds included.
func everything(items map[uuid.UUID]*components.ItemComponent) map[uuid.UUID]*components.ItemComponent {
	return items
}

// settleEscape settles a member the moment they escape, with everything they
// hold. FS-GV8WN §A R1–R2.
func (s *Session) settleEscape(playerID uuid.UUID) {
	s.settle(playerID, everything)
}

// settleDeath settles a member as a death: on the tick they fall, or when
// removed while in play, which counts as one. Their unsafe finds are lost
// (FS-18Z5F §E R23). FS-GV8WN §A R1–R2.
func (s *Session) settleDeath(playerID uuid.UUID) {
	s.settle(playerID, safeItems)
}

// settle snapshots a member and hands their settlement off. Each member is
// settled once; anyone already settled, a world that is not a run, or a run
// already ended settles nobody. FS-GV8WN §A R1–R4.
func (s *Session) settle(playerID uuid.UUID, held takenOut) {
	s.mu.Lock()
	settlement, record, ok := s.takeSettlementLocked(playerID, held)
	s.mu.Unlock()
	if ok {
		s.handOff(settlement, record)
	}
}

// takeSettlementLocked snapshots a member's settlement and marks them settled,
// in one step under the world's lock, so their body cannot be removed between
// the two. A body that cannot be snapshotted is not marked: the run's end
// settles it instead, as before (FS-GV8WN Edge States). Callers hold the
// world's lock, on the tick or with no tick running.
func (s *Session) takeSettlementLocked(playerID uuid.UUID, held takenOut) (types.RawSettlement, settlementRecord, bool) {
	if !s.needsSettlingLocked(playerID) {
		return types.RawSettlement{}, settlementRecord{}, false
	}

	body, exists := s.EntityManager.GetEntity(s.playerIDToEntitiesID[playerID])
	if !exists {
		slog.Error("Settlement not taken: the member's body is gone, the run's end settles them",
			"session_id", s.ID, "member_id", playerID)
		return types.RawSettlement{}, settlementRecord{}, false
	}
	all := worldItems(s.EntityManager.GetAllEntities())
	takenOut := held(all)
	raw, ok := s.rawPlayerStateOf(body, takenOut)
	if !ok {
		slog.Error("Settlement not taken: the member's body could not be read, the run's end settles them",
			"session_id", s.ID, "member_id", playerID)
		return types.RawSettlement{}, settlementRecord{}, false
	}

	s.settled[playerID] = struct{}{}
	now := time.Now()
	settlement := types.RawSettlement{
		SessionID:     s.ID,
		StartedAt:     now,
		EndedAt:       now,
		Player:        raw,
		Progress:      s.progressOf(playerID, body),
		FinalPosition: s.finalPositionLocked(playerID),
	}
	return settlement, s.settlementRecordOf(body, all, takenOut, settlement, now), true
}

// needsSettlingLocked reports whether a member is seated in this run, still
// running, and not settled yet. Callers hold the world's lock.
func (s *Session) needsSettlingLocked(playerID uuid.UUID) bool {
	if s.worldType != types.WorldTypeRun || s.closed {
		return false
	}
	if _, done := s.settled[playerID]; done {
		return false
	}
	_, seated := s.playerIDToEntitiesID[playerID]
	return seated
}

// handOff applies a settled member's progress to their village seat at once
// (R3), sends them their settlement record, pending (§G R19), and publishes
// their settlement without waiting on the database; once it is applied they
// are sent the record again, confirmed (R20). The record goes before anything
// the run's end sends, since a settlement is taken on the tick and the end is
// signalled after it.
func (s *Session) handOff(settlement types.RawSettlement, record settlementRecord) {
	member := settlement.Progress.MemberID
	s.sessionCloser.ApplyRunProgress([]types.RunProgress{settlement.Progress})
	sendSettlementRecord(s.sender, s.ID, member, record, types.SettlementStatusPending)
	// the confirmation may come long after this world is torn down: it holds
	// only what it sends, never the session
	sender, runID := s.sender, s.ID
	s.eventEmitter.PublishSettlement(context.Background(), &settlement, func() {
		sendSettlementRecord(sender, runID, member, record, types.SettlementStatusConfirmed)
	})
}

// settlementRecord is what a settled player is told of their settlement
// (FS-GV8WN §G R19), taken with it from their body.
type settlementRecord struct {
	outcome          string
	carried          []types.SettlementCarriedItem
	lost             []types.SettlementLostItem
	experienceGained int64
	levelBefore      int
	levelAfter       int
	kills            int
	secondsInRun     int
}

// settlementRecordOf reads a settled body's record: every item it wears or
// carries, carried out if taken out and lost otherwise (an unsafe find on a
// death), and the stored potions it drank, lost as used up. Callers hold the
// world's lock.
func (s *Session) settlementRecordOf(body *ecs.Entity, all, takenOut map[uuid.UUID]*components.ItemComponent, settlement types.RawSettlement, now time.Time) settlementRecord {
	record := settlementRecord{
		outcome:          types.SettlementOutcomeDied,
		carried:          []types.SettlementCarriedItem{},
		lost:             []types.SettlementLostItem{},
		experienceGained: settlement.Progress.Gained,
		levelAfter:       settlement.Progress.Level,
		kills:            int(settlement.Player.Kills),
	}
	if settlement.Player.Escape {
		record.outcome = types.SettlementOutcomeEscaped
	}
	if pc, ok := body.GetComponent(ecs.ComponentTypePlayer); ok {
		record.levelBefore = pc.(*components.PlayerComponent).SeatedLevel
	}
	if !s.startedAt.IsZero() {
		record.secondsInRun = int(now.Sub(s.startedAt).Seconds())
	}

	for _, entityID := range bodyItemIDs(body) {
		item, ok := all[entityID]
		if !ok {
			continue
		}
		state := *serializer.ItemStateOf(item.TemplateID, entityID, item)
		if _, kept := takenOut[entityID]; kept {
			record.carried = append(record.carried, types.SettlementCarriedItem{ItemState: state, Found: item.Unsafe})
			continue
		}
		record.lost = append(record.lost, types.SettlementLostItem{ItemState: state, Reason: types.SettlementLostUnsafe})
	}
	if pc, ok := body.GetComponent(ecs.ComponentTypePotion); ok {
		for _, drunk := range pc.(*components.PotionComponent).Consumed {
			state := *serializer.ItemStateOf(drunk.Item.TemplateID, uuid.Nil, &drunk.Item)
			record.lost = append(record.lost, types.SettlementLostItem{ItemState: state, Reason: types.SettlementLostConsumed})
		}
	}
	return record
}

// bodyItemIDs is every item entity a body wears, slot by slot, then carries.
func bodyItemIDs(body *ecs.Entity) []uuid.UUID {
	var ids []uuid.UUID
	if ec, ok := body.GetComponent(ecs.ComponentTypeEquipment); ok {
		equipment := ec.(*components.EquipmentComponent)
		for _, slot := range systems.EquipmentSlots {
			if id := *slot.Holder(equipment); id != nil {
				ids = append(ids, *id)
			}
		}
	}
	if lc, ok := body.GetComponent(ecs.ComponentTypeItemIDList); ok {
		ids = append(ids, lc.(*components.ItemIDListComponent).ItemIDs...)
	}
	return ids
}

// sendSettlementRecord sends a settled player their record with status. It
// names the run it settles, so a confirmation landing after the player is in
// another run is not taken for that run's (FS-GV8WN §G R20). A player no longer
// connected (one removed after a drop) gets nothing; with no sender, nobody
// does.
func sendSettlementRecord(sender SessionSender, runID, playerID uuid.UUID, record settlementRecord, status string) {
	if sender == nil {
		return
	}
	err := sender.SendMessageToPlayer(playerID, types.Message{
		Action: string(constants.ActionSettlement),
		Payload: map[string]interface{}{
			"run_id":            runID.String(),
			"outcome":           record.outcome,
			"carried":           record.carried,
			"lost":              record.lost,
			"experience_gained": record.experienceGained,
			"level_before":      record.levelBefore,
			"level_after":       record.levelAfter,
			"kills":             record.kills,
			"seconds_in_run":    record.secondsInRun,
			"status":            status,
		},
	})
	if err == nil {
		return
	}
	// a pending record not delivered is a player already gone; a confirmed one
	// is a confirmation the player never saw
	if status == types.SettlementStatusConfirmed {
		slog.Info("Settlement confirmation not delivered", "session_id", runID, "member_id", playerID, "error", err)
		return
	}
	slog.Debug("Settlement record not sent", "session_id", runID, "member_id", playerID, "error", err)
}

// finalPositionLocked is where a member's resolution placed them, counted as
// the run's end counts it: 1 for anyone who did not fall, otherwise the
// number of seats less their fall's order. A member removed in play without
// falling is placed as the next to fall. Callers hold the world's lock.
func (s *Session) finalPositionLocked(playerID uuid.UUID) int32 {
	seats := len(s.playerIDToEntitiesID)
	if order, fell := s.eliminations[playerID]; fell {
		return int32(seats - order)
	}
	if pc, ok := s.playerComponentLocked(playerID); ok && pc.Escape {
		return 1
	}
	return int32(seats - len(s.eliminations))
}

// playerComponentLocked is a seated member's player component. Callers hold
// the world's lock.
func (s *Session) playerComponentLocked(playerID uuid.UUID) (*components.PlayerComponent, bool) {
	entity, exists := s.EntityManager.GetEntity(s.playerIDToEntitiesID[playerID])
	if !exists {
		return nil, false
	}
	pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
	if !ok {
		return nil, false
	}
	return pc.(*components.PlayerComponent), true
}

// progressOf is what the run did to one member's character: what they earned
// and where their body stands now. FS-BDA7X §Requirements 22–24.
func (s *Session) progressOf(playerID uuid.UUID, body *ecs.Entity) types.RunProgress {
	progress := types.RunProgress{MemberID: playerID}
	for _, gain := range s.runExperience.Gains() {
		if gain.MemberID == playerID {
			progress.CharacterID = gain.CharacterID
			progress.Gained = int64(gain.Amount)
		}
	}
	pc, hasPlayer := body.GetComponent(ecs.ComponentTypePlayer)
	sc, hasStats := body.GetComponent(ecs.ComponentTypeStats)
	if hasPlayer && hasStats {
		stats := sc.(*components.StatsComponent)
		progress.CharacterID = pc.(*components.PlayerComponent).CharacterID
		progress.Seated = true
		progress.Level = stats.Level
		progress.Experience = int64(stats.Experience)
	}
	return progress
}

// beginRunEndSettlement is the run's end taking over settlement, in one step:
// it returns who was settled before it, and marks every member still seated
// as settled by it, so their leaving on the way home settles nobody again.
// FS-GV8WN §E R14 (D3).
func (s *Session) beginRunEndSettlement() map[uuid.UUID]struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	before := maps.Clone(s.settled)
	for member := range s.playerIDToEntitiesID {
		s.settled[member] = struct{}{}
	}
	return before
}

// settledIDs is a settled set as a sorted list, as the run's end names it.
func settledIDs(settled map[uuid.UUID]struct{}) []uuid.UUID {
	ids := slices.Collect(maps.Keys(settled))
	slices.SortFunc(ids, func(a, b uuid.UUID) int { return slices.Compare(a[:], b[:]) })
	return ids
}
