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

type service struct {
	db     TxBeginner
	outbox OutboxWriter
}

func NewService(db TxBeginner, outbox OutboxWriter) *service {
	return &service{
		db:     db,
		outbox: outbox,
	}
}

func (s *service) PublishMatchComplete(ctx context.Context, data *types.RawMatchState) {
	slog.Debug("service publishingMatchComplete")
	// calculate winner and determine final positions
	rankedPlayers := s.rankPlayers(data.Players, data.EliminationOrder)

	// proto marshal
	protoData, err := s.formatMatchData(data.SessionID, data.StartedAt, data.EndedAt, rankedPlayers, data.Progress, commonconstants.WorldTypeRun)

	if err != nil {
		slog.Error("Error formatting game match end event", "session_id", data.SessionID, "error", err)
		return
	}

	if err := s.writeMatchEndOutbox(ctx, protoData); err != nil {
		slog.Error("Error writing match end events to the outbox, rows may not have been recorded",
			"session_id", data.SessionID,
			"error", err,
		)
		return
	}

	slog.Debug("Successfully created outbox item for two events",
		"event_one_name", commonconstants.GameMatchEnded,
		"event_two_name", commonconstants.ItemsExtracted,
	)
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

	data, err := s.formatMatchData(visit.ID, visit.EnteredAt, visit.LeftAt, []types.RankedPlayerState{result}, progress, commonconstants.WorldTypeField)
	if err != nil {
		return fmt.Errorf("format field visit %s: %w", visit.ID, err)
	}

	if err := s.writeMatchEndOutbox(ctx, data); err != nil {
		return fmt.Errorf("write field visit %s to the outbox: %w", visit.ID, err)
	}

	return nil
}

// writeMatchEndOutbox writes the ItemsExtracted and GameMatchEnded rows in one
// transaction: both are recorded or neither is, so a match is never counted
// without its loot or the other way round.
func (s *service) writeMatchEndOutbox(ctx context.Context, data *types.FormattedMatchData) (err error) {
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
		RoutingKey: commonconstants.ItemsExtracted,
		Exchange:   commonconstants.GameEventsExchange,
		Payload:    data.ItemsExtractedEvent,
	})
	if err != nil {
		return fmt.Errorf("create items extracted outbox row: %w", err)
	}

	err = s.outbox.CreateOutboxTx(ctx, tx, commonoutbox.OutboxParams{
		RoutingKey: commonconstants.GameMatchEnded,
		Exchange:   commonconstants.GameEventsExchange,
		Payload:    data.MatchEndedEvent,
	})
	if err != nil {
		return fmt.Errorf("create match ended outbox row: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit match end outbox tx: %w", err)
	}

	return nil
}

/**
* Formats from raw game state to match end state, for the kind of world that
* ended (FS-X2F2H §F R43).
**/
func (s *service) formatMatchData(sessionID uuid.UUID, startedAt time.Time, endedAt time.Time, players []types.RankedPlayerState, progress []types.RunProgress, worldType string) (*types.FormattedMatchData, error) {

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
			LoadoutUnknown: player.LoadoutUnknown,
		}
	}

	// generate eventId for idemptotency deduplication
	eventId := uuid.NewString()

	itemsExtractedEvent := &pb.ItemsExtractedEvent{
		SessionId:   string(sessionID.String()),
		EventId:     eventId,
		PlayerItems: playerItems,
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
			Equipment:      player.Equipment,
			Inventory:      player.Inventory,
			LoadoutUnknown: player.LoadoutUnknown,
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
