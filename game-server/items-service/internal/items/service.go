package items

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/events"
	commonbroker "github.com/darkphotonKN/barrowspire-server/common/broker"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	commonoutbox "github.com/darkphotonKN/barrowspire-server/common/outbox"
	commonutils "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/darkphotonKN/barrowspire-server/items-service/internal/types"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type service struct {
	repo            Repository
	db              *sqlx.DB
	publishCh       commonbroker.Publisher
	outboxPublisher commonoutbox.OutboxPublisher
	// withTx runs fn in one transaction on db, committing when fn succeeds.
	withTx func(ctx context.Context, fn func(tx *sqlx.Tx) error) error
}

func NewService(repo Repository, db *sqlx.DB, publishCh commonbroker.Publisher, outboxPublisher commonoutbox.OutboxPublisher) *service {
	return &service{
		repo:            repo,
		db:              db,
		publishCh:       publishCh,
		outboxPublisher: outboxPublisher,
		withTx: func(ctx context.Context, fn func(tx *sqlx.Tx) error) error {
			return commonutils.ExecTx(ctx, db, nil, fn)
		},
	}
}

type Repository interface {
	// ItemType operations
	CreateItemType(ctx context.Context, itemType *ItemType) error
	GetItemTypeByID(ctx context.Context, id uuid.UUID) (*ItemType, error)
	GetItemTypeByCode(ctx context.Context, code string) (*ItemType, error)
	ListItemTypes(ctx context.Context) ([]*ItemType, error)

	// ItemRarity operations
	CreateItemRarity(ctx context.Context, rarity *ItemRarity) error
	GetItemRarityByID(ctx context.Context, id uuid.UUID) (*ItemRarity, error)
	GetItemRarityByCode(ctx context.Context, code string) (*ItemRarity, error)
	ListItemRarities(ctx context.Context) ([]*ItemRarity, error)

	// Weapon operations
	CreateWeapon(ctx context.Context, weapon *Weapon) error
	GetWeaponByID(ctx context.Context, id uuid.UUID) (*Weapon, error)
	ListWeapons(ctx context.Context) ([]*Weapon, error)

	// Weapon operations with item template (JOIN queries)
	GetWeaponWithTemplateByID(ctx context.Context, id uuid.UUID) (*WeaponWithTemplate, error)
	ListWeaponsWithTemplate(ctx context.Context) ([]*WeaponWithTemplate, error)

	// Armor operations with item template (JOIN queries)
	ListArmorsWithTemplate(ctx context.Context) ([]*ArmorWithTemplate, error)

	// Consumable operations with item template (JOIN queries)
	ListConsumablesWithTemplate(ctx context.Context) ([]*ConsumableWithTemplate, error)

	// Armor operations
	CreateArmor(ctx context.Context, armor *Armor) error
	GetArmorByID(ctx context.Context, id uuid.UUID) (*Armor, error)
	ListArmors(ctx context.Context) ([]*Armor, error)

	// Consumable operations
	CreateConsumable(ctx context.Context, consumable *Consumable) error
	GetConsumableByID(ctx context.Context, id uuid.UUID) (*Consumable, error)
	ListConsumables(ctx context.Context) ([]*Consumable, error)

	// ItemTemplate operations
	CreateItemTemplate(ctx context.Context, template *ItemTemplate) error
	GetItemTemplateByID(ctx context.Context, id uuid.UUID) (*ItemTemplate, error)
	GetItemTemplateByCode(ctx context.Context, code string) (*ItemTemplate, error)
	ListItemTemplates(ctx context.Context) ([]*ItemTemplate, error)
	ListItemTemplateAggregates(ctx context.Context) ([]*ItemTemplateAggregate, error)

	// Transaction aware create methods (for CreateComplete* flows)
	CreateWeaponTx(ctx context.Context, tx *sqlx.Tx, weapon *Weapon) error
	CreateArmorTx(ctx context.Context, tx *sqlx.Tx, armor *Armor) error
	CreateConsumableTx(ctx context.Context, tx *sqlx.Tx, consumable *Consumable) error
	CreateItemTemplateTx(ctx context.Context, tx *sqlx.Tx, template *ItemTemplate) error

	GetLoadout(ctx context.Context, req *GetLoadoutRequest) (*Loadout, error)
	GetItemInstanceByID(ctx context.Context, id uuid.UUID) (*ItemInstance, error)
	ListItemInstances(ctx context.Context, req *ListItemInstancesRequest) ([]*ItemInstance, error)
	UpsertLoadoutSlot(ctx context.Context, req *UpdateLoadoutRequest) error
	UpsertPlayerLoadoutTx(ctx context.Context, tx *sqlx.Tx, req *UpsertPlayerLoadoutRequest) error
	UpsertItemInstanceTx(ctx context.Context, tx *sqlx.Tx, instance *ItemInstance) error
	BatchUpsertItemInstances(ctx context.Context, tx *sqlx.Tx, instances []*ItemInstance) error

	// marketplace
	ReserveItemTx(ctx context.Context, tx *sqlx.Tx, sellerID, itemID, listingID uuid.UUID, updatedAt, reservedAt time.Time) (*ItemInstance, error)
	ListStaleReserved(ctx context.Context, reserveBefore time.Time) ([]*uuid.UUID, error)
	CancelReservation(ctx context.Context, itemID uuid.UUID) (bool, error)
	FreezeItem(ctx context.Context, itemID, sellerID uuid.UUID) (bool, error)

	// public item facts, for listing pages
	GetItemSummaries(ctx context.Context, ids []uuid.UUID) ([]*ItemSummary, error)
	ReturnItem(ctx context.Context, id, listingID uuid.UUID) error
}

