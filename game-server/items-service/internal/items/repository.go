package items

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

var ErrItemNotReservable = errors.New("item not reservable")

// ErrItemNotFreezable is settlement step 0b's semantic impossibility: the item is
// no longer the seller's, or no longer on sale. Retrying cannot change either.
var ErrItemNotFreezable = errors.New("item not freezable")

var ErrItemNotTransfer = errors.New("item not transfer")

type repository struct {
	DB *sqlx.DB
}

func NewRepository(db *sqlx.DB) *repository {
	return &repository{
		DB: db,
	}
}

// foreignKeyViolation is Postgres's SQLSTATE for a foreign-key violation.
const foreignKeyViolation = "23503"

// wrapDBErr is the repo boundary translation point: it delegates to the shared
// WrapDBErr helper, which converts infrastructure errors into domain sentinels
// and wraps anything else with the repo name + operation for context. A
// foreign-key violation keeps its *pq.Error alongside the sentinel, so the
// items.extracted consumer can retry a reference that is not there yet instead
// of dead-lettering it as malformed.
func wrapDBErr(op string, err error) error {
	wrapped := commonhelpers.WrapDBErr("items repo", op, err)
	var pqErr *pq.Error
	if errors.As(err, &pqErr) && pqErr.Code == foreignKeyViolation {
		return fmt.Errorf("items repo: %s: %w: %w", op, wrapped, pqErr)
	}
	return wrapped
}

func (r *repository) CreateItemType(ctx context.Context, itemType *ItemType) error {
	itemType.ID = uuid.New()

	query := `
		INSERT INTO item_types (
			id, type_code, name, description, is_active, sort_order
		) VALUES (
			:id, :type_code, :name, :description, :is_active, :sort_order
		)`

	_, err := r.DB.NamedExecContext(ctx, query, itemType)
	if err != nil {
		return wrapDBErr("create item type", err)
	}

	return nil
}

func (r *repository) GetItemTypeByID(ctx context.Context, id uuid.UUID) (*ItemType, error) {
	var itemType ItemType

	query := `SELECT * FROM item_types WHERE id = $1`

	err := r.DB.GetContext(ctx, &itemType, query, id)
	if err != nil {
		return nil, wrapDBErr("get item type", err)
	}

	return &itemType, nil
}

func (r *repository) GetItemTypeByCode(ctx context.Context, code string) (*ItemType, error) {
	var itemType ItemType

	query := `SELECT * FROM item_types WHERE type_code = $1`

	err := r.DB.GetContext(ctx, &itemType, query, code)
	if err != nil {
		return nil, wrapDBErr("get item type by code", err)
	}

	return &itemType, nil
}

func (r *repository) ListItemTypes(ctx context.Context) ([]*ItemType, error) {
	var itemTypes []*ItemType

	query := `SELECT * FROM item_types WHERE is_active = true ORDER BY sort_order ASC`

	err := r.DB.SelectContext(ctx, &itemTypes, query)
	if err != nil {
		return nil, wrapDBErr("list item types", err)
	}

	return itemTypes, nil
}

// ==========================================
// ItemRarity Repository Methods
// ==========================================

func (r *repository) CreateItemRarity(ctx context.Context, rarity *ItemRarity) error {
	rarity.ID = uuid.New()

	query := `
		INSERT INTO item_rarities (
			id, rarity_code, rarity_name, color_hex,
			drop_rate_multiplier, sort_order
		) VALUES (
			:id, :rarity_code, :rarity_name, :color_hex,
			:drop_rate_multiplier, :sort_order
		)`

	_, err := r.DB.NamedExecContext(ctx, query, rarity)
	if err != nil {
		return wrapDBErr("create item rarity", err)
	}

	return nil
}

func (r *repository) GetItemRarityByID(ctx context.Context, id uuid.UUID) (*ItemRarity, error) {
	var rarity ItemRarity

	query := `SELECT * FROM item_rarities WHERE id = $1`

	err := r.DB.GetContext(ctx, &rarity, query, id)
	if err != nil {
		return nil, wrapDBErr("get item rarity", err)
	}

	return &rarity, nil
}

func (r *repository) GetItemRarityByCode(ctx context.Context, code string) (*ItemRarity, error) {
	var rarity ItemRarity

	query := `SELECT * FROM item_rarities WHERE rarity_code = $1`

	err := r.DB.GetContext(ctx, &rarity, query, code)
	if err != nil {
		return nil, wrapDBErr("get item rarity by code", err)
	}

	return &rarity, nil
}

func (r *repository) ListItemRarities(ctx context.Context) ([]*ItemRarity, error) {
	var rarities []*ItemRarity

	query := `SELECT * FROM item_rarities ORDER BY sort_order ASC`

	err := r.DB.SelectContext(ctx, &rarities, query)
	if err != nil {
		return nil, wrapDBErr("list item rarities", err)
	}

	return rarities, nil
}

// ==========================================
// Weapon Repository Methods
// ==========================================

func (r *repository) CreateWeapon(ctx context.Context, weapon *Weapon) error {

	weapon.ID = uuid.New()

	query := `
		INSERT INTO weapons (
			id, rarity_id, attack_power,
			critical_rate, weapon_type, description
		) VALUES (
			:id, :rarity_id, :attack_power,
			:critical_rate, :weapon_type, :description
		)`

	_, err := r.DB.NamedExecContext(ctx, query, weapon)
	if err != nil {
		return wrapDBErr("create weapon", err)
	}

	return nil
}

func (r *repository) GetWeaponByID(ctx context.Context, id uuid.UUID) (*Weapon, error) {
	var weapon Weapon

	query := `SELECT * FROM weapons WHERE id = $1`

	err := r.DB.GetContext(ctx, &weapon, query, id)
	if err != nil {
		return nil, wrapDBErr("get weapon", err)
	}

	return &weapon, nil
}

func (r *repository) ListWeapons(ctx context.Context) ([]*Weapon, error) {
	var weapons []*Weapon

	query := `SELECT * FROM weapons ORDER BY created_at DESC`

	err := r.DB.SelectContext(ctx, &weapons, query)
	if err != nil {
		return nil, wrapDBErr("list weapons", err)
	}

	return weapons, nil
}

// ==========================================
// Armor Repository Methods
// ==========================================

func (r *repository) CreateArmor(ctx context.Context, armor *Armor) error {
	armor.ID = uuid.New()

	query := `
		INSERT INTO armors (
			id, rarity_id, defense_rating,
			magic_resistance, armor_slot, description
		) VALUES (
			:id, :rarity_id, :defense_rating,
			:magic_resistance, :armor_slot, :description
		)`

	_, err := r.DB.NamedExecContext(ctx, query, armor)
	if err != nil {
		return wrapDBErr("create armor", err)
	}

	return nil
}

func (r *repository) GetArmorByID(ctx context.Context, id uuid.UUID) (*Armor, error) {
	var armor Armor

	query := `SELECT * FROM armors WHERE id = $1`

	err := r.DB.GetContext(ctx, &armor, query, id)
	if err != nil {
		return nil, wrapDBErr("get armor", err)
	}

	return &armor, nil
}

