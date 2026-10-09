package items

import (
	"time"

	"github.com/google/uuid"
)

// ItemType represents item type enum (weapon, armor, consumable, etc.)
type ItemType struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	TypeCode    string     `db:"type_code" json:"type_code"` // 'weapon', 'armor', 'consumable'
	Name        string     `db:"name" json:"name"`           // 'Weapon', 'Armor'
	Description *string    `db:"description" json:"description"`
	IsActive    bool       `db:"is_active" json:"is_active"`
	SortOrder   int        `db:"sort_order" json:"sort_order"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	CreatedBy   *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updated_at"`
	UpdatedBy   *uuid.UUID `db:"updated_by" json:"updated_by"`
}

// ItemRarity represents rarity level (common, rare, epic, legendary)
type ItemRarity struct {
	ID                 uuid.UUID  `db:"id" json:"id"`
	RarityCode         string     `db:"rarity_code" json:"rarity_code"`                   // 'common', 'legendary'
	RarityName         string     `db:"rarity_name" json:"rarity_name"`                   // 'Common', 'Legendary'
	ColorHex           *string    `db:"color_hex" json:"color_hex"`                       // '#FFD700'
	DropRateMultiplier float64    `db:"drop_rate_multiplier" json:"drop_rate_multiplier"` // 0.01 ~ 1.00
	SortOrder          int        `db:"sort_order" json:"sort_order"`
	CreatedAt          time.Time  `db:"created_at" json:"created_at"`
	CreatedBy          *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedAt          time.Time  `db:"updated_at" json:"updated_at"`
	UpdatedBy          *uuid.UUID `db:"updated_by" json:"updated_by"`
}

// Weapon represents weapon-specific attributes
type Weapon struct {
	ID           uuid.UUID  `db:"id" json:"id"`
	RarityID     uuid.UUID  `db:"rarity_id" json:"rarity_id"`
	AttackPower  int        `db:"attack_power" json:"attack_power"`
	CriticalRate *float64   `db:"critical_rate" json:"critical_rate"` // 0.00 ~ 1.00
	WeaponType   *string    `db:"weapon_type" json:"weapon_type"`     // 'sword', 'axe', 'bow'
	Description  *string    `db:"description" json:"description"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
	CreatedBy    *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedAt    time.Time  `db:"updated_at" json:"updated_at"`
	UpdatedBy    *uuid.UUID `db:"updated_by" json:"updated_by"`
}

// Armor represents armor-specific attributes
type Armor struct {
	ID              uuid.UUID  `db:"id" json:"id"`
	RarityID        uuid.UUID  `db:"rarity_id" json:"rarity_id"`
	DefenseRating   int        `db:"defense_rating" json:"defense_rating"`
	MagicResistance *int       `db:"magic_resistance" json:"magic_resistance"`
	ArmorSlot       *string    `db:"armor_slot" json:"armor_slot"` // 'head', 'chest', 'legs', 'gloves'
	Description     *string    `db:"description" json:"description"`
	CreatedAt       time.Time  `db:"created_at" json:"created_at"`
	CreatedBy       *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedAt       time.Time  `db:"updated_at" json:"updated_at"`
	UpdatedBy       *uuid.UUID `db:"updated_by" json:"updated_by"`
}

// Consumable represents consumable item attributes
type Consumable struct {
	ID            uuid.UUID  `db:"id" json:"id"`
	RarityID      uuid.UUID  `db:"rarity_id" json:"rarity_id"`
	HealingAmount *int       `db:"healing_amount" json:"healing_amount"`
	ManaAmount    *int       `db:"mana_amount" json:"mana_amount"`
	BuffDuration  *int       `db:"buff_duration" json:"buff_duration"`   // seconds
	MaxStackSize  int        `db:"max_stack_size" json:"max_stack_size"` // default 99
	Description   *string    `db:"description" json:"description"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
	CreatedBy     *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedAt     time.Time  `db:"updated_at" json:"updated_at"`
	UpdatedBy     *uuid.UUID `db:"updated_by" json:"updated_by"`
}