func (s *service) CreateItemInstance(createItemInstanceReq *ItemInstance) (*ItemInstance, error) {
	return nil, nil
}

func (s *service) CreatePlayerLoadout(createPlayerLoadoutReq *PlayerLoadout) error {
	return nil
}

// ProcessItemsExtracted stores every player's extracted items and equipped
// loadout in one transaction, so a requeued event replays from nothing rather
// than duplicating the items found in a run. An item that cannot be stored on
// its own (no template, bad affix) is skipped with a warning; any other failure
// is returned, transient or not, for the consumer to settle (FS-4R9M9 R49, R50).
func (s *service) ProcessItemsExtracted(ctx context.Context, req *pb.ItemsExtractedEvent) error {
	var writeErr error
	err := s.withTx(ctx, func(tx *sqlx.Tx) error {
		for _, playerItems := range req.PlayerItems {
			if writeErr = s.storeExtractedPlayerItems(ctx, tx, playerItems); writeErr != nil {
				return writeErr
			}
		}
		return nil
	})
	switch {
	case err == nil:
		return nil
	case writeErr == nil:
		// no write failed, the transaction around them did (begin or commit):
		// the store, not the event, is at fault
		return fmt.Errorf("transaction for items extracted %s: %w: %w", req.EventId, commonconstants.ErrTransient, err)
	default:
		return fmt.Errorf("store items extracted %s: %w", req.EventId, err)
	}
}

// storeExtractedPlayerItems writes one player's extracted items and loadout.
func (s *service) storeExtractedPlayerItems(ctx context.Context, tx *sqlx.Tx, playerItems *pb.PlayerItems) error {
	slog.Debug("single player iterated from req.PlayerItems",
		"member_id", playerItems.GetMemberId(),
		"equipment", playerItems.GetEquipment(),
		"inventory", playerItems.GetInventory(),
	)

	memberId, err := uuid.Parse(playerItems.GetMemberId())
	if err != nil {
		return fmt.Errorf("member id %q: %w: %w", playerItems.GetMemberId(), commonconstants.ErrUUIDCouldNotBeParsed, err)
	}

	// convert inventory and equipment into item instances
	invItemInstances, err := s.MapProtoItemToItemInstances(memberId, playerItems.GetInventory())
	if err != nil {
		return fmt.Errorf("map inventory of member %s: %w", memberId, err)
	}

	equipItemInstances, upsertParams, err := s.MapProtoEquipmentToItemInstances(memberId, playerItems.GetEquipment())
	if err != nil {
		return fmt.Errorf("map equipment of member %s: %w", memberId, err)
	}

	allItemInstances := append(equipItemInstances, invItemInstances...)

	if err := s.repo.BatchUpsertItemInstances(ctx, tx, allItemInstances); err != nil {
		return fmt.Errorf("upsert extracted items of member %s: %w", memberId, err)
	}

	// upsert player loadout with equipment ids
	if err := s.repo.UpsertPlayerLoadoutTx(ctx, tx, upsertParams); err != nil {
		return fmt.Errorf("upsert loadout of member %s: %w", memberId, err)
	}
	return nil
}