func (r *repository) ListArmors(ctx context.Context) ([]*Armor, error) {
	var armors []*Armor

	query := `SELECT * FROM armors ORDER BY created_at DESC`

	err := r.DB.SelectContext(ctx, &armors, query)
	if err != nil {
		return nil, wrapDBErr("list armors", err)
	}

	return armors, nil
}

// ==========================================
// Consumable Repository Methods
// ==========================================

func (r *repository) CreateConsumable(ctx context.Context, consumable *Consumable) error {
	consumable.ID = uuid.New()

	query := `
		INSERT INTO consumables (
			id, rarity_id, healing_amount, mana_amount,
			buff_duration, max_stack_size, description
		) VALUES (
			:id, :rarity_id, :healing_amount, :mana_amount,
			:buff_duration, :max_stack_size, :description
		)`

	_, err := r.DB.NamedExecContext(ctx, query, consumable)
	if err != nil {
		return wrapDBErr("create consumable", err)
	}

	return nil
}

func (r *repository) GetConsumableByID(ctx context.Context, id uuid.UUID) (*Consumable, error) {
	var consumable Consumable

	query := `SELECT * FROM consumables WHERE id = $1`

	err := r.DB.GetContext(ctx, &consumable, query, id)
	if err != nil {
		return nil, wrapDBErr("get consumable", err)
	}

	return &consumable, nil
}

func (r *repository) ListConsumables(ctx context.Context) ([]*Consumable, error) {
	var consumables []*Consumable

	query := `SELECT * FROM consumables ORDER BY created_at DESC`

	err := r.DB.SelectContext(ctx, &consumables, query)
	if err != nil {
		return nil, wrapDBErr("list consumables", err)
	}

	return consumables, nil
}

// ==========================================
// ItemTemplate Repository Methods
// ==========================================

func (r *repository) CreateItemTemplate(ctx context.Context, template *ItemTemplate) error {
	template.ID = uuid.New()

	query := `
		INSERT INTO item_templates (
			id, item_name, rarity_id, item_type, item_id,
			icon_url, required_level
		) VALUES (
			:id, :item_name, :rarity_id, :item_type, :item_id,
			:icon_url, :required_level
		)`

	_, err := r.DB.NamedExecContext(ctx, query, template)
	if err != nil {
		return wrapDBErr("create item template", err)
	}

	return nil
}

func (r *repository) GetItemTemplateByID(ctx context.Context, id uuid.UUID) (*ItemTemplate, error) {
	ctx, span := itemRepositoryTracer.Start(ctx, "Repo.GetItemTemplateByID", trace.WithAttributes(
		attribute.String("item.id", id.String()),
	))

	defer span.End()
	var template ItemTemplate

	query := `SELECT * FROM item_templates WHERE id = $1`

	err := r.DB.GetContext(ctx, &template, query, id)
	if err != nil {
		return nil, wrapDBErr("get item template", err)
	}
	slog.Info("Debug GetItemTemplateByID")
	return &template, nil
}

func (r *repository) ListItemTemplates(ctx context.Context) ([]*ItemTemplate, error) {
	var templates []*ItemTemplate

	query := `SELECT id, item_name, rarity_id, item_type, item_id, icon_url,
	           required_level, min_item_level,
	           created_at, created_by, updated_at, updated_by
	           FROM item_templates ORDER BY created_at DESC`

	err := r.DB.SelectContext(ctx, &templates, query)
	if err != nil {
		return nil, wrapDBErr("list item templates", err)
	}

	return templates, nil
}

func (r *repository) GetItemTemplateByCode(ctx context.Context, code string) (*ItemTemplate, error) {
	// This method is deprecated as item_code no longer exists
	// Return nil for now, to be removed in future refactor
	return nil, fmt.Errorf("GetItemTemplateByCode is deprecated: item_code column no longer exists")
}

func (r *repository) ListItemTemplateAggregates(ctx context.Context) ([]*ItemTemplateAggregate, error) {

	query := `
SELECT
    it.id,
    it.item_name,
    it.item_type,
    it.icon_url,
    it.required_level,
    r.rarity_name AS rarity,
    w.attack_power,
    w.critical_rate,
    w.weapon_type,
    a.defense_rating,
    a.magic_resistance,
    a.armor_slot,
    c.healing_amount,
    c.mana_amount,
    c.buff_duration,
    c.max_stack_size,
    COALESCE(w.description, a.description, c.description, rg.description) AS description,
    it.min_item_level,
    u.effect_code AS unique_effect_code,
    u.effect_text AS unique_effect_text,
    u.fixed_affixes AS unique_fixed_affixes,
    it.created_at,
    it.created_by,
    it.updated_at,
    it.updated_by
FROM item_templates AS it
LEFT JOIN weapons AS w
    ON w.id = it.item_id AND it.item_type = 'weapon'
LEFT JOIN armors AS a
    ON a.id = it.item_id AND it.item_type = 'armor'
LEFT JOIN consumables AS c
    ON c.id = it.item_id AND it.item_type = 'consumable'
LEFT JOIN rings AS rg
    ON rg.id = it.item_id AND it.item_type = 'ring'
LEFT JOIN unique_items AS u
    ON u.template_id = it.id
LEFT JOIN item_rarities AS r
    ON r.id = it.rarity_id
	`

	var items []*ItemTemplateAggregate

	err := r.DB.SelectContext(ctx, &items, query)

	if err != nil {
		return nil, wrapDBErr("list item template aggregates", err)
	}

	return items, nil
}

func (r *repository) GetWeaponWithTemplateByID(ctx context.Context, id uuid.UUID) (*WeaponWithTemplate, error) {
	var weapon WeaponWithTemplate

	query := `
		SELECT w.id, w.rarity_id, w.attack_power,
		       w.critical_rate, w.weapon_type, w.description, w.created_at, w.updated_at,
		       t.id AS item_template_id, t.item_name, t.icon_url,
		       t.required_level
		FROM weapons w
		JOIN item_templates t ON t.item_id = w.id AND t.item_type = 'weapon'
		WHERE w.id = $1`

	err := r.DB.GetContext(ctx, &weapon, query, id)
	if err != nil {
		return nil, wrapDBErr("get weapon with template", err)
	}

	return &weapon, nil
}

// ListArmorsWithTemplate retrieves all armors with their item template information
func (r *repository) ListArmorsWithTemplate(ctx context.Context) ([]*ArmorWithTemplate, error) {
	ctx, span := itemRepositoryTracer.Start(ctx, "Repo.ListArmorsWithTemplate")
	defer span.End()

	var armors []*ArmorWithTemplate

	query := `
		SELECT a.id, a.rarity_id, a.defense_rating,
		       a.magic_resistance, a.armor_slot, a.description, a.created_at, a.updated_at,
		       t.id AS item_template_id, t.item_name, t.icon_url,
		       t.required_level
		FROM armors a
		JOIN item_templates t ON t.item_id = a.id AND t.item_type = 'armor'
		ORDER BY a.created_at DESC`

	err := r.DB.SelectContext(ctx, &armors, query)
	if err != nil {
		return nil, wrapDBErr("list armors with template", err)
	}

	return armors, nil
}