// ItemTemplate is the write model mirrors item_templates table columns directly.
// For read queries with joins, use ItemTemplateAggregate instead.
type ItemTemplate struct {
	ID            uuid.UUID `db:"id" json:"id"`
	ItemName      string    `db:"item_name" json:"item_name"`
	RarityID      uuid.UUID `db:"rarity_id" json:"rarity_id"`
	ItemType      string    `db:"item_type" json:"item_type"`
	ItemID        uuid.UUID `db:"item_id" json:"item_id"`
	IconURL       *string   `db:"icon_url" json:"icon_url"`
	RequiredLevel int       `db:"required_level" json:"required_level"`
	// MinItemLevel is the lowest item level the template drops at (FS-4R9M9
	// R1). Read-only here: inserts take the column default of 1.
	MinItemLevel int        `db:"min_item_level" json:"min_item_level"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
	CreatedBy    *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedAt    time.Time  `db:"updated_at" json:"updated_at"`
	UpdatedBy    *uuid.UUID `db:"updated_by" json:"updated_by"`
}

// Combined shape for itemtemplate joined with weapons, armors, consumables, and
// rarity.
type ItemTemplateAggregate struct {
	ID       uuid.UUID `db:"id" json:"id"`
	ItemName string    `db:"item_name" json:"item_name"`

	// base template
	Rarity        string  `db:"rarity" json:"rarity"`
	ItemType      string  `db:"item_type" json:"item_type"`
	IconURL       *string `db:"icon_url" json:"icon_url"`
	RequiredLevel int     `db:"required_level" json:"required_level"`

	// weapon
	AttackPower  *int     `db:"attack_power" json:"attack_power"`
	CriticalRate *float64 `db:"critical_rate" json:"critical_rate"` // 0.00 ~ 1.00
	WeaponType   *string  `db:"weapon_type" json:"weapon_type"`     // 'sword', 'axe', 'bow'

	// armor
	DefenseRating   *int    `db:"defense_rating" json:"defense_rating"`
	MagicResistance *int    `db:"magic_resistance" json:"magic_resistance"`
	ArmorSlot       *string `db:"armor_slot" json:"armor_slot"` // 'head', 'chest', 'legs', 'shield'

	// consumable
	HealingAmount *int `db:"healing_amount" json:"healing_amount"`
	ManaAmount    *int `db:"mana_amount" json:"mana_amount"`
	BuffDuration  *int `db:"buff_duration" json:"buff_duration"`   // seconds
	MaxStackSize  *int `db:"max_stack_size" json:"max_stack_size"` // default 99

	// coalesced
	Description *string `db:"description" json:"description"`

	// MinItemLevel is the lowest item level the template drops at (FS-4R9M9 R1).
	MinItemLevel int `db:"min_item_level" json:"min_item_level"`

	// unique row (FS-4R9M9 R6); all nil for a template that is not a unique
	UniqueEffectCode   *string     `db:"unique_effect_code" json:"unique_effect_code"`
	UniqueEffectText   *string     `db:"unique_effect_text" json:"unique_effect_text"`
	UniqueFixedAffixes AffixRanges `db:"unique_fixed_affixes" json:"unique_fixed_affixes"`

	// base
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
	CreatedBy *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedAt time.Time  `db:"updated_at" json:"updated_at"`
	UpdatedBy *uuid.UUID `db:"updated_by" json:"updated_by"`
}

// ItemInstance mirrors the item_instances table — a concrete owned item
// (rolled from a template) belonging to a member.
type ItemInstance struct {
	ID            uuid.UUID `db:"id" json:"id"`
	TemplateID    uuid.UUID `db:"template_id" json:"template_id"`
	OwnerMemberID uuid.UUID `db:"owner_member_id" json:"owner_member_id"`
	Source        string    `db:"source" json:"source"` // 'extracted' | 'starting_gear' | 'reward'

	ItemType string     `db:"item_type" json:"item_type"` // 'weapon' | 'armor' | 'consumable' | 'ring'
	Name     string     `db:"name" json:"name"`
	RarityID *uuid.UUID `db:"rarity_id" json:"rarity_id"`

	// Weapon stats (null if not weapon)
	AttackPower  *int     `db:"attack_power" json:"attack_power"`
	CriticalRate *float64 `db:"critical_rate" json:"critical_rate"`
	WeaponType   *string  `db:"weapon_type" json:"weapon_type"`

	// Armor stats (null if not armor)
	DefenseRating   *int    `db:"defense_rating" json:"defense_rating"`
	MagicResistance *int    `db:"magic_resistance" json:"magic_resistance"`
	ArmorSlot       *string `db:"armor_slot" json:"armor_slot"` // 'head' | 'chest' | 'legs' | 'gloves'

	// Consumable stats (null if not consumable)
	HealingAmount *int `db:"healing_amount" json:"healing_amount"`
	ManaAmount    *int `db:"mana_amount" json:"mana_amount"`
	BuffDuration  *int `db:"buff_duration" json:"buff_duration"`

	Durability *int `db:"durability" json:"durability"`

	Description *string `db:"description" json:"description"`
	Status      string  `db:"status" json:"status"`

	// RequiredLevel is the level needed to equip (FS-BDA7X Req 30). Reads give
	// the instance's own requirement, else its template's (FS-4R9M9 R48, R51);
	// on a write, 0 means the instance has none of its own and stores NULL.
	RequiredLevel int `db:"required_level" json:"required_level"`

	// ItemLevel is the level the item dropped at, >= 1 (FS-4R9M9 R48).
	ItemLevel int `db:"item_level" json:"item_level"`
	// Affixes are rolled once and never re-rolled (FS-4R9M9 R20).
	Affixes Affixes `db:"affixes" json:"affixes"`

	// UniqueEffectCode and UniqueEffectText come from the unique row of the
	// instance's template; nil for a non-unique (FS-4R9M9 R51). Read-only.
	UniqueEffectCode *string `db:"unique_effect_code" json:"unique_effect_code"`
	UniqueEffectText *string `db:"unique_effect_text" json:"unique_effect_text"`

	// ListingID is the listing the item is reserved for (FS-NXP1W Req 24a);
	// NULL unless the item is LISTED or further along a settlement.
	ListingID *uuid.UUID `db:"listing_id" json:"listing_id"`

	AcquiredAt time.Time `db:"acquired_at" json:"acquired_at"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
	UpdatedAt  time.Time `db:"updated_at" json:"updated_at"`
	ReservedAt time.Time `db:"reserved_at" json:"reserved_at"`
}