/**
* Converts the equipped items, equipment, extracted from items.extracted event into ItemInstance entities for
* updating the item instance table and formatted into PlayerLoadout for updating player_loadouts table.
* Nil equipment means nothing equipped: the proto getters are nil-safe.
**/
func (s *service) MapProtoEquipmentToItemInstances(memberID uuid.UUID, equipmentProto *pb.Equipment) ([]*ItemInstance, *UpsertPlayerLoadoutRequest, error) {
	// holds both existing ids and new ids
	playerLoadoutParam := &UpsertPlayerLoadoutRequest{
		MemberID: memberID,
	}

	itemInstances := make([]*ItemInstance, 0)

	// convert each item invidually to maintain mapping
	chestInstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetChest())
	if err == nil {
		// update
		playerLoadoutParam.ChestInstanceID = &chestInstanceItem.ID
		itemInstances = append(itemInstances, chestInstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert chest item to instanceItem.",
			"error", err,
		)
	}

	weaponInstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetWeapon())

	if err == nil {
		playerLoadoutParam.WeaponInstanceID = &weaponInstanceItem.ID
		itemInstances = append(itemInstances, weaponInstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert weapon item to instanceItem.",
			"error", err,
		)
	}

	headInstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetHead())
	if err == nil {
		playerLoadoutParam.HeadInstanceID = &headInstanceItem.ID
		itemInstances = append(itemInstances, headInstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert head item to instanceItem.",
			"error", err,
		)
	}

	glovesInstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetGloves())
	if err == nil {
		playerLoadoutParam.GlovesInstanceID = &glovesInstanceItem.ID
		itemInstances = append(itemInstances, glovesInstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert gloves item to instanceItem.",
			"error", err,
		)
	}

	legsInstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetLegs())
	if err == nil {
		playerLoadoutParam.LegsInstanceID = &legsInstanceItem.ID
		itemInstances = append(itemInstances, legsInstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert legs item to instanceItem.",
			"error", err,
		)
	}

	ring1InstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetRing_1())
	if err == nil {
		playerLoadoutParam.Ring1InstanceID = &ring1InstanceItem.ID
		itemInstances = append(itemInstances, ring1InstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert ring_1 item to instanceItem.",
			"error", err,
		)
	}

	ring2InstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetRing_2())
	if err == nil {
		playerLoadoutParam.Ring2InstanceID = &ring2InstanceItem.ID
		itemInstances = append(itemInstances, ring2InstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert ring_2 item to instanceItem.",
			"error", err,
		)
	}

	consumable1InstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetConsumable_1())
	if err == nil {
		playerLoadoutParam.Consumable1ID = &consumable1InstanceItem.ID
		itemInstances = append(itemInstances, consumable1InstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert consumable_1 item to instanceItem.",
			"error", err,
		)
	}

	consumable2InstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetConsumable_2())
	if err == nil {
		playerLoadoutParam.Consumable2ID = &consumable2InstanceItem.ID
		itemInstances = append(itemInstances, consumable2InstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert consumable_2 item to instanceItem.",
			"error", err,
		)
	}

	consumable3InstanceItem, err := s.ConvertSingleProtoItemtoItemInstance(memberID, equipmentProto.GetConsumable_3())
	if err == nil {
		playerLoadoutParam.Consumable3ID = &consumable3InstanceItem.ID
		itemInstances = append(itemInstances, consumable3InstanceItem)
	} else {
		if errors.Is(err, commonconstants.ErrUUIDCouldNotBeParsed) {
			return nil, nil, err
		}
		slog.Warn("Couldn't convert consumable_3 item to instanceItem.",
			"error", err,
		)
	}

	slog.Debug("Completed building playerloadoutParam and itemInstances",
		"item_instances", itemInstances,
		"player_loadout_param", playerLoadoutParam,
	)

	return itemInstances, playerLoadoutParam, nil
}

// ConvertSingleProtoItemtoItemInstance maps one extracted item to the row the
// member now owns. An item found in the run (no instance id) gets a new id; a
// brought-in item keeps its own, and the upsert keeps its stored owner, source,
// status and roll (FS-4R9M9 R20, R53). An item without a template cannot be
// stored and is refused.
func (s *service) ConvertSingleProtoItemtoItemInstance(memberID uuid.UUID, protoItem *pb.Item) (*ItemInstance, error) {
	if protoItem == nil {
		slog.Debug("Nothing to convert, protoItem was nil")
		return nil, fmt.Errorf("nil pb.Item cant be converted into ItemInstance.")
	}

	templateID, err := uuid.Parse(protoItem.TemplateId)
	if err != nil {
		return nil, fmt.Errorf("extracted item %q has no usable template_id %q: %w", protoItem.Name, protoItem.TemplateId, err)
	}

	var itemId uuid.UUID
	if protoItem.InstanceId == "" {
		itemId = uuid.New()
	} else {
		itemId, err = uuid.Parse(protoItem.InstanceId)
		if err != nil {
			slog.Error("error parsing protoItem's instanceID",
				"instance_id", protoItem.InstanceId,
			)
			return nil, commonconstants.ErrUUIDCouldNotBeParsed
		}
	}

	description := protoItem.Description

	// empty rarity_id = no rarity (NULL); a malformed one keeps the item, NULL rarity
	var rarityID *uuid.UUID
	if protoItem.RarityId != "" {
		if parsed, err := uuid.Parse(protoItem.RarityId); err == nil {
			rarityID = &parsed
		} else {
			slog.Warn("malformed rarity_id on extracted item, storing NULL rarity",
				"rarity_id", protoItem.RarityId,
			)
		}
	}

	item := &ItemInstance{
		ID:            itemId,
		TemplateID:    templateID,
		OwnerMemberID: memberID,
		Source:        "extracted",
		Status:        "AVAILABLE",
		ItemType:      protoItem.ItemType,
		Name:          protoItem.Name,
		RarityID:      rarityID,
		Description:   &description,
		ItemLevel:     max(int(protoItem.ItemLevel), 1),
		RequiredLevel: max(int(protoItem.RequiredLevel), 0),
		Affixes:       wellFormedAffixes(itemId, protoItem.Affixes),
	}
	setTypedStats(item, protoItem)

	return item, nil
}

// setTypedStats stores only the stat columns of the item's own type; every
// other stat stays NULL, so a weapon never carries a 0 defense or healing. A
// ring has no base stats (FS-4R9M9 R5). Only armor has a slot, as
// item_instances_armor_slot_check demands.
func setTypedStats(item *ItemInstance, protoItem *pb.Item) {
	switch protoItem.ItemType {
	case "weapon":
		attackPower, criticalRate, weaponType := int(protoItem.AttackPower), protoItem.CriticalRate, protoItem.WeaponType
		item.AttackPower, item.CriticalRate, item.WeaponType = &attackPower, &criticalRate, &weaponType
	case "armor":
		defenseRating, magicResistance := int(protoItem.DefenseRating), int(protoItem.MagicResistance)
		item.DefenseRating, item.MagicResistance = &defenseRating, &magicResistance
		if protoItem.ArmorSlot != "" {
			armorSlot := protoItem.ArmorSlot
			item.ArmorSlot = &armorSlot
		}
	case "consumable":
		healingAmount, manaAmount, buffDuration := int(protoItem.HealingAmount), int(protoItem.ManaAmount), int(protoItem.BuffDuration)
		item.HealingAmount, item.ManaAmount, item.BuffDuration = &healingAmount, &manaAmount, &buffDuration
	}
}

