package game

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// TxBeginner begins the transaction the match-end outbox rows are written in.
// *sqlx.DB satisfies it.
type TxBeginner interface {
	BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error)
}

// OutboxWriter records an event in the outbox inside a caller's transaction.
type OutboxWriter interface {
	CreateOutboxTx(ctx context.Context, tx *sqlx.Tx, params commonoutbox.OutboxParams) error
}

// OutboxWaker asks the outbox worker to drain now rather than at its next
// tick, so committed match-end rows reach their consumers at once. It never
// blocks.
type OutboxWaker interface {
	Wake()
}

type service struct {
	db     TxBeginner
	outbox OutboxWriter
	waker  OutboxWaker
	writer *settlementWriter
}

// NewService builds the match-end publisher. retry is how a run's settlement
// whose write fails is held and tried again until it commits (FS-GV8WN §C R8);
// applier applies each recorded settlement in items-service at once (§D R13),
// nil for none.
func NewService(db TxBeginner, outbox OutboxWriter, waker OutboxWaker, retry SettlementRetry, applier SettlementApplier) *service {
	s := &service{
		db:     db,
		outbox: outbox,
		waker:  waker,
	}
	s.writer = newSettlementWriter(s.writeMatchEndOutbox, applier, retry)
	return s
}

func (s *service) PublishMatchComplete(ctx context.Context, data *types.RawMatchState) {
	slog.Debug("service publishingMatchComplete")

	// everyone already settled: the run's end only sweeps what is left
	// (FS-GV8WN R14, D2)
	if len(data.Players) == 0 && len(data.Progress) == 0 {
		s.publishSweep(data)
		return
	}
	// calculate winner and determine final positions
	rankedPlayers := s.rankPlayers(data.Players, data.EliminationOrder)

	// proto marshal
	protoData, err := s.formatMatchData(data.SessionID, data.StartedAt, data.EndedAt, rankedPlayers, data.Progress, commonconstants.WorldTypeRun, wholeRunExtraction(data.SettledMemberIDs))

	if err != nil {
		slog.Error("Error formatting game match end event", "session_id", data.SessionID, "error", err)
		return
	}

	ids := newSettlementIDs(data.SessionID, membersKey(settledMemberIDs(rankedPlayers, data.Progress)))

	// held until it commits: a failed write is retried, never dropped
	// (FS-GV8WN §C R8). The write does not run under ctx: it outlives the
	// caller, bounded per attempt and by the pod's lifetime.
	s.writer.settle(data.SessionID, protoData, ids, nil)
}

// PublishSettlement settles one player the moment they resolve: one pair
// carrying only them, its items.extracted partial so items-service releases
// only theirs (FS-GV8WN §A, §B R5–R6). It never blocks: the write runs on the
// settlement writer's goroutine, so the tick can call it (I-GV8WN-5).
// onConfirmed runs once items-service has applied it (§D R13, §G R20).
func (s *service) PublishSettlement(ctx context.Context, settlement *types.RawSettlement, onConfirmed func()) {
	player := settlement.Player
	result := types.RankedPlayerState{
		MemberID:        player.MemberID,
		Username:        player.Username,
		Kills:           player.Kills,
		Deaths:          player.Deaths,
		Escape:          player.Escape,
		Win:             player.Escape,
		FinalPosition:   settlement.FinalPosition,
		Equipment:       player.Equipment,
		Inventory:       player.Inventory,
		LoadoutUnknown:  player.LoadoutUnknown,
		ConsumedItemIDs: player.ConsumedItemIDs,
	}

	var progress []types.RunProgress
	if settlement.Progress.MemberID != uuid.Nil {
		progress = []types.RunProgress{settlement.Progress}
	}

	data, err := s.formatMatchData(settlement.SessionID, settlement.StartedAt, settlement.EndedAt, []types.RankedPlayerState{result}, progress, commonconstants.WorldTypeRun, partialExtraction())
	if err != nil {
		slog.Error("Error formatting a player's settlement", "session_id", settlement.SessionID, "member_id", player.MemberID, "error", err)
		return
	}

	s.writer.settleLater(settlement.SessionID, data, newSettlementIDs(settlement.SessionID, player.MemberID), onConfirmed)
}

// publishSweep writes the run's end when everyone was already settled: an
// items.extracted with no players, naming them, and no match.ended, since a
// sweep is no match result (FS-GV8WN R14, D2, D3).
func (s *service) publishSweep(data *types.RawMatchState) {
	extracted, err := proto.Marshal(&pb.ItemsExtractedEvent{
		SessionId:        data.SessionID.String(),
		EventId:          uuid.NewString(),
		SettledMemberIds: uuidStrings(data.SettledMemberIDs),
	})
	if err != nil {
		slog.Error("Error formatting a run's sweep", "session_id", data.SessionID, "error", err)
		return
	}

	s.writer.settle(data.SessionID, &types.FormattedMatchData{ItemsExtractedEvent: extracted}, newSettlementIDs(data.SessionID, sweepMemberKey), nil)
}