// PlayerLoadout mirrors the player_loadouts table — a member's currently
// equipped item instances across weapon, armor slots, and consumable slots.
type PlayerLoadout struct {
	ID       uuid.UUID `db:"id" json:"id"`
	MemberID uuid.UUID `db:"member_id" json:"member_id"`

	WeaponInstanceID *uuid.UUID `db:"weapon_instance_id" json:"weapon_instance_id"`

	HeadInstanceID   *uuid.UUID `db:"head_instance_id" json:"head_instance_id"`
	ChestInstanceID  *uuid.UUID `db:"chest_instance_id" json:"chest_instance_id"`
	LegsInstanceID   *uuid.UUID `db:"legs_instance_id" json:"legs_instance_id"`
	GlovesInstanceID *uuid.UUID `db:"gloves_instance_id" json:"gloves_instance_id"`

	Ring1InstanceID *uuid.UUID `db:"ring_1_instance_id" json:"ring_1_instance_id"`
	Ring2InstanceID *uuid.UUID `db:"ring_2_instance_id" json:"ring_2_instance_id"`

	Consumable1ID *uuid.UUID `db:"consumable_1_id" json:"consumable_1_id"`
	Consumable2ID *uuid.UUID `db:"consumable_2_id" json:"consumable_2_id"`
	Consumable3ID *uuid.UUID `db:"consumable_3_id" json:"consumable_3_id"`

	CreatedAt time.Time `db:"created_at" json:"created_at"`
	UpdatedAt time.Time `db:"updated_at" json:"updated_at"`
}