// wellFormedAffixes keeps an extracted item's well-formed affixes in order and
// drops any malformed entry with a warning, so a bad producer value never costs
// the delver the item (FS-4R9M9 R50).
func wellFormedAffixes(itemID uuid.UUID, in []*pb.ItemAffix) Affixes {
	out := make(Affixes, 0, len(in))
	for _, raw := range in {
		if raw == nil {
			slog.Warn("dropping nil affix on extracted item", "item_id", itemID)
			continue
		}
		affix := Affix{Stat: raw.Stat, Tier: int(raw.Tier), Value: int(raw.Value)}
		if !affix.wellFormed() {
			slog.Warn("dropping malformed affix on extracted item",
				"item_id", itemID, "stat", affix.Stat, "tier", affix.Tier, "value", affix.Value,
			)
			continue
		}
		out = append(out, affix)
	}
	return out
}

/**
* Converts the non equipped slice of items extracted from items.extracted event into ItemInstance entities for
* updating the item instance table.
**/
func (s *service) MapProtoItemToItemInstances(memberID uuid.UUID, itemsProto []*pb.Item) ([]*ItemInstance, error) {
	// no items from user
	if len(itemsProto) == 0 {
		slog.Error("No itemProtos to map to ItemInstances.")
		return []*ItemInstance{}, nil
	}

	// items exist, update

	itemInstances := make([]*ItemInstance, 0)

	for _, protoItem := range itemsProto {
		item, err := s.ConvertSingleProtoItemtoItemInstance(memberID, protoItem)
		if err != nil {
			slog.Warn("item couldnt be mapped into ItemInstance",
				"proto_item_instance_id", protoItem.GetInstanceId(),
				"error", err,
			)
			continue
		}

		itemInstances = append(itemInstances, item)
	}

	return itemInstances, nil
}

// sem := make(chan struct{}, 3) // max 3 concurrent
//
// for _, player := range players {
//     sem <- struct{}{} // acquire slot
//     go func(p Player) {
//         defer func() { <-sem }() // release slot
//         tx, _ := db.BeginTx(ctx, nil)
//         // batch update
//         tx.Commit()
//     }(player)
// }

func (s *service) CreateItemType(ctx context.Context, req *CreateItemTypeRequest) (*ItemType, error) {
	itemType := &ItemType{
		TypeCode:    req.TypeCode,
		Name:        req.Name,
		Description: req.Description,
		IsActive:    true,
		SortOrder:   req.SortOrder,
	}

	if err := s.repo.CreateItemType(ctx, itemType); err != nil {
		return nil, err
	}

	return itemType, nil
}

func (s *service) GetItemType(ctx context.Context, id uuid.UUID) (*ItemType, error) {
	return s.repo.GetItemTypeByID(ctx, id)
}

func (s *service) GetItemTypeByCode(ctx context.Context, code string) (*ItemType, error) {
	return s.repo.GetItemTypeByCode(ctx, code)
}

func (s *service) ListItemTypes(ctx context.Context) ([]*ItemType, error) {
	return s.repo.ListItemTypes(ctx)
}

// ==========================================
// ItemRarity Service Methods
// ==========================================

func (s *service) CreateItemRarity(ctx context.Context, req *CreateItemRarityRequest) (*ItemRarity, error) {
	rarity := &ItemRarity{
		RarityCode:         req.RarityCode,
		RarityName:         req.RarityName,
		ColorHex:           req.ColorHex,
		DropRateMultiplier: req.DropRateMultiplier,
		SortOrder:          req.SortOrder,
	}

	if err := s.repo.CreateItemRarity(ctx, rarity); err != nil {
		return nil, err
	}

	return rarity, nil
}

func (s *service) GetItemRarity(ctx context.Context, id uuid.UUID) (*ItemRarity, error) {
	return s.repo.GetItemRarityByID(ctx, id)
}

func (s *service) GetItemRarityByCode(ctx context.Context, code string) (*ItemRarity, error) {
	return s.repo.GetItemRarityByCode(ctx, code)
}

func (s *service) ListItemRarities(ctx context.Context) ([]*ItemRarity, error) {
	return s.repo.ListItemRarities(ctx)
}

// ==========================================
// Weapon Service Methods
// ==========================================

func (s *service) CreateWeapon(ctx context.Context, req *CreateWeaponRequest) (*Weapon, error) {
	weapon := &Weapon{
		RarityID:     req.RarityID,
		AttackPower:  req.AttackPower,
		CriticalRate: req.CriticalRate,
		WeaponType:   req.WeaponType,
		Description:  req.Description,
	}

	if err := s.repo.CreateWeapon(ctx, weapon); err != nil {
		return nil, err
	}

	// Note: No notification sent here.
	// Notifications are sent when CreateItemTemplate is called (either directly or via CreateCompleteWeapon)

	return weapon, nil
}

func (s *service) GetWeapon(ctx context.Context, id uuid.UUID) (*Weapon, error) {
	return s.repo.GetWeaponByID(ctx, id)
}

func (s *service) ListWeapons(ctx context.Context) ([]*Weapon, error) {
	return s.repo.ListWeapons(ctx)
}