// Drain stops taking settlements and waits for those still held to be recorded
// or given up. Run it on shutdown, after the pod's lifetime has ended and before
// the database closes: an attempt under way may still commit, and one handed
// over after it is refused and rolls back (FS-GV8WN §C R10).
func (s *service) Drain() {
	s.writer.drain()
}

/**
* PublishFieldVisit settles an ended field visit through the run's own
* match-end write: one items.extracted and one match.ended, in one transaction,
* under the visit's own id (FS-X2F2H §F R39–R42, ADR-0031). It never goes
* through rankPlayers, which would make the visitor a winner: a visit is the
* returned result, never a win, at final position 1 (stats-service's
* match_history requires at least 1), in a field.
**/
func (s *service) PublishFieldVisit(ctx context.Context, visit FieldVisit) error {
	result := types.RankedPlayerState{
		MemberID:      visit.MemberID.String(),
		Username:      visit.Username,
		Deaths:        int32(visit.Deaths),
		FinalPosition: 1,
		Win:           false,
		Escape:        false,
		Equipment:     visit.Equipment,
		Inventory:     visit.Satchel,
	}
	progress := []types.RunProgress{{
		MemberID:    visit.MemberID,
		CharacterID: visit.CharacterID,
		Gained:      int64(visit.ExperienceGained),
	}}

	data, err := s.formatMatchData(visit.ID, visit.EnteredAt, visit.LeftAt, []types.RankedPlayerState{result}, progress, commonconstants.WorldTypeField, extractionScope{})
	if err != nil {
		return fmt.Errorf("format field visit %s: %w", visit.ID, err)
	}

	ids := newSettlementIDs(visit.ID, visit.MemberID.String())

	if err := s.writeMatchEndOutbox(ctx, data, ids); err != nil {
		return fmt.Errorf("write field visit %s to the outbox: %w", visit.ID, err)
	}

	return nil
}

// writeMatchEndOutbox writes the ItemsExtracted and GameMatchEnded rows in one
// transaction: both are recorded or neither is, so a match is never counted
// without its loot or the other way round. The rows are written under ids, so
// writing the same settlement again leaves the rows already there
// (FS-GV8WN §B R7).
func (s *service) writeMatchEndOutbox(ctx context.Context, data *types.FormattedMatchData, ids settlementIDs) (err error) {
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin match end outbox tx: %w", err)
	}
	defer func() {
		if err == nil {
			return
		}
		if rbErr := tx.Rollback(); rbErr != nil && !errors.Is(rbErr, sql.ErrTxDone) {
			err = errors.Join(err, fmt.Errorf("rollback match end outbox tx: %w", rbErr))
		}
	}()

	err = s.outbox.CreateOutboxTx(ctx, tx, commonoutbox.OutboxParams{
		ID:         ids.ItemsExtracted,
		RoutingKey: commonconstants.ItemsExtracted,
		Exchange:   commonconstants.GameEventsExchange,
		Payload:    data.ItemsExtractedEvent,
	})
	if err != nil {
		return fmt.Errorf("create items extracted outbox row: %w", err)
	}

	// a sweep carries no match result (FS-GV8WN R14)
	if data.MatchEndedEvent == nil {
		return s.commitMatchEnd(tx)
	}

	err = s.outbox.CreateOutboxTx(ctx, tx, commonoutbox.OutboxParams{
		ID:         ids.MatchEnded,
		RoutingKey: commonconstants.GameMatchEnded,
		Exchange:   commonconstants.GameEventsExchange,
		Payload:    data.MatchEndedEvent,
	})
	if err != nil {
		return fmt.Errorf("create match ended outbox row: %w", err)
	}

	return s.commitMatchEnd(tx)
}

// commitMatchEnd commits the match-end rows and wakes the outbox worker.
func (s *service) commitMatchEnd(tx *sqlx.Tx) error {
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit match end outbox tx: %w", err)
	}

	// the delver is already on the way home and will look for this loot: send
	// it now, not at the next tick; a failed send is still retried by the tick
	s.waker.Wake()

	return nil
}

/**
* Formats from raw game state to match end state, for the kind of world that
* ended (FS-X2F2H §F R43).
**/
// extractionScope is how much of the run an items.extracted covers. Build it
// with partialExtraction or wholeRunExtraction: a partial one never names
// settled members. The zero value is a whole-run event naming nobody, as a
// field visit's is.
type extractionScope struct {
	partial bool
	settled []uuid.UUID
}