// UpsertPlayerLoadoutRequest is the param shape for upserting a player's full
// loadout in one call. MemberID is the conflict / WHERE key. Each slot pointer
// is nullable: nil means "clear this slot", a value means "set to this instance".
type UpsertPlayerLoadoutRequest struct {
	MemberID uuid.UUID `db:"member_id" json:"member_id"`

	WeaponInstanceID *uuid.UUID `db:"weapon_instance_id" json:"weapon_instance_id"`

	HeadInstanceID   *uuid.UUID `db:"head_instance_id" json:"head_instance_id"`
	ChestInstanceID  *uuid.UUID `db:"chest_instance_id" json:"chest_instance_id"`
	LegsInstanceID   *uuid.UUID `db:"legs_instance_id" json:"legs_instance_id"`
	GlovesInstanceID *uuid.UUID `db:"gloves_instance_id" json:"gloves_instance_id"`

	Ring1InstanceID *uuid.UUID `db:"ring_1_instance_id" json:"ring_1_instance_id"`
	Ring2InstanceID *uuid.UUID `db:"ring_2_instance_id" json:"ring_2_instance_id"`

	Consumable1ID *uuid.UUID `db:"consumable_1_id" json:"consumable_1_id"`
	Consumable2ID *uuid.UUID `db:"consumable_2_id" json:"consumable_2_id"`
	Consumable3ID *uuid.UUID `db:"consumable_3_id" json:"consumable_3_id"`
}

// CreateItemTypeRequest represents the request to create an item type
type CreateItemTypeRequest struct {
	TypeCode    string  `json:"type_code" binding:"required"`
	Name        string  `json:"name" binding:"required"`
	Description *string `json:"description"`
	SortOrder   int     `json:"sort_order"`
}

// CreateItemRarityRequest represents the request to create an item rarity
type CreateItemRarityRequest struct {
	RarityCode         string  `json:"rarity_code" binding:"required"`
	RarityName         string  `json:"rarity_name" binding:"required"`
	ColorHex           *string `json:"color_hex"`
	DropRateMultiplier float64 `json:"drop_rate_multiplier" binding:"required,gt=0,lte=1"`
	SortOrder          int     `json:"sort_order"`
}

// CreateWeaponRequest represents the request to create a weapon
type CreateWeaponRequest struct {
	RarityID     uuid.UUID `json:"rarity_id" binding:"required"`
	AttackPower  int       `json:"attack_power" binding:"required,gte=0"`
	CriticalRate *float64  `json:"critical_rate"`
	WeaponType   *string   `json:"weapon_type"`
	Description  *string   `json:"description"`
}

// CreateArmorRequest represents the request to create an armor
type CreateArmorRequest struct {
	RarityID        uuid.UUID `json:"rarity_id" binding:"required"`
	DefenseRating   int       `json:"defense_rating" binding:"required,gte=0"`
	MagicResistance *int      `json:"magic_resistance"`
	ArmorSlot       *string   `json:"armor_slot"`
	Description     *string   `json:"description"`
}

// CreateConsumableRequest represents the request to create a consumable
type CreateConsumableRequest struct {
	RarityID      uuid.UUID `json:"rarity_id" binding:"required"`
	HealingAmount *int      `json:"healing_amount"`
	ManaAmount    *int      `json:"mana_amount"`
	BuffDuration  *int      `json:"buff_duration"`
	MaxStackSize  int       `json:"max_stack_size" binding:"required,gt=0"`
	Description   *string   `json:"description"`
}

// CreateItemTemplateRequest represents the request to create an item template
type CreateItemTemplateRequest struct {
	UserId        string    `json:"user_id" binding:"required"`
	ItemName      string    `json:"item_name" binding:"required"`
	RarityID      uuid.UUID `json:"rarity_id" binding:"required"`
	ItemType      string    `json:"item_type"`
	ItemID        uuid.UUID `json:"item_id"`
	IconURL       *string   `json:"icon_url"`
	RequiredLevel *int      `json:"required_level"`
}