// ==========================================
// Armor Service Methods
// ==========================================

func (s *service) CreateArmor(ctx context.Context, req *CreateArmorRequest) (*Armor, error) {
	armor := &Armor{
		RarityID:        req.RarityID,
		DefenseRating:   req.DefenseRating,
		MagicResistance: req.MagicResistance,
		ArmorSlot:       req.ArmorSlot,
		Description:     req.Description,
	}

	if err := s.repo.CreateArmor(ctx, armor); err != nil {
		return nil, err
	}

	return armor, nil
}

func (s *service) GetArmor(ctx context.Context, id uuid.UUID) (*Armor, error) {
	return s.repo.GetArmorByID(ctx, id)
}

func (s *service) ListArmors(ctx context.Context) ([]*Armor, error) {
	return s.repo.ListArmors(ctx)
}

// ==========================================
// Consumable Service Methods
// ==========================================

func (s *service) CreateConsumable(ctx context.Context, req *CreateConsumableRequest) (*Consumable, error) {
	consumable := &Consumable{
		RarityID:      req.RarityID,
		HealingAmount: req.HealingAmount,
		ManaAmount:    req.ManaAmount,
		BuffDuration:  req.BuffDuration,
		MaxStackSize:  req.MaxStackSize,
		Description:   req.Description,
	}

	if err := s.repo.CreateConsumable(ctx, consumable); err != nil {
		return nil, err
	}

	return consumable, nil
}

func (s *service) GetConsumable(ctx context.Context, id uuid.UUID) (*Consumable, error) {
	return s.repo.GetConsumableByID(ctx, id)
}

func (s *service) ListConsumables(ctx context.Context) ([]*Consumable, error) {
	return s.repo.ListConsumables(ctx)
}

// ==========================================
// ItemTemplate Service Methods
// ==========================================

func (s *service) CreateItemTemplate(ctx context.Context, req *CreateItemTemplateRequest) (*ItemTemplate, error) {
	// Validate rarity exists
	if _, err := s.repo.GetItemRarityByID(ctx, req.RarityID); err != nil {
		return nil, fmt.Errorf("invalid rarity_id: %w", err)
	}

	// Set defaults
	requiredLevel := 1
	if req.RequiredLevel != nil {
		requiredLevel = *req.RequiredLevel
	}

	template := &ItemTemplate{
		ItemName:      req.ItemName,
		RarityID:      req.RarityID,
		ItemType:      req.ItemType,
		ItemID:        req.ItemID,
		IconURL:       req.IconURL,
		RequiredLevel: requiredLevel,
	}

	if err := s.repo.CreateItemTemplate(ctx, template); err != nil {
		return nil, err
	}

	// Send message to RabbitMQ
	protoData, err := proto.Marshal(&pb.ItemCreatedEvent{
		UserId:   req.UserId,
		Name:     req.ItemName,
		ItemType: req.ItemType,
	})

	if err != nil {
		slog.Error("Error publishing game match end event", "error", err)
		return nil, err
	}
	slog.Info("CreateItemTemplate PublishWithContext")
	if err := s.publishCh.PublishWithContext(ctx, commonconstants.ItemEventsExchange, commonconstants.ItemCreated, commonbroker.Message{
		ContentType:  "application/protobuf",
		Body:         protoData,
		DeliveryMode: commonbroker.Persistent,
	}); err != nil {
		slog.Info("CreateItemTemplate error")
		return nil, err
	}

	return template, nil
}

func (s *service) GetItemTemplate(ctx context.Context, id uuid.UUID) (*ItemTemplate, error) {
	return s.repo.GetItemTemplateByID(ctx, id)
}

func (s *service) GetItemTemplateByCode(ctx context.Context, code string) (*ItemTemplate, error) {
	return s.repo.GetItemTemplateByCode(ctx, code)
}

func (s *service) ListItemTemplateAggregates(ctx context.Context) ([]*ItemTemplateAggregate, error) {
	return s.repo.ListItemTemplateAggregates(ctx)
}

// ==========================================
// Weapon with Template Service Methods
// ==========================================

func (s *service) GetWeaponWithTemplateByID(ctx context.Context, id uuid.UUID) (*WeaponWithTemplate, error) {
	return s.repo.GetWeaponWithTemplateByID(ctx, id)
}

func (s *service) ListWeaponsWithTemplate(ctx context.Context) ([]*WeaponWithTemplate, error) {
	return s.repo.ListWeaponsWithTemplate(ctx)
}

func (s *service) ListArmorsWithTemplate(ctx context.Context) ([]*ArmorWithTemplate, error) {
	return s.repo.ListArmorsWithTemplate(ctx)
}

func (s *service) ListConsumablesWithTemplate(ctx context.Context) ([]*ConsumableWithTemplate, error) {
	return s.repo.ListConsumablesWithTemplate(ctx)
}

// ==========================================
// Complete Item Creation Methods
// (Creates both specific item + template, sends notification)
// ==========================================