// partialExtraction covers only the event's players (FS-GV8WN R6).
func partialExtraction() extractionScope {
	return extractionScope{partial: true}
}

// wholeRunExtraction covers the whole run, minus the members already settled by
// their own events (FS-GV8WN R14, D3).
func wholeRunExtraction(settled []uuid.UUID) extractionScope {
	return extractionScope{settled: settled}
}

func (s *service) formatMatchData(sessionID uuid.UUID, startedAt time.Time, endedAt time.Time, players []types.RankedPlayerState, progress []types.RunProgress, worldType string, scope extractionScope) (*types.FormattedMatchData, error) {

	// format data for marshalling as protobuf
	playerMatchRes := make([]*pb.PlayerMatchResult, len(players))

	for i, player := range players {
		playerMatchRes[i] = &pb.PlayerMatchResult{
			MemberId:      player.MemberID,
			Username:      player.Username,
			Kills:         player.Kills,
			Deaths:        player.Deaths,
			FinalPosition: player.FinalPosition,
			Win:           player.Win,
			Escape:        player.Escape,
		}
	}
	playerMatchRes = withRunProgress(playerMatchRes, progress)

	matchEndedEvent := &pb.MatchEndedEvent{
		SessionId:      string(sessionID.String()),
		MatchStartedAt: timestamppb.New(startedAt),
		MatchEndedAt:   timestamppb.New(endedAt),
		Players:        playerMatchRes,
		WorldType:      worldType,
	}

	slog.Debug("matchEndedEvent in formatMatchData before marshalling into protobuf",
		"match_ended_event", matchEndedEvent,
	)

	// marshal to protobuf
	protoData, matchEndedErr := proto.Marshal(matchEndedEvent)

	if matchEndedErr != nil {
		slog.Error("could not marshal end match data to MatchEndedEvent proto",
			"session_id", sessionID,
			"error", matchEndedErr,
		)
	}

	playerItems := make([]*pb.PlayerItems, len(players))

	for idx, player := range players {
		playerItems[idx] = &pb.PlayerItems{
			MemberId: player.MemberID,
			Equipment: &pb.Equipment{
				Weapon:       extractedItemToPb(player.Equipment.WeaponSlot),
				Head:         extractedItemToPb(player.Equipment.HeadSlot),
				Chest:        extractedItemToPb(player.Equipment.ChestSlot),
				Gloves:       extractedItemToPb(player.Equipment.GlovesSlot),
				Legs:         extractedItemToPb(player.Equipment.LegsSlot),
				Ring_1:       extractedItemToPb(player.Equipment.Ring1Slot),
				Ring_2:       extractedItemToPb(player.Equipment.Ring2Slot),
				Consumable_1: extractedItemToPb(player.Equipment.Consumable1),
				Consumable_2: extractedItemToPb(player.Equipment.Consumable2),
				Consumable_3: extractedItemToPb(player.Equipment.Consumable3),
			},
			Inventory: extractedInventoryToPb(player.Inventory),
			// an unread loadout must never be settled as an empty one
			LoadoutUnknown:  player.LoadoutUnknown,
			ConsumedItemIds: uuidStrings(player.ConsumedItemIDs),
		}
	}

	// generate eventId for idemptotency deduplication
	eventId := uuid.NewString()

	itemsExtractedEvent := &pb.ItemsExtractedEvent{
		SessionId:        string(sessionID.String()),
		EventId:          eventId,
		PlayerItems:      playerItems,
		Partial:          scope.partial,
		SettledMemberIds: uuidStrings(scope.settled),
	}

	slog.Debug("itemsExtractedEvent in formatMatchData before marshalling into protobuf",
		"items_extracted_event", itemsExtractedEvent,
	)

	itemsExtractedProtoData, itemsExtractErr := proto.Marshal(itemsExtractedEvent)

	if itemsExtractErr != nil {
		slog.Error("could not marshal items extracted event to ItemExtractedEvent proto",
			"session_id", sessionID,
			"error", itemsExtractErr,
		)
	}

	if matchEndedErr != nil && itemsExtractErr != nil {
		return nil, matchEndedErr
	}

	data := &types.FormattedMatchData{
		MatchEndedEvent:     protoData,
		ItemsExtractedEvent: itemsExtractedProtoData,
	}

	return data, nil
}

// settledMemberIDs is every member a run's settlement pair carries: the ranked
// players, and members removed before the end who still earned experience
// (withRunProgress adds those to match.ended).
func settledMemberIDs(players []types.RankedPlayerState, progress []types.RunProgress) []string {
	memberIDs := make([]string, 0, len(players)+len(progress))
	for _, player := range players {
		if player.MemberID != "" {
			memberIDs = append(memberIDs, player.MemberID)
		}
	}
	for _, p := range progress {
		memberIDs = append(memberIDs, p.MemberID.String())
	}
	return memberIDs
}