// CreateCompleteWeaponRequest represents the request to create a complete weapon with template
type CreateCompleteWeaponRequest struct {
	// User info
	UserId string `json:"user_id" binding:"required"`

	// Template fields (common attributes)
	ItemName string  `json:"item_name" binding:"required"`
	IconURL  *string `json:"icon_url"`

	RequiredLevel *int `json:"required_level"`

	// Weapon-specific fields
	RarityID     uuid.UUID `json:"rarity_id" binding:"required"`
	AttackPower  int       `json:"attack_power" binding:"required,gte=0"`
	CriticalRate *float64  `json:"critical_rate"`
	WeaponType   *string   `json:"weapon_type"`
	Description  *string   `json:"description"`
}

// CreateCompleteArmorRequest represents the request to create a complete armor with template
type CreateCompleteArmorRequest struct {
	// User info
	UserId string `json:"user_id" binding:"required"`

	// Template fields (common attributes)
	ItemName string  `json:"item_name" binding:"required"`
	IconURL  *string `json:"icon_url"`

	RequiredLevel *int `json:"required_level"`

	// Armor-specific fields
	RarityID        uuid.UUID `json:"rarity_id" binding:"required"`
	DefenseRating   int       `json:"defense_rating" binding:"required,gte=0"`
	MagicResistance *int      `json:"magic_resistance"`
	ArmorSlot       *string   `json:"armor_slot"`
	Description     *string   `json:"description"`
}

// CreateCompleteConsumableRequest represents the request to create a complete consumable with template
type CreateCompleteConsumableRequest struct {
	// User info
	UserId string `json:"user_id" binding:"required"`

	// Template fields (common attributes)
	ItemName string  `json:"item_name" binding:"required"`
	IconURL  *string `json:"icon_url"`

	RequiredLevel *int `json:"required_level"`

	// Consumable-specific fields
	RarityID      uuid.UUID `json:"rarity_id" binding:"required"`
	HealingAmount *int      `json:"healing_amount"`
	ManaAmount    *int      `json:"mana_amount"`
	BuffDuration  *int      `json:"buff_duration"`
	MaxStackSize  int       `json:"max_stack_size" binding:"required,gt=0"`
	Description   *string   `json:"description"`
}

// ArmorWithTemplate represents an armor joined with its item template
type ArmorWithTemplate struct {
	// Armor fields
	ID              uuid.UUID `db:"id"`
	RarityID        uuid.UUID `db:"rarity_id"`
	DefenseRating   int       `db:"defense_rating"`
	MagicResistance *int      `db:"magic_resistance"`
	ArmorSlot       *string   `db:"armor_slot"`
	Description     *string   `db:"description"`
	CreatedAt       time.Time `db:"created_at"`
	UpdatedAt       time.Time `db:"updated_at"`

	// ItemTemplate fields
	ItemTemplateID uuid.UUID `db:"item_template_id"`
	ItemName       string    `db:"item_name"`
	IconURL        *string   `db:"icon_url"`
	RequiredLevel  int       `db:"required_level"`
}

// ConsumableWithTemplate represents a consumable joined with its item template
type ConsumableWithTemplate struct {
	// Consumable fields
	ID            uuid.UUID `db:"id"`
	RarityID      uuid.UUID `db:"rarity_id"`
	HealingAmount *int      `db:"healing_amount"`
	ManaAmount    *int      `db:"mana_amount"`
	BuffDuration  *int      `db:"buff_duration"`
	MaxStackSize  int       `db:"max_stack_size"`
	Description   *string   `db:"description"`
	CreatedAt     time.Time `db:"created_at"`
	UpdatedAt     time.Time `db:"updated_at"`

	// ItemTemplate fields
	ItemTemplateID uuid.UUID `db:"item_template_id"`
	ItemName       string    `db:"item_name"`
	IconURL        *string   `db:"icon_url"`
	RequiredLevel  int       `db:"required_level"`
}