func (s *service) CreateCompleteWeapon(ctx context.Context, req *CreateCompleteWeaponRequest) (*WeaponWithTemplate, error) {
	if _, err := s.repo.GetItemRarityByID(ctx, req.RarityID); err != nil {
		return nil, fmt.Errorf("invalid rarity_id: %w", err)
	}

	var weapon Weapon
	var template ItemTemplate

	requiredLevel := resolveTemplateDefaults(req.RequiredLevel)

	err := commonutils.ExecTx(ctx, s.db, nil, func(tx *sqlx.Tx) error {
		w := &Weapon{
			RarityID:     req.RarityID,
			AttackPower:  req.AttackPower,
			CriticalRate: req.CriticalRate,
			WeaponType:   req.WeaponType,
			Description:  req.Description,
		}
		if err := s.repo.CreateWeaponTx(ctx, tx, w); err != nil {
			return err
		}
		weapon = *w

		t := &ItemTemplate{
			ItemName:      req.ItemName,
			RarityID:      req.RarityID,
			ItemType:      "weapon",
			ItemID:        weapon.ID,
			IconURL:       req.IconURL,
			RequiredLevel: requiredLevel,
		}
		if err := s.repo.CreateItemTemplateTx(ctx, tx, t); err != nil {
			return err
		}
		template = *t

		return nil
	})

	if err != nil {
		slog.Error("Failed to create complete weapon", "error", err)
		return nil, err
	}

	s.publishItemCreatedEvent(ctx, req.UserId, req.ItemName, "weapon")

	return &WeaponWithTemplate{
		ID:             weapon.ID,
		RarityID:       weapon.RarityID,
		AttackPower:    weapon.AttackPower,
		CriticalRate:   weapon.CriticalRate,
		WeaponType:     weapon.WeaponType,
		Description:    weapon.Description,
		CreatedAt:      weapon.CreatedAt,
		UpdatedAt:      weapon.UpdatedAt,
		ItemTemplateID: template.ID,
		ItemName:       template.ItemName,
		IconURL:        template.IconURL,
		RequiredLevel:  template.RequiredLevel,
	}, nil
}

func (s *service) CreateCompleteArmor(ctx context.Context, req *CreateCompleteArmorRequest) (*ArmorWithTemplate, error) {
	if _, err := s.repo.GetItemRarityByID(ctx, req.RarityID); err != nil {
		return nil, fmt.Errorf("invalid rarity_id: %w", err)
	}

	var armor Armor
	var template ItemTemplate

	requiredLevel := resolveTemplateDefaults(req.RequiredLevel)

	err := commonutils.ExecTx(ctx, s.db, nil, func(tx *sqlx.Tx) error {
		a := &Armor{
			RarityID:        req.RarityID,
			DefenseRating:   req.DefenseRating,
			MagicResistance: req.MagicResistance,
			ArmorSlot:       req.ArmorSlot,
			Description:     req.Description,
		}
		if err := s.repo.CreateArmorTx(ctx, tx, a); err != nil {
			return err
		}
		armor = *a

		t := &ItemTemplate{
			ItemName:      req.ItemName,
			RarityID:      req.RarityID,
			ItemType:      "armor",
			ItemID:        armor.ID,
			IconURL:       req.IconURL,
			RequiredLevel: requiredLevel,
		}
		if err := s.repo.CreateItemTemplateTx(ctx, tx, t); err != nil {
			return err
		}
		template = *t

		return nil
	})

	if err != nil {
		slog.Error("Failed to create complete armor", "error", err)
		return nil, err
	}

	s.publishItemCreatedEvent(ctx, req.UserId, req.ItemName, "armor")

	return &ArmorWithTemplate{
		ID:              armor.ID,
		RarityID:        armor.RarityID,
		DefenseRating:   armor.DefenseRating,
		MagicResistance: armor.MagicResistance,
		ArmorSlot:       armor.ArmorSlot,
		Description:     armor.Description,
		CreatedAt:       armor.CreatedAt,
		UpdatedAt:       armor.UpdatedAt,
		ItemTemplateID:  template.ID,
		ItemName:        template.ItemName,
		IconURL:         template.IconURL,
		RequiredLevel:   template.RequiredLevel,
	}, nil
}

func (s *service) CreateCompleteConsumable(ctx context.Context, req *CreateCompleteConsumableRequest) (*ConsumableWithTemplate, error) {
	if _, err := s.repo.GetItemRarityByID(ctx, req.RarityID); err != nil {
		return nil, fmt.Errorf("invalid rarity_id: %w", err)
	}

	var consumable Consumable
	var template ItemTemplate

	requiredLevel := resolveTemplateDefaults(req.RequiredLevel)

	err := commonutils.ExecTx(ctx, s.db, nil, func(tx *sqlx.Tx) error {
		c := &Consumable{
			RarityID:      req.RarityID,
			HealingAmount: req.HealingAmount,
			ManaAmount:    req.ManaAmount,
			BuffDuration:  req.BuffDuration,
			MaxStackSize:  req.MaxStackSize,
			Description:   req.Description,
		}
		if err := s.repo.CreateConsumableTx(ctx, tx, c); err != nil {
			return err
		}
		consumable = *c

		t := &ItemTemplate{
			ItemName:      req.ItemName,
			RarityID:      req.RarityID,
			ItemType:      "consumable",
			ItemID:        consumable.ID,
			IconURL:       req.IconURL,
			RequiredLevel: requiredLevel,
		}
		if err := s.repo.CreateItemTemplateTx(ctx, tx, t); err != nil {
			return err
		}
		template = *t

		return nil
	})

	if err != nil {
		slog.Error("Failed to create complete consumable", "error", err)
		return nil, err
	}

	s.publishItemCreatedEvent(ctx, req.UserId, req.ItemName, "consumable")

	return &ConsumableWithTemplate{
		ID:             consumable.ID,
		RarityID:       consumable.RarityID,
		HealingAmount:  consumable.HealingAmount,
		ManaAmount:     consumable.ManaAmount,
		BuffDuration:   consumable.BuffDuration,
		MaxStackSize:   consumable.MaxStackSize,
		Description:    consumable.Description,
		CreatedAt:      consumable.CreatedAt,
		UpdatedAt:      consumable.UpdatedAt,
		ItemTemplateID: template.ID,
		ItemName:       template.ItemName,
		IconURL:        template.IconURL,
		RequiredLevel:  template.RequiredLevel,
	}, nil
}