// ListConsumablesWithTemplate retrieves all consumables with their item template information
func (r *repository) ListConsumablesWithTemplate(ctx context.Context) ([]*ConsumableWithTemplate, error) {
	ctx, span := itemRepositoryTracer.Start(ctx, "Repo.ListConsumablesWithTemplate")
	defer span.End()

	var consumables []*ConsumableWithTemplate

	query := `
		SELECT c.id, c.rarity_id, c.healing_amount, c.mana_amount,
		       c.buff_duration, c.max_stack_size, c.description, c.created_at, c.updated_at,
		       t.id AS item_template_id, t.item_name, t.icon_url,
		       t.required_level
		FROM consumables c
		JOIN item_templates t ON t.item_id = c.id AND t.item_type = 'consumable'
		ORDER BY c.created_at DESC`

	err := r.DB.SelectContext(ctx, &consumables, query)
	if err != nil {
		return nil, wrapDBErr("list consumables with template", err)
	}

	return consumables, nil
}

// ListWeaponsWithTemplate retrieves all weapons with their item template information
func (r *repository) ListWeaponsWithTemplate(ctx context.Context) ([]*WeaponWithTemplate, error) {
	ctx, span := itemRepositoryTracer.Start(ctx, "Repo.ListWeaponsWithTemplate")
	defer span.End()

	var weapons []*WeaponWithTemplate

	query := `
		SELECT w.id, w.rarity_id, w.attack_power,
		       w.critical_rate, w.weapon_type, w.description, w.created_at, w.updated_at,
		       t.id AS item_template_id, t.item_name, t.icon_url,
		       t.required_level
		FROM weapons w
		JOIN item_templates t ON t.item_id = w.id AND t.item_type = 'weapon'
		ORDER BY w.created_at DESC`

	err := r.DB.SelectContext(ctx, &weapons, query)
	if err != nil {
		return nil, wrapDBErr("list weapons with template", err)
	}

	return weapons, nil
}

// ==========================================
// Transaction-aware Create Methods
// ==========================================

func (r *repository) CreateWeaponTx(ctx context.Context, tx *sqlx.Tx, weapon *Weapon) error {
	weapon.ID = uuid.New()

	query := `
		INSERT INTO weapons (
			id, rarity_id, attack_power,
			critical_rate, weapon_type, description
		) VALUES (
			:id, :rarity_id, :attack_power,
			:critical_rate, :weapon_type, :description
		)`

	_, err := tx.NamedExecContext(ctx, query, weapon)
	if err != nil {
		return wrapDBErr("create weapon (tx)", err)
	}

	return nil
}

func (r *repository) CreateArmorTx(ctx context.Context, tx *sqlx.Tx, armor *Armor) error {
	armor.ID = uuid.New()

	query := `
		INSERT INTO armors (
			id, rarity_id, defense_rating,
			magic_resistance, armor_slot, description
		) VALUES (
			:id, :rarity_id, :defense_rating,
			:magic_resistance, :armor_slot, :description
		)`

	_, err := tx.NamedExecContext(ctx, query, armor)
	if err != nil {
		return wrapDBErr("create armor (tx)", err)
	}

	return nil
}

func (r *repository) CreateConsumableTx(ctx context.Context, tx *sqlx.Tx, consumable *Consumable) error {
	consumable.ID = uuid.New()

	query := `
		INSERT INTO consumables (
			id, rarity_id, healing_amount, mana_amount,
			buff_duration, max_stack_size, description
		) VALUES (
			:id, :rarity_id, :healing_amount, :mana_amount,
			:buff_duration, :max_stack_size, :description
		)`

	_, err := tx.NamedExecContext(ctx, query, consumable)
	if err != nil {
		return wrapDBErr("create consumable (tx)", err)
	}

	return nil
}

func (r *repository) CreateItemTemplateTx(ctx context.Context, tx *sqlx.Tx, template *ItemTemplate) error {
	template.ID = uuid.New()

	query := `
		INSERT INTO item_templates (
			id, item_name, rarity_id, item_type, item_id,
			icon_url, required_level
		) VALUES (
			:id, :item_name, :rarity_id, :item_type, :item_id,
			:icon_url, :required_level
		)`

	_, err := tx.NamedExecContext(ctx, query, template)
	if err != nil {
		return wrapDBErr("create item template (tx)", err)
	}

	return nil
}

func (r *repository) UpsertItemInstanceTx(ctx context.Context, tx *sqlx.Tx, instance *ItemInstance) error {
	if instance.ID == uuid.Nil {
		instance.ID = uuid.New()
	}

	query := `
		INSERT INTO item_instances (
			id, template_id, owner_member_id, source,
			item_type, name, rarity_id,
			attack_power, critical_rate, weapon_type,
			defense_rating, magic_resistance, armor_slot,
			healing_amount, mana_amount, buff_duration,
			durability, description,
			created_by, updated_by
		) VALUES (
			:id, :template_id, :owner_member_id, :source,
			:item_type, :name, :rarity_id,
			:attack_power, :critical_rate, :weapon_type,
			:defense_rating, :magic_resistance, :armor_slot,
			:healing_amount, :mana_amount, :buff_duration,
			:durability, :description,
			:created_by, :updated_by
		)
		ON CONFLICT (id) DO UPDATE SET
			template_id      = EXCLUDED.template_id,
			owner_member_id  = EXCLUDED.owner_member_id,
			source           = EXCLUDED.source,
			item_type        = EXCLUDED.item_type,
			name             = EXCLUDED.name,
			rarity_id        = EXCLUDED.rarity_id,
			attack_power     = EXCLUDED.attack_power,
			critical_rate    = EXCLUDED.critical_rate,
			weapon_type      = EXCLUDED.weapon_type,
			defense_rating   = EXCLUDED.defense_rating,
			magic_resistance = EXCLUDED.magic_resistance,
			armor_slot       = EXCLUDED.armor_slot,
			healing_amount   = EXCLUDED.healing_amount,
			mana_amount      = EXCLUDED.mana_amount,
			buff_duration    = EXCLUDED.buff_duration,
			durability       = EXCLUDED.durability,
			description      = EXCLUDED.description,
			updated_by       = EXCLUDED.updated_by`

	_, err := tx.NamedExecContext(ctx, query, instance)
	if err != nil {
		return wrapDBErr("upsert item instance (tx)", err)
	}

	return nil
}

// loadoutColumns are the player_loadouts columns Loadout maps. Explicit: the
// table has audit columns (created_by/updated_by) that Loadout does not map,
// so SELECT * would fail the sqlx scan with "missing destination name".
const loadoutColumns = `id, member_id,
	        weapon_instance_id, head_instance_id, chest_instance_id,
	        gloves_instance_id, legs_instance_id,
	        ring_1_instance_id, ring_2_instance_id,
	        consumable_1_id, consumable_2_id, consumable_3_id,
	        created_at, updated_at`