// withRunProgress puts each character's run experience on its member's result,
// and adds a result for a member removed before the end, who has no ranking but
// earned experience all the same. FS-BDA7X §Requirements 22–23.
func withRunProgress(results []*pb.PlayerMatchResult, progress []types.RunProgress) []*pb.PlayerMatchResult {
	byMember := make(map[string]*pb.PlayerMatchResult, len(results))
	for _, result := range results {
		byMember[result.MemberId] = result
	}

	for _, p := range progress {
		result, ranked := byMember[p.MemberID.String()]
		if !ranked {
			result = &pb.PlayerMatchResult{MemberId: p.MemberID.String()}
			results = append(results, result)
		}
		result.CharacterId = p.CharacterID.String()
		result.ExperienceGained = p.Gained
	}

	return results
}

/**
* Ranks players with a final position plus determine and mark winner.
**/
func (s *service) rankPlayers(players []types.RawPlayerState, eliminationOrder map[uuid.UUID]int) []types.RankedPlayerState {
	// determine winner and other business logic
	rankedPlayers := make([]types.RankedPlayerState, len(players))

	for idx, player := range players {
		memberID, err := uuid.Parse(player.MemberID)

		if err != nil {
			slog.Debug("Player memberID not a uuid, couldn't parse",
				"memberID", memberID)
			continue
		}

		position, exists := eliminationOrder[memberID]

		rankedPlayer := types.RankedPlayerState{
			MemberID: player.MemberID,
			Username: player.Username,
			Kills:    player.Kills,
			Deaths:   player.Deaths,
			Escape:   player.Escape,
			// what the delver brings out; dropping it here lost every extraction
			Equipment:       player.Equipment,
			Inventory:       player.Inventory,
			LoadoutUnknown:  player.LoadoutUnknown,
			ConsumedItemIDs: player.ConsumedItemIDs,
		}

		// determining final positions
		// total number of players minus their stored elimination order position
		rankedPlayer.FinalPosition = int32(len(players) - position)

		// determine winner. someone who doesnt exist in the elimination order slice
		// is the surivor and hence the winner
		if !exists {
			rankedPlayer.Win = true
			rankedPlayer.FinalPosition = 1
		}

		rankedPlayers[idx] = rankedPlayer
	}

	return rankedPlayers
}

// uuidStrings is each id in its canonical string form, nil for none.
func uuidStrings(ids []uuid.UUID) []string {
	if len(ids) == 0 {
		return nil
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = id.String()
	}
	return strs
}

func extractedItemToPb(item *types.ExtractedItem) *pb.Item {
	if item == nil {
		return nil
	}
	return &pb.Item{
		InstanceId:      instanceIDToString(item.InstanceID),
		RarityId:        item.RarityID,
		TemplateId:      item.TemplateID.String(),
		ItemType:        item.ItemType,
		Name:            item.Name,
		AttackPower:     int32(item.AttackPower),
		CriticalRate:    item.CriticalRate,
		WeaponType:      item.WeaponType,
		DefenseRating:   int32(item.DefenseRating),
		MagicResistance: int32(item.MagicResistance),
		ArmorSlot:       item.ArmorSlot,
		HealingAmount:   int32(item.HealingAmount),
		ManaAmount:      int32(item.ManaAmount),
		BuffDuration:    int32(item.BuffDuration),
		BuyPrice:        int32(item.BuyPrice),
		SellPrice:       int32(item.SellPrice),
		Description:     item.Description,
		ItemLevel:       int32(item.ItemLevel),
		RequiredLevel:   int32(item.RequiredLevel),
		Affixes:         extractedAffixesToPb(item.Affixes),
	}
}

func extractedAffixesToPb(affixes []types.Affix) []*pb.ItemAffix {
	if len(affixes) == 0 {
		return nil
	}
	out := make([]*pb.ItemAffix, 0, len(affixes))
	for _, a := range affixes {
		out = append(out, &pb.ItemAffix{Stat: a.Stat, Tier: int32(a.Tier), Value: int32(a.Value)})
	}
	return out
}

// instanceIDToString returns the canonical UUID string for a known instance
// or "" for items rolled inmatch. The consumer treats empty as "create new".
func instanceIDToString(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}

func extractedInventoryToPb(inventory []*types.ExtractedItem) []*pb.Item {
	items := make([]*pb.Item, 0, len(inventory))
	for _, item := range inventory {
		if pbItem := extractedItemToPb(item); pbItem != nil {
			items = append(items, pbItem)
		}
	}
	return items
}