// resolveTemplateDefaults applies defaults for optional template fields
func resolveTemplateDefaults(reqLevel *int) int {
	requiredLevel := 1
	if reqLevel != nil {
		requiredLevel = *reqLevel
	}
	return requiredLevel
}

// publishItemCreatedEvent sends an item creation event to RabbitMQ (fire-and-forget, outside tx)
func (s *service) publishItemCreatedEvent(ctx context.Context, userId, itemName, itemType string) {
	protoData, err := proto.Marshal(&pb.ItemCreatedEvent{
		UserId:   userId,
		Name:     itemName,
		ItemType: itemType,
	})
	if err != nil {
		slog.Error("Failed to marshal item created event", "error", err)
		return
	}

	if err := s.publishCh.PublishWithContext(ctx, commonconstants.ItemEventsExchange, commonconstants.ItemCreated, commonbroker.Message{
		ContentType:  "application/protobuf",
		Body:         protoData,
		DeliveryMode: commonbroker.Persistent,
	}); err != nil {
		slog.Error("Failed to publish item created event", "error", err)
	}
}

func (h *service) GetLoadout(ctx context.Context, req *GetLoadoutRequest) (*Loadout, error) {
	return h.repo.GetLoadout(ctx, req)
}

func (h *service) GetLoadoutWithItems(ctx context.Context, req *GetLoadoutRequest) (*LoadoutWithItems, error) {
	loadout, err := h.repo.GetLoadout(ctx, req)
	if err != nil {
		return nil, err
	}

	result := &LoadoutWithItems{}

	getItem := func(id *uuid.UUID) *ItemInstance {
		if id == nil {
			return nil
		}
		item, err := h.repo.GetItemInstanceByID(ctx, *id)
		if err != nil {
			return nil
		}
		return item
	}

	result.Weapon = getItem(loadout.WeaponId)
	result.Head = getItem(loadout.HeadId)
	result.Chest = getItem(loadout.ChestId)
	result.Gloves = getItem(loadout.GlovesId)
	result.Legs = getItem(loadout.LegsId)
	result.Ring1 = getItem(loadout.Ring1Id)
	result.Ring2 = getItem(loadout.Ring2Id)
	result.Consumable1 = getItem(loadout.Consumable1Id)
	result.Consumable2 = getItem(loadout.Consumable2Id)
	result.Consumable3 = getItem(loadout.Consumable3Id)

	return result, nil
}

func (h *service) ListItemInstances(ctx context.Context, req *ListItemInstancesRequest) ([]*ItemInstance, error) {
	return h.repo.ListItemInstances(ctx, req)
}

func (h *service) UpdateLoadout(ctx context.Context, req *UpdateLoadoutRequest) error {
	return h.repo.UpsertLoadoutSlot(ctx, req)
}