func (r *repository) GetLoadout(ctx context.Context, req *GetLoadoutRequest) (*Loadout, error) {
	memberId := req.MemberId

	loadout := &Loadout{}

	query := `SELECT ` + loadoutColumns + ` FROM player_loadouts WHERE member_id = $1`

	err := r.DB.GetContext(ctx, loadout, query, memberId)
	if err != nil {
		if err == sql.ErrNoRows {
			return loadout, nil
		}
		return nil, wrapDBErr("get loadout", err)
	}

	return loadout, nil
}

// instanceLevelColumns selects an instance's (aliased ii) item level, affixes
// and required level. The required level is the instance's own, else its
// template's (aliased t); item_templates.required_level is nullable with
// DEFAULT 1, so a NULL there reads as 1 (FS-BDA7X Req 30, FS-4R9M9 R48).
const instanceLevelColumns = `ii.item_level, ii.affixes,
	        COALESCE(ii.required_level, t.required_level, 1) AS required_level`

// uniqueEffectJoin joins the unique row (aliased u) of an instance's (aliased
// ii) template; every u column is NULL for a non-unique (FS-4R9M9 R51-52).
const uniqueEffectJoin = `LEFT JOIN unique_items AS u ON u.template_id = ii.template_id`

// instanceUniqueColumns are a unique instance's effect code and text, for
// the owner-facing reads. The public summary selects the text only.
const instanceUniqueColumns = `u.effect_code AS unique_effect_code, u.effect_text AS unique_effect_text`

func (r *repository) GetItemInstanceByID(ctx context.Context, id uuid.UUID) (*ItemInstance, error) {
	item := &ItemInstance{}

	query := `
	 SELECT ii.id, ii.template_id, ii.owner_member_id, ii.source, ii.item_type, ii.name, ii.rarity_id,
	        ii.attack_power, ii.critical_rate, ii.weapon_type, ii.defense_rating, ii.magic_resistance,
	        ii.armor_slot, ii.healing_amount, ii.mana_amount, ii.buff_duration,
	        ii.description, ii.location, ii.acquired_at, ii.created_at, ii.updated_at,
	        ` + instanceLevelColumns + `,
	        ` + instanceUniqueColumns + `
	 FROM item_instances AS ii
	 JOIN item_templates AS t ON t.id = ii.template_id
	 ` + uniqueEffectJoin + `
	 WHERE ii.id = $1
	`

	err := r.DB.GetContext(ctx, item, query, id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, wrapDBErr("get item instance", err)
	}

	return item, nil
}

// ownedInstanceColumns are what the owner sees of an instance (aliased ii,
// its template t, its unique row u), status and location included.
const ownedInstanceColumns = `ii.id, ii.template_id, ii.owner_member_id, ii.source, ii.item_type, ii.name, ii.rarity_id,
	        ii.attack_power, ii.critical_rate, ii.weapon_type, ii.defense_rating, ii.magic_resistance,
	        ii.armor_slot, ii.healing_amount, ii.mana_amount, ii.buff_duration,
	        ii.description, ii.status, ii.location, ii.acquired_at, ii.created_at, ii.updated_at,
	        ` + instanceLevelColumns + `,
	        ` + instanceUniqueColumns

func (r *repository) ListItemInstances(ctx context.Context, req *ListItemInstancesRequest) ([]*ItemInstance, error) {
	items := []*ItemInstance{}

	query := `
	 SELECT ` + ownedInstanceColumns + `
	 FROM item_instances AS ii
	 JOIN item_templates AS t ON t.id = ii.template_id
	 ` + uniqueEffectJoin + `
	 WHERE ii.owner_member_id = $1
	 ORDER BY ii.created_at DESC
	`

	err := r.DB.SelectContext(ctx, &items, query, req.MemberId)
	if err != nil {
		return nil, wrapDBErr("list item instances", err)
	}

	return items, nil
}

// loadoutSlotColumns maps a loadout slot name to its player_loadouts column.
// Only these names reach SQL: the column is formatted into the query.
var loadoutSlotColumns = map[string]string{
	"weapon":       "weapon_instance_id",
	"head":         "head_instance_id",
	"chest":        "chest_instance_id",
	"gloves":       "gloves_instance_id",
	"legs":         "legs_instance_id",
	"ring_1":       "ring_1_instance_id",
	"ring_2":       "ring_2_instance_id",
	"consumable_1": "consumable_1_id",
	"consumable_2": "consumable_2_id",
	"consumable_3": "consumable_3_id",
}

// LoadoutSlotTx reads the instance member wears in slot, nil when the slot is
// empty or member has no loadout yet. The row is locked for the rest of tx, so
// the slot cannot change between this read and the write that follows it.
func (r *repository) LoadoutSlotTx(ctx context.Context, tx *sqlx.Tx, member uuid.UUID, slot string) (*uuid.UUID, error) {
	column, ok := loadoutSlotColumns[slot]
	if !ok {
		return nil, fmt.Errorf("invalid slot: %s", slot)
	}

	query := fmt.Sprintf(`SELECT %s FROM player_loadouts WHERE member_id = $1 FOR UPDATE`, column)

	var worn *uuid.UUID
	if err := tx.GetContext(ctx, &worn, query, member); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, wrapDBErr("read loadout slot", err)
	}
	return worn, nil
}

func (r *repository) UpsertLoadoutSlotTx(ctx context.Context, tx *sqlx.Tx, req *UpdateLoadoutRequest) error {
	column, ok := loadoutSlotColumns[req.Slot]
	if !ok {
		return fmt.Errorf("invalid slot: %s", req.Slot)
	}

	// Upsert: first-time equippers won't have a player_loadouts row yet,
	// so a plain UPDATE would silently affect 0 rows.
	query := fmt.Sprintf(`
	 INSERT INTO player_loadouts (member_id, %s)
	 VALUES ($1, $2)
	 ON CONFLICT (member_id) DO UPDATE
	 SET %s = EXCLUDED.%s, updated_at = NOW()
	`, column, column, column)

	_, err := tx.ExecContext(ctx, query, req.MemberId, req.ItemInstanceId)
	if err != nil {
		return wrapDBErr("update loadout (tx)", err)
	}

	return nil
}