// WeaponWithTemplate represents a weapon joined with its item template
// This is used for detailed queries that need both weapon and template information
type WeaponWithTemplate struct {
	// Weapon fields
	ID           uuid.UUID `db:"id"`
	RarityID     uuid.UUID `db:"rarity_id"`
	AttackPower  int       `db:"attack_power"`
	CriticalRate *float64  `db:"critical_rate"`
	WeaponType   *string   `db:"weapon_type"`
	Description  *string   `db:"description"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`

	// ItemTemplate fields
	ItemTemplateID uuid.UUID `db:"item_template_id"`
	ItemName       string    `db:"item_name"`
	IconURL        *string   `db:"icon_url"`
	RequiredLevel  int       `db:"required_level"`
}

type GetLoadoutRequest struct {
	MemberId uuid.UUID `json:"member_id" binding:"required"`
}

type Loadout struct {
	Id            *uuid.UUID `db:"id"`
	MemberId      *uuid.UUID `db:"member_id"`
	WeaponId      *uuid.UUID `db:"weapon_instance_id"`
	HeadId        *uuid.UUID `db:"head_instance_id"`
	ChestId       *uuid.UUID `db:"chest_instance_id"`
	GlovesId      *uuid.UUID `db:"gloves_instance_id"`
	LegsId        *uuid.UUID `db:"legs_instance_id"`
	Ring1Id       *uuid.UUID `db:"ring_1_instance_id"`
	Ring2Id       *uuid.UUID `db:"ring_2_instance_id"`
	Consumable1Id *uuid.UUID `db:"consumable_1_id"`
	Consumable2Id *uuid.UUID `db:"consumable_2_id"`
	Consumable3Id *uuid.UUID `db:"consumable_3_id"`
	CreatedAt     time.Time  `db:"created_at"`
	UpdatedAt     time.Time  `db:"updated_at"`
}

type LoadoutWithItems struct {
	Weapon      *ItemInstance
	Head        *ItemInstance
	Chest       *ItemInstance
	Gloves      *ItemInstance
	Legs        *ItemInstance
	Ring1       *ItemInstance
	Ring2       *ItemInstance
	Consumable1 *ItemInstance
	Consumable2 *ItemInstance
	Consumable3 *ItemInstance
}

type ListItemInstancesRequest struct {
	MemberId uuid.UUID `json:"member_id" binding:"required"`
}

type UpdateLoadoutRequest struct {
	MemberId       uuid.UUID  `json:"member_id" binding:"required"`
	Slot           string     `json:"slot" binding:"required"`
	ItemInstanceId *uuid.UUID `json:"item_instance_id"`
}

// ItemSummary is what anyone may see of an item instance (FS-8EGFA
// §Requirements 9): what it is and how strong, never whose it is, where it came
// from or what it cost. A nil stat is one the item type does not have.
type ItemSummary struct {
	ID          uuid.UUID `db:"id"`
	Name        string    `db:"name"`
	Description *string   `db:"description"`
	ItemType    string    `db:"item_type"` // 'weapon' | 'armor' | 'consumable' | 'ring'
	// Rarity is the tier's code (normal, uncommon, rare, runed, fabled), empty
	// for an instance that carries no rarity.
	Rarity     string  `db:"rarity"`
	WeaponType *string `db:"weapon_type"`
	ArmorSlot  *string `db:"armor_slot"`

	AttackPower     *int     `db:"attack_power"`
	CriticalRate    *float64 `db:"critical_rate"`
	DefenseRating   *int     `db:"defense_rating"`
	MagicResistance *int     `db:"magic_resistance"`
	HealingAmount   *int     `db:"healing_amount"`
	ManaAmount      *int     `db:"mana_amount"`
	BuffDuration    *int     `db:"buff_duration"`

	// FS-4R9M9 R52: item level, the derived required level (the instance's
	// own, else its template's) and the rolled affixes.
	ItemLevel     int     `db:"item_level"`
	RequiredLevel int     `db:"required_level"`
	Affixes       Affixes `db:"affixes"`
	// UniqueEffectText is a unique's effect text, nil otherwise. The effect
	// code is not public (FS-4R9M9 R52).
	UniqueEffectText *string `db:"unique_effect_text"`
}