// buyoutPrice is marketplace's term, not items': it is forwarded onto the event
// unread, nil when the seller set none (FS-9XKS6).
func (s *service) ReserveItem(ctx context.Context, sellerID, itemID uuid.UUID, startPrice int64, buyoutPrice *int64, endsAt time.Time) (*ItemInstance, error) {
	now := time.Now()
	updateAt := now
	reservedAt := now
	// the listing is born with this ID: it rides ItemReserved to marketplace and
	// fences every later write for this listing (FS-NXP1W Req 24a)
	listingID := uuid.New()
	var itemInstance *ItemInstance
	err := commonutils.ExecTx(ctx, s.db, nil, func(tx *sqlx.Tx) error {
		result, err := s.repo.ReserveItemTx(ctx, tx, sellerID, itemID, listingID, updateAt, reservedAt)
		if err != nil {
			return fmt.Errorf("Reserve item service: %w", err)
		}
		itemInstance = result

		// outbox
		err = s.PublishItemReservedComplete(ctx, tx, itemInstance, sellerID, startPrice, buyoutPrice, endsAt)
		if err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		slog.Error("Failed to list item", "error", err)
		return nil, err
	}
	return itemInstance, nil
}

func (s *service) PublishItemReservedComplete(ctx context.Context, tx *sqlx.Tx, data *ItemInstance, sellerID uuid.UUID, startPrice int64, buyoutPrice *int64, endsAt time.Time) error {
	slog.Debug("service publishItemReservedComplete")

	// proto marshal
	protoData, err := s.formattedItemInstanceData(data, sellerID, startPrice, buyoutPrice, endsAt)

	if err != nil {
		slog.Error("Error formatting item reserved event", "error", err)
		return err
	}

	err = s.outboxPublisher.CreateOutboxTx(ctx, tx, commonoutbox.OutboxParams{
		RoutingKey: commonconstants.ItemReserved,
		Exchange:   commonconstants.ItemEventsExchange,
		Payload:    protoData.ItemReservedEvent,
	})

	if err != nil {
		slog.Error("List item Outbox error", "error", err)
		return err
	}

	slog.Debug("Successfully created outbox item list event",
		"event_name", commonconstants.ItemReserved,
	)
	return nil
}

/**
* Formats item instance data.
**/
func (s *service) formattedItemInstanceData(itemInstance *ItemInstance, sellerID uuid.UUID, startPrice int64, buyoutPrice *int64, endsAt time.Time) (*types.FormattedItemInstanceData, error) {

	var rarityIDStr *string
	if itemInstance.RarityID != nil {
		s := itemInstance.RarityID.String()
		rarityIDStr = &s
	}

	// format data for marshalling as protobuf
	itemInstanceData := &pb.ItemInstance{
		Id:            itemInstance.ID.String(),
		TemplateId:    itemInstance.TemplateID.String(),
		OwnerMemberId: itemInstance.OwnerMemberID.String(),
		Source:        itemInstance.Source,
		ItemType:      itemInstance.ItemType,
		Name:          itemInstance.Name,
		RarityId:      rarityIDStr,

		// Weapon stats
		AttackPower:  int32Ptr(itemInstance.AttackPower),
		CriticalRate: itemInstance.CriticalRate,
		WeaponType:   itemInstance.WeaponType,

		// Armor stats
		DefenseRating:   int32Ptr(itemInstance.DefenseRating),
		MagicResistance: int32Ptr(itemInstance.MagicResistance),
		ArmorSlot:       itemInstance.ArmorSlot,

		// Consumable stats
		HealingAmount: int32Ptr(itemInstance.HealingAmount),
		ManaAmount:    int32Ptr(itemInstance.ManaAmount),
		BuffDuration:  int32Ptr(itemInstance.BuffDuration),

		Durability:  int32Ptr(itemInstance.Durability),
		Description: itemInstance.Description,
		Status:      itemInstance.Status,
	}
	// generate eventId for idemptotency deduplication
	eventId := uuid.NewString()

	var listingIDStr string
	if itemInstance.ListingID != nil {
		listingIDStr = itemInstance.ListingID.String()
	}

	itemReservedEvent := pb.ItemReservedEvent{
		Id:           itemInstance.ID.String(),
		EventId:      eventId,
		SellerId:     sellerID.String(),
		StartPrice:   startPrice,
		BuyoutPrice:  buyoutPrice,
		EndsAt:       timestamppb.New(endsAt),
		ItemInstance: itemInstanceData,
		ListingId:    listingIDStr,
	}

	slog.Debug("itemReservedEvent in formattedItemInstanceData before marshalling into protobuf item_reserved_event",
		"event_id", itemReservedEvent.EventId,
		"item_id", itemReservedEvent.Id,
		"listing_id", itemReservedEvent.ListingId,
		"item_name", itemReservedEvent.ItemInstance.Name,
		"status", itemReservedEvent.ItemInstance.Status,
	)

	ItemReservedProtoData, itemReservedErr := proto.Marshal(&itemReservedEvent)

	if itemReservedErr != nil {
		slog.Error("could not marshal item listed event to itemListedEvent proto",
			"id", itemInstance.ID,
			"error", itemReservedErr,
		)
	}
	data := &types.FormattedItemInstanceData{
		ItemReservedEvent: ItemReservedProtoData,
	}

	return data, nil
}

func (s *service) ListStaleReserved(ctx context.Context, reserveBefore time.Time) ([]*uuid.UUID, error) {

	itemIds, err := s.repo.ListStaleReserved(ctx, reserveBefore)
	if err != nil {
		slog.Error("ListStaleReserved service call repo failed:",
			"error:", err,
		)
		return nil, err
	}
	return itemIds, nil
}

func (s *service) CancelReservation(ctx context.Context, itemID uuid.UUID) (bool, error) {

	ok, err := s.repo.CancelReservation(ctx, itemID)
	if err != nil {
		slog.Error("CancelReservation service call repo failed:",
			"error:", err,
		)
		return false, err
	}
	return ok, nil
}

// GetItemSummaries answers the public facts of the given instances; an unknown
// id is omitted rather than an error, since a listing page asks for whatever
// its listings name.
func (s *service) GetItemSummaries(ctx context.Context, ids []uuid.UUID) ([]*ItemSummary, error) {
	summaries, err := s.repo.GetItemSummaries(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("get item summaries: %w", err)
	}
	return summaries, nil
}

// FreezeItem is settlement step 0b. Frozen, or already frozen for this seller, is
// success; anything else is ErrItemNotFreezable, which the settlement treats as
// final rather than retrying.
func (s *service) FreezeItem(ctx context.Context, itemID, sellerID uuid.UUID) error {
	frozen, err := s.repo.FreezeItem(ctx, itemID, sellerID)
	if err != nil {
		return fmt.Errorf("freeze item %v: %w", itemID, err)
	}

	if !frozen {
		return fmt.Errorf("freeze item %v for seller %v: %w", itemID, sellerID, ErrItemNotFreezable)
	}

	return nil
}

func (s *service) ReturnItem(ctx context.Context, id, listingID uuid.UUID) error {
	return s.repo.ReturnItem(ctx, id, listingID)
}