// UpsertPlayerLoadoutTx writes the full loadout snapshot for a member.
// Nil slot pointers in req become NULL (slot cleared); non-nil values are set.
// updated_at is left to the BEFORE UPDATE trigger.
func (r *repository) UpsertPlayerLoadoutTx(ctx context.Context, tx *sqlx.Tx, req *UpsertPlayerLoadoutRequest) error {
	query := `
		INSERT INTO player_loadouts (
			member_id,
			weapon_instance_id,
			head_instance_id, chest_instance_id, legs_instance_id, gloves_instance_id,
			ring_1_instance_id, ring_2_instance_id,
			consumable_1_id, consumable_2_id, consumable_3_id
		) VALUES (
			:member_id,
			:weapon_instance_id,
			:head_instance_id, :chest_instance_id, :legs_instance_id, :gloves_instance_id,
			:ring_1_instance_id, :ring_2_instance_id,
			:consumable_1_id, :consumable_2_id, :consumable_3_id
		)
		ON CONFLICT (member_id) DO UPDATE SET
			weapon_instance_id = EXCLUDED.weapon_instance_id,
			head_instance_id   = EXCLUDED.head_instance_id,
			chest_instance_id  = EXCLUDED.chest_instance_id,
			legs_instance_id   = EXCLUDED.legs_instance_id,
			gloves_instance_id = EXCLUDED.gloves_instance_id,
			ring_1_instance_id = EXCLUDED.ring_1_instance_id,
			ring_2_instance_id = EXCLUDED.ring_2_instance_id,
			consumable_1_id    = EXCLUDED.consumable_1_id,
			consumable_2_id    = EXCLUDED.consumable_2_id,
			consumable_3_id    = EXCLUDED.consumable_3_id`

	_, err := tx.NamedExecContext(ctx, query, req)
	if err != nil {
		return wrapDBErr("upsert player loadout (tx)", err)
	}

	return nil
}

// insertItemColumns are the item_instances columns InsertItemInstancesTx
// writes, in the order insertItemArgs supplies them.
var insertItemColumns = []string{
	"id", "template_id", "owner_member_id", "source",
	"item_type", "name", "rarity_id",
	"attack_power", "critical_rate", "weapon_type",
	"defense_rating", "magic_resistance", "armor_slot",
	"healing_amount", "mana_amount", "buff_duration",
	"durability", "description", "status", "location",
	"item_level", "affixes", "required_level",
}

// insertItemArgs is one row's values for insertItemColumns. A RequiredLevel
// of 0 means the instance has no requirement of its own and stores NULL, so
// reads fall back to the template's (FS-4R9M9 R48-49). Location is always the
// bag: a find is carried out of the run (FS-VPD8Y R9, FS-18Z5F R27), worn or
// not, and a worn one only reads its location once it is unequipped.
func insertItemArgs(item *ItemInstance) []any {
	var requiredLevel *int
	if item.RequiredLevel > 0 {
		requiredLevel = &item.RequiredLevel
	}
	return []any{
		item.ID, item.TemplateID, item.OwnerMemberID, item.Source,
		item.ItemType, item.Name, item.RarityID,
		item.AttackPower, item.CriticalRate, item.WeaponType,
		item.DefenseRating, item.MagicResistance, item.ArmorSlot,
		item.HealingAmount, item.ManaAmount, item.BuffDuration,
		item.Durability, item.Description, item.Status, LocationBag,
		max(item.ItemLevel, 1), item.Affixes, requiredLevel,
	}
}

// InsertItemInstancesTx inserts new instances, the finds of a run, in one
// statement. Insert only: an existing row is never the path here, so nothing
// the run fence skipped can be written through a conflict clause (FS-18Z5F
// R27); brought-in items go through ApplyRunItemsTx.
func (r *repository) InsertItemInstancesTx(ctx context.Context, tx *sqlx.Tx, items []*ItemInstance) error {
	if len(items) == 0 {
		return nil
	}

	query, args := insertItemsQuery(items)
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return wrapDBErr("insert item instances (tx)", err)
	}

	return nil
}

// insertItemsQuery builds the multi-row insert and its arguments, giving any
// item without an id a new one. Placeholders are numbered from the column
// list, so they cannot drift from the arguments.
func insertItemsQuery(items []*ItemInstance) (string, []any) {
	colsPerRow := len(insertItemColumns)

	var b strings.Builder
	b.WriteString("\n\t\tINSERT INTO item_instances (")
	b.WriteString(strings.Join(insertItemColumns, ", "))
	b.WriteString(") VALUES ")

	args := make([]any, 0, len(items)*colsPerRow)

	for i, item := range items {
		if item.ID == uuid.Nil {
			item.ID = uuid.New()
		}

		if i > 0 {
			b.WriteString(", ")
		}

		b.WriteString("(")
		for c := range colsPerRow {
			if c > 0 {
				b.WriteString(", ")
			}
			fmt.Fprintf(&b, "$%d", i*colsPerRow+c+1)
		}
		b.WriteString(")")

		args = append(args, insertItemArgs(item)...)
	}

	return b.String(), args
}

// applyRunItemQuery writes one brought-in item coming back out of a run, only
// while it is still member's and IN_RUN under that run ($1 id, $2 member, $3
// run): the run fence (FS-18Z5F R27, ADR-0032). Its owner, source, rarity and
// roll are fixed once and never written here (FS-4R9M9 R20, R53), whatever the
// event carries. A NULL location ($18) keeps the stored one.
const applyRunItemQuery = `
		UPDATE item_instances
		SET
			template_id      = $4,
			item_type        = $5,
			name             = $6,
			attack_power     = $7,
			critical_rate    = $8,
			weapon_type      = $9,
			defense_rating   = $10,
			magic_resistance = $11,
			armor_slot       = $12,
			healing_amount   = $13,
			mana_amount      = $14,
			buff_duration    = $15,
			durability       = $16,
			description      = $17,
			location         = COALESCE($18::varchar, location),
			status           = 'AVAILABLE',
			run_id           = NULL,
			updated_at       = NOW()
		WHERE id = $1
		AND owner_member_id = $2
		AND status = 'IN_RUN'
		AND run_id = $3
		RETURNING id`

// ApplyRunItemsTx writes member's brought-in items back from the run runID and
// returns the ids it wrote. An item is written only while the run still owns
// it (applyRunItemQuery); any other, re-tagged by a later checkout, already
// released, someone else's or unknown, is left exactly as it is and missing
// from the result (FS-18Z5F R27). An item with a Location goes there; one
// without keeps its stored location (a worn item, R27).
func (r *repository) ApplyRunItemsTx(ctx context.Context, tx *sqlx.Tx, member, runID uuid.UUID, items []*ItemInstance) ([]uuid.UUID, error) {
	applied := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		var location *string
		if item.Location != "" {
			location = &item.Location
		}

		var id uuid.UUID
		err := tx.GetContext(ctx, &id, applyRunItemQuery,
			item.ID, member, runID,
			item.TemplateID, item.ItemType, item.Name,
			item.AttackPower, item.CriticalRate, item.WeaponType,
			item.DefenseRating, item.MagicResistance, item.ArmorSlot,
			item.HealingAmount, item.ManaAmount, item.BuffDuration,
			item.Durability, item.Description, location,
		)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, wrapDBErr("apply run item (tx)", err)
		}
		applied = append(applied, id)
	}
	return applied, nil
}

// RunItemOwnersTx lists the owners of every instance still IN_RUN under runID:
// settlement releases them all, members absent from its event included
// (FS-18Z5F R29), so it locks their accounts too.
func (r *repository) RunItemOwnersTx(ctx context.Context, tx *sqlx.Tx, runID uuid.UUID) ([]uuid.UUID, error) {
	query := `
		SELECT DISTINCT owner_member_id
		FROM item_instances
		WHERE run_id = $1
	`

	owners := []uuid.UUID{}
	if err := tx.SelectContext(ctx, &owners, query, runID); err != nil {
		return nil, wrapDBErr("read run item owners (tx)", err)
	}
	return owners, nil
}

// ReleaseRunTx makes every instance still IN_RUN under runID AVAILABLE again,
// whoever owns it, with its run id cleared and its location unchanged, and
// returns how many it released (FS-18Z5F R29). Nothing is deleted (R30).
func (r *repository) ReleaseRunTx(ctx context.Context, tx *sqlx.Tx, runID uuid.UUID) (int64, error) {
	query := `
		UPDATE item_instances
		SET status = 'AVAILABLE', run_id = NULL, updated_at = NOW()
		WHERE run_id = $1
		AND status = 'IN_RUN'
	`

	res, err := tx.ExecContext(ctx, query, runID)
	if err != nil {
		return 0, wrapDBErr("release run items (tx)", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("release run items, rows affected: %w", err)
	}
	return n, nil
}

func (r *repository) ReserveItemTx(ctx context.Context, tx *sqlx.Tx, sellerID, itemID, listingID uuid.UUID, updatedAt, reservedAt time.Time) (*ItemInstance, error) {
	query := `
		UPDATE item_instances
		SET status = 'LISTED',
			listing_id = :listing_id,
			updated_at = :updated_at,
			reserved_at = :reserved_at
		WHERE id = :id
		AND owner_member_id = :owner_member_id
		AND status = 'AVAILABLE'
		RETURNING
			id,
			template_id,
			owner_member_id,
			source,
			status,
			item_type,
			name,
			rarity_id,
			attack_power,
			critical_rate,
			weapon_type,
			defense_rating,
			magic_resistance,
			armor_slot,
			healing_amount,
			mana_amount,
			buff_duration,
			durability,
			description,
			acquired_at,
			created_at,
			updated_at,
			reserved_at,
			listing_id
	`

	args := ItemInstance{
		ID:            itemID,
		OwnerMemberID: sellerID,
		Status:        "LISTED",
		ListingID:     &listingID,
		UpdatedAt:     updatedAt,
		ReservedAt:    reservedAt,
	}

	slog.Info("ReserveItem args ", "ItemInstance", args)
	rows, err := tx.NamedQuery(query, args)
	if err != nil {
		return nil, fmt.Errorf("reserve item: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		slog.Info("ReserveItem args ", "no row", 0)
		// 没有任何資料被更新：item 不存在  or 状态不是 AVAILABLE
		return nil, ErrItemNotReservable
	}

	var item ItemInstance
	slog.Info("db item", "item", item)
	if err := rows.StructScan(&item); err != nil {
		return nil, fmt.Errorf("reserve item scan: %w", err)
	}
	return &item, nil
}

func (r *repository) ListStaleReserved(ctx context.Context, reservedBefore time.Time) ([]*uuid.UUID, error) {
	query := `
		SELECT id
		FROM item_instances
		WHERE status = 'LISTED'
		  AND reserved_at IS NOT NULL
		  AND reserved_at < $1
		ORDER BY reserved_at
		LIMIT 100
	`
	var itemIDs []*uuid.UUID
	if err := r.DB.SelectContext(ctx, &itemIDs, query, reservedBefore); err != nil {
		return nil, commonhelpers.WrapDBErr("item_instances", "ListStaleReservedItems", err)
	}

	return itemIDs, nil
}

func (r *repository) CancelReservation(ctx context.Context, itemID uuid.UUID) (bool, error) {
	updatedAt := time.Now()
	query := `
		UPDATE item_instances
		SET status = 'AVAILABLE',
			reserved_at = NULL,
			updated_at = $1
		WHERE id = $2
		AND status = 'LISTED'
	`

	res, err := r.DB.ExecContext(ctx, query, updatedAt, itemID)
	if err != nil {
		return false, commonhelpers.WrapDBErr("item_instances", "CancelReservation", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("cancel reservation, rows affected: %w", err)
	}

	// false没更新到（不存在、或不是 LISTED）
	return n > 0, nil
}

// GetItemSummaries reads the public facts of the given instances. An id with no
// instance is simply absent from the result.
func (r *repository) GetItemSummaries(ctx context.Context, ids []uuid.UUID) ([]*ItemSummary, error) {
	return selectItemSummaries(ctx, r.DB, ids)
}

// selectItemSummaries takes any querier so the round-trip test can run it inside
// a transaction it rolls back.
//
// The column list is the whole privacy rule: owner_member_id, source and
// reserved_at are never selected, so they cannot leak through a later mapping.
func selectItemSummaries(ctx context.Context, q sqlx.QueryerContext, ids []uuid.UUID) ([]*ItemSummary, error) {
	idStrings := make([]string, 0, len(ids))
	for _, id := range ids {
		idStrings = append(idStrings, id.String())
	}

	query := `
	 SELECT ii.id, ii.name, ii.description, ii.item_type,
	        COALESCE(r.rarity_code, '') AS rarity,
	        ii.weapon_type, ii.armor_slot,
	        ii.attack_power, ii.critical_rate,
	        ii.defense_rating, ii.magic_resistance,
	        ii.healing_amount, ii.mana_amount, ii.buff_duration,
	        ` + instanceLevelColumns + `,
	        u.effect_text AS unique_effect_text
	 FROM item_instances AS ii
	 JOIN item_templates AS t ON t.id = ii.template_id
	 ` + uniqueEffectJoin + `
	 LEFT JOIN item_rarities AS r ON r.id = ii.rarity_id
	 WHERE ii.id = ANY($1::uuid[])
	`

	summaries := []*ItemSummary{}
	if err := sqlx.SelectContext(ctx, q, &summaries, query, pq.Array(idStrings)); err != nil {
		return nil, wrapDBErr("get item summaries", err)
	}

	return summaries, nil
}

// FreezeItem is settlement step 0b (FS-NXP1W Req 26): LISTED -> PENDING_SETTLEMENT,
// conditional on the seller still owning the item. It reports false when the item
// is neither freezable nor already frozen for this seller; the caller decides what
// that means.
//
// Only the LISTED row is written, so a retry on an already-frozen item changes
// nothing (updated_at is trigger-stamped on any UPDATE, even a no-op one). The
// already-frozen check is a separate statement on purpose: it takes a fresh
// snapshot after the write, so an overlapping attempt that froze the item first
// has committed by then and is seen, where a snapshot shared with the write would
// miss it.
func (r *repository) FreezeItem(ctx context.Context, itemID, sellerID uuid.UUID) (bool, error) {
	freeze := `
		UPDATE item_instances
		SET status = 'PENDING_SETTLEMENT'
		WHERE id = $1
		AND owner_member_id = $2
		AND status = 'LISTED'
	`

	res, err := r.DB.ExecContext(ctx, freeze, itemID, sellerID)
	if err != nil {
		return false, wrapDBErr("freeze item", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("freeze item, rows affected: %w", err)
	}
	if n > 0 {
		return true, nil
	}

	alreadyFrozen := `
		SELECT EXISTS (
			SELECT 1
			FROM item_instances
			WHERE id = $1
			AND owner_member_id = $2
			AND status = 'PENDING_SETTLEMENT'
		)
	`

	var frozen bool
	if err := r.DB.GetContext(ctx, &frozen, alreadyFrozen, itemID, sellerID); err != nil {
		return false, wrapDBErr("freeze item, already frozen check", err)
	}

	return frozen, nil
}

// UnfreezeItem is items' share of the pre-pivot rollback (FS-NXP1W Req 12): the
// item goes back to its seller, AVAILABLE, listing_id cleared. One conditional
// write, scoped to this listing (Req 24a), so a retry after the seller relisted
// the item leaves the new listing's item alone.
//
// LISTED is matched as well as PENDING_SETTLEMENT: a rollback for a 0b that never
// froze the item still ends the listing, and its reservation with it.
//
// Zero rows is success, never an error. The rollback is retried without a cap, so
// it must end: an item this write does not match is already back with its seller,
// relisted, or no longer this settlement's to touch.
func (r *repository) UnfreezeItem(ctx context.Context, itemID, sellerID, listingID uuid.UUID) error {
	unfreeze := `
		UPDATE item_instances
		SET status = 'AVAILABLE',
			listing_id = NULL
		WHERE id = $1
		AND owner_member_id = $2
		AND listing_id = $3
		AND status IN ('PENDING_SETTLEMENT', 'LISTED')
	`

	res, err := r.DB.ExecContext(ctx, unfreeze, itemID, sellerID, listingID)
	if err != nil {
		return wrapDBErr("unfreeze item", err)
	}

	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("unfreeze item, rows affected: %w", err)
	}
	if n > 0 {
		return nil
	}

	// Zero rows is still success, but one shape of it is an invariant breach rather
	// than a replay or a relist: the item is still reserved for this listing, yet
	// not the seller's or not in a status the rollback releases. Nothing else will
	// free it, so it must leave a trace.
	stuck := `
		SELECT EXISTS (
			SELECT 1
			FROM item_instances
			WHERE id = $1
			AND listing_id = $2
		)
	`

	var stillReserved bool
	if err := r.DB.GetContext(ctx, &stillReserved, stuck, itemID, listingID); err != nil {
		return wrapDBErr("unfreeze item, still reserved check", err)
	}
	if stillReserved {
		slog.WarnContext(ctx, "unfreeze left an item still reserved for its failed listing",
			"item_id", itemID, "seller_id", sellerID, "listing_id", listingID)
	}

	return nil
}

// NB1
var (
	ErrItemCorrupted = errors.New("item corrupted")
	ErrNoItemFound   = errors.New("item not found")
)

func (r *repository) ReturnItem(ctx context.Context, id, listingID uuid.UUID) error {
	query := `
		UPDATE item_instances 
		SET
			status = 'AVAILABLE',
			listing_id = NULL
		WHERE
		id = :id AND listing_id = :listing_id AND status = 'LISTED'
	`

	mappedArgs := map[string]interface{}{
		"id":         id,
		"listing_id": listingID,
	}
	res, err := r.DB.NamedExecContext(ctx, query, mappedArgs)

	if err != nil {
		return commonhelpers.WrapDBErr("items repo", "return item", err)
	}

	rows, err := res.RowsAffected()

	if err != nil {
		return fmt.Errorf("ReturnItem, rows affected: %w", err)
	}

	// rows affected either 0 or 1, whether or not something was updated

	if rows == 1 {
		// updated successfully
		return nil
	}

	// rows == 0 case
	// we need to query again for enough granularity of differentiating between different edge cases
	// grab the item in general
	query = `
		SELECT 
			listing_id
		FROM item_instances 
		WHERE id = $1
		`

	var item struct {
		ListingID *uuid.UUID `db:"listing_id"`
	}
	err = r.DB.GetContext(ctx, &item, query, id)

	switch {
	// item not found case, no item at all, so should fail
	case errors.Is(err, sql.ErrNoRows):
		return ErrNoItemFound

	// generic error, use helper
	case err != nil:
		return commonhelpers.WrapDBErr("items repo", "return item", err)

	// check for the corrupt case of item is still the same but status has changed already
	case item.ListingID != nil && *item.ListingID == listingID:
		return ErrItemCorrupted
	default:
		return nil
	}
}

var errNotTransferable = errors.New("item not transferable for this listing")

func (r *repository) TransferItem(ctx context.Context, itemID, buyerID, listingID uuid.UUID) (bool, error) {
	var transferred bool
	err := commonhelpers.ExecTx(ctx, r.DB, nil, func(tx *sqlx.Tx) error {
		// record and check
		transfer := `
			INSERT INTO item_transfers (listing_id, item_id, buyer_member_id) 
			VALUES (
				$1, $2, $3
			)
			ON CONFLICT(listing_id) DO NOTHING
		`
		res, err := tx.ExecContext(ctx, transfer, listingID, itemID, buyerID)
		if err != nil {
			return wrapDBErr("transfer item, record", err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return fmt.Errorf("transfer item, record rows affected: %w", err)
		}
		if n == 0 {
			transferred = true
			return nil
		}

		// a purchase lands in the buyer's stash, never the bag: the bag may be
		// full or the buyer in a run, and a purchase is never refused for space
		// (FS-VPD8Y R7)
		query := `
			UPDATE item_instances 
			SET 
				owner_member_id = $1,
				status = 'AVAILABLE',
				listing_id = NULL,
				location = 'STASH'
			WHERE status = 'PENDING_SETTLEMENT'
			AND id = $2
			AND listing_id = $3
		`

		res, err = tx.ExecContext(ctx, query, buyerID, itemID, listingID)
		if err != nil {
			return wrapDBErr("transfer item, update", err)
		}
		n, err = res.RowsAffected()
		if err != nil {
			return fmt.Errorf("transfer item, update rows affected: %w", err)
		}
		if n == 0 {
			return errNotTransferable
		}

		transferred = true
		return nil
	})

	if errors.Is(err, errNotTransferable) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return transferred, nil
}

// wornByOwner is true when ii is in its owner's loadout: worn is the loadout
// table, never a location value (FS-VPD8Y R2). Needs ii aliased.
const wornByOwner = `EXISTS (
	SELECT 1 FROM player_loadouts AS pl
	WHERE pl.member_id = ii.owner_member_id
	AND ii.id IN (
		pl.weapon_instance_id, pl.head_instance_id, pl.chest_instance_id,
		pl.gloves_instance_id, pl.legs_instance_id,
		pl.ring_1_instance_id, pl.ring_2_instance_id,
		pl.consumable_1_id, pl.consumable_2_id, pl.consumable_3_id
	)
)`

// LockAccountTx takes member's per-account lock for the rest of tx: every
// write that counts the bag or stash takes it before counting, so two of them
// cannot both pass a cap (FS-VPD8Y R11). A transaction-scoped advisory lock,
// released at commit or rollback; the namespace keeps it apart from any other
// advisory lock on the database.
func (r *repository) LockAccountTx(ctx context.Context, tx *sqlx.Tx, member uuid.UUID) error {
	if _, err := tx.ExecContext(ctx,
		`SELECT pg_advisory_xact_lock(hashtextextended('items.account:' || $1::text, 0))`, member); err != nil {
		return wrapDBErr("lock account", err)
	}
	return nil
}

// placementQuery reads an instance's status, location and whether it is
// worn, only if $2 owns it.
const placementQuery = `
		SELECT ii.status, ii.location, ` + wornByOwner + ` AS worn
		FROM item_instances AS ii
		WHERE ii.id = $1
		AND ii.owner_member_id = $2
	`

// ItemPlacementTx reads what a move checks about itemID, only if owner owns
// it: nil, nil when there is no such instance or it is someone else's, so the
// two read the same (FS-VPD8Y R12).
func (r *repository) ItemPlacementTx(ctx context.Context, tx *sqlx.Tx, owner, itemID uuid.UUID) (*ItemPlacement, error) {
	return itemPlacementTx(ctx, tx, placementQuery, owner, itemID)
}

// LockItemPlacementTx reads what an equip checks about itemID, as
// ItemPlacementTx does, and keeps the row locked for the rest of tx: the equip
// writes the loadout, not the instance, so a listing's conditional reserve
// must wait for tx to see the status this read acted on (FS-18Z5F R32).
func (r *repository) LockItemPlacementTx(ctx context.Context, tx *sqlx.Tx, owner, itemID uuid.UUID) (*ItemPlacement, error) {
	return itemPlacementTx(ctx, tx, placementQuery+" FOR UPDATE OF ii", owner, itemID)
}

func itemPlacementTx(ctx context.Context, tx *sqlx.Tx, query string, owner, itemID uuid.UUID) (*ItemPlacement, error) {
	placement := &ItemPlacement{}
	if err := tx.GetContext(ctx, placement, query, itemID, owner); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, wrapDBErr("read item placement", err)
	}
	return placement, nil
}

// CountUnwornAtTx counts member's instances kept at location and not worn,
// whatever their status: a listed item still occupies its cell (FS-VPD8Y R4).
func (r *repository) CountUnwornAtTx(ctx context.Context, tx *sqlx.Tx, member uuid.UUID, location string) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM item_instances AS ii
		WHERE ii.owner_member_id = $1
		AND ii.location = $2
		AND NOT ` + wornByOwner

	var count int
	if err := tx.GetContext(ctx, &count, query, member, location); err != nil {
		return 0, wrapDBErr("count unworn items", err)
	}
	return count, nil
}

// MoveItemInstanceTx sets itemID's location, only while owner owns it and it
// is AVAILABLE; false when that no longer holds, so a listing that reserved it
// first is never moved (FS-VPD8Y R10).
func (r *repository) MoveItemInstanceTx(ctx context.Context, tx *sqlx.Tx, owner, itemID uuid.UUID, location string) (bool, error) {
	query := `
		UPDATE item_instances
		SET location = $3, updated_at = NOW()
		WHERE id = $1
		AND owner_member_id = $2
		AND status = 'AVAILABLE'
	`

	res, err := tx.ExecContext(ctx, query, itemID, owner, location)
	if err != nil {
		return false, wrapDBErr("move item instance", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("move item instance, rows affected: %w", err)
	}
	return n > 0, nil
}

// SetLocationTx keeps itemID at location, while owner owns it, whatever its
// status: a loadout write sends the slot's instance to the bag
// unconditionally (FS-VPD8Y R16, R17), unlike a move (MoveItemInstanceTx).
func (r *repository) SetLocationTx(ctx context.Context, tx *sqlx.Tx, owner, itemID uuid.UUID, location string) error {
	query := `
		UPDATE item_instances
		SET location = $3, updated_at = NOW()
		WHERE id = $1
		AND owner_member_id = $2
	`

	if _, err := tx.ExecContext(ctx, query, itemID, owner, location); err != nil {
		return wrapDBErr("set item location", err)
	}
	return nil
}

// LoadoutTx reads member's loadout and locks its row for the rest of tx, so a
// settlement writing the loadout waits for the checkout reading it; an empty
// loadout when member has no row yet (FS-18Z5F R7, R11).
func (r *repository) LoadoutTx(ctx context.Context, tx *sqlx.Tx, member uuid.UUID) (*Loadout, error) {
	query := `SELECT ` + loadoutColumns + ` FROM player_loadouts WHERE member_id = $1 FOR UPDATE`

	loadout := &Loadout{}
	if err := tx.GetContext(ctx, loadout, query, member); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &Loadout{}, nil
		}
		return nil, wrapDBErr("read loadout (tx)", err)
	}
	return loadout, nil
}

// runGear matches member's instances (aliased ii) a run carries: worn ones,
// whatever their location, and bag ones. Needs member as $1 and the bag as $3.
const runGear = `ii.owner_member_id = $1 AND (ii.location = $3 OR ` + wornByOwner + `)`

// CheckOutRunGearTx moves member's run gear into the run runID and returns
// what it now carries, newest first (FS-18Z5F R7-R11, ADR-0032). First every
// instance of member still IN_RUN under another run id is re-tagged to runID:
// a member is in one world at a time, so those are orphans of a run that never
// settled (R9). Then the worn and bag instances that are AVAILABLE move to
// IN_RUN under runID; a LISTED or PENDING_SETTLEMENT one stays home, and the
// stash is never touched (R8). Both writes are conditional on status, so a
// listing racing the checkout serializes on the row and one of them misses.
// The read returns exactly the worn and bag instances IN_RUN under runID, so a
// repeat call writes nothing and returns the same set (R10). Neither write sets
// updated_at: the item_instances BEFORE UPDATE trigger stamps it.
func (r *repository) CheckOutRunGearTx(ctx context.Context, tx *sqlx.Tx, member, runID uuid.UUID) ([]*ItemInstance, error) {
	reclaim := `
		UPDATE item_instances
		SET run_id = $2
		WHERE owner_member_id = $1
		AND status = 'IN_RUN'
		AND run_id <> $2
	`
	if _, err := tx.ExecContext(ctx, reclaim, member, runID); err != nil {
		return nil, wrapDBErr("reclaim run gear (tx)", err)
	}

	checkout := `
		UPDATE item_instances AS ii
		SET status = 'IN_RUN', run_id = $2
		WHERE ` + runGear + `
		AND ii.status = 'AVAILABLE'
	`
	if _, err := tx.ExecContext(ctx, checkout, member, runID, LocationBag); err != nil {
		return nil, wrapDBErr("check out run gear (tx)", err)
	}

	read := `
	 SELECT ` + ownedInstanceColumns + `
	 FROM item_instances AS ii
	 JOIN item_templates AS t ON t.id = ii.template_id
	 ` + uniqueEffectJoin + `
	 WHERE ` + runGear + `
	 AND ii.run_id = $2
	 ORDER BY ii.created_at DESC
	`
	items := []*ItemInstance{}
	if err := tx.SelectContext(ctx, &items, read, member, runID, LocationBag); err != nil {
		return nil, wrapDBErr("read run gear (tx)", err)
	}
	return items, nil
}
