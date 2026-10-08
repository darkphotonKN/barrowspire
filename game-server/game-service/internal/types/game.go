package types

import (
	"errors"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/google/uuid"
)

type Player struct {
	ID                   uuid.UUID
	Username             string
	CurrentGameSessionId uuid.UUID
	ConnectState         *constants.ConnectState
	// Character is the character in play, set at HUB entry and seated in
	// every world the player enters until they enter again. Zero until then.
	// FS-BDA7X §Requirements 7.
	Character CharacterInPlay
}

type PlayerState struct {
	ID            uuid.UUID        `json:"id"`
	EntityID      uuid.UUID        `json:"entity_id"`
	Username      string           `json:"username"`
	Class         string           `json:"class"`
	Position      *Position        `json:"position"`
	Direction     *PlayerDirection `json:"direction"`
	Inventory     []*ItemState     `json:"inventory"`
	Equipment     *EquipmentState  `json:"equipment"`
	Escape        bool             `json:"escape"`
	CurrentHealth int              `json:"current_health"`
	MaxHealth     int              `json:"max_health"`
	CurrentMana   int              `json:"current_mana"`
	MaxMana       int              `json:"max_mana"`
	// Progression of the character in play, from the shared experience table.
	// NextLevelAt is absent at the cap. FS-BDA7X §Requirements 21.
	Level       int    `json:"level"`
	Experience  int64  `json:"experience"`
	LevelFloor  int64  `json:"level_floor"`
	NextLevelAt *int64 `json:"next_level_at,omitempty"`
}

type EquipmentState struct {
	Weapon      *ItemState `json:"weapon"`
	Head        *ItemState `json:"head"`
	Chest       *ItemState `json:"chest"`
	Gloves      *ItemState `json:"gloves"`
	Legs        *ItemState `json:"legs"`
	Ring1       *ItemState `json:"ring_1"`
	Ring2       *ItemState `json:"ring_2"`
	Consumable1 *ItemState `json:"consumable_1"`
	Consumable2 *ItemState `json:"consumable_2"`
	Consumable3 *ItemState `json:"consumable_3"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Velocity struct {
	Vx float64 `json:"vx"`
	Vy float64 `json:"vy"`
}

type PlayerDirection struct {
	VX    float64 `json:"vx"`
	VY    float64 `json:"vy"`
	Speed float64 `json:"speed"`
}

type DoorState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
	Width    float64   `json:"width"`
	Height   float64   `json:"height"`
	IsOpen   bool      `json:"is_open"`
}

type ItemState struct {
	ItemID   uuid.UUID `json:"item_id"`   // base item id
	EntityID uuid.UUID `json:"entity_id"` // unique items entity id
	Name     string    `json:"name"`
	// ItemType is the item's types.ItemType, sent for every item so the client
	// never infers it from the stats present. FS-4R9M9 §Requirements 54.
	ItemType      ItemType  `json:"item_type"`
	Quantity      int       `json:"quantity"`
	AttackPower   int32     `json:"attack_power,omitempty"`   // weapon
	CriticalRate  float32   `json:"critical_rate,omitempty"`  // weapon
	WeaponType    string    `json:"weapon_type,omitempty"`    // weapon
	DefenseRating int32     `json:"defense_rating,omitempty"` // armor
	ArmorSlot     ArmorSlot `json:"armor_slot,omitempty"`     // armor
	HealingAmount int32     `json:"healing_amount,omitempty"` // consumable
	ManaAmount    int32     `json:"mana_amount,omitempty"`    // consumable
	Description   string    `json:"description,omitempty"`    // all types
	// RequiredLevel is the character level the item needs to be equipped;
	// absent means level 1. FS-BDA7X §Requirements 30.
	RequiredLevel int `json:"required_level,omitempty"`

	// The item's roll, FS-4R9M9 §Requirements 54: its rarity code (absent =
	// none), item level (absent = unrolled), affixes, armor magic resistance
	// and, for a unique, its effect text.
	Rarity          string  `json:"rarity,omitempty"`
	ItemLevel       int     `json:"item_level,omitempty"`
	Affixes         []Affix `json:"affixes,omitempty"`
	MagicResistance int32   `json:"magic_resistance,omitempty"` // armor
	UniqueEffect    string  `json:"unique_effect,omitempty"`
}

type ContainerState struct {
	ContainerID uuid.UUID `json:"container_id"`
	EntityID    uuid.UUID `json:"entity_id"`
	// Kind is "chest" or "drop_pile". FS-4R9M9 §Requirements 55.
	Kind     string       `json:"kind"`
	Position *Position    `json:"position"`
	IsOpen   bool         `json:"is_open"`
	Items    []*ItemState `json:"items"`
}

type RawMatchState struct {
	SessionID uuid.UUID
	StartedAt time.Time
	EndedAt   time.Time
	Players   []RawPlayerState
	// [player's memberID] Position
	EliminationOrder map[uuid.UUID]int
	// every character in the run and what it earned there, members removed
	// before the end included. FS-BDA7X §Requirements 22–23.
	Progress []RunProgress
}

type RawPlayerState struct {
	MemberID  string
	Username  string
	Kills     int32
	Deaths    int32
	Escape    bool
	Equipment ExtractedEquipment
	Inventory []*ExtractedItem
}

type RankedPlayerState struct {
	MemberID      string
	Username      string
	Kills         int32
	Deaths        int32
	FinalPosition int32
	Win           bool
	Escape        bool
	Equipment     ExtractedEquipment
	Inventory     []*ExtractedItem
}

type ExtractedItem struct {
	TemplateID uuid.UUID
	ItemType   string
	Name       string

	// Weapon stats
	AttackPower  int
	CriticalRate float64
	WeaponType   string

	// Armor stats
	DefenseRating   int
	MagicResistance int
	ArmorSlot       string

	// Consumable stats
	HealingAmount int
	ManaAmount    int
	BuffDuration  int

	// Shared
	BuyPrice    int
	SellPrice   int
	Description string

	InstanceID *uuid.UUID
	RarityID   string // item_rarities.id; empty = none

	// The roll the item keeps for life: its item level (0 = unrolled), its
	// derived required level (0 = none of its own) and its affixes.
	// FS-4R9M9 §Requirements 49.
	ItemLevel     int
	RequiredLevel int
	Affixes       []Affix
}

type ExtractedEquipment struct {
	// Weapons
	WeaponSlot *ExtractedItem

	// Armor
	HeadSlot   *ExtractedItem
	ChestSlot  *ExtractedItem
	GlovesSlot *ExtractedItem
	LegsSlot   *ExtractedItem

	// Accessories
	Ring1Slot *ExtractedItem
	Ring2Slot *ExtractedItem

	// Consumablesected events
	Consumable1 *ExtractedItem
	Consumable2 *ExtractedItem
	Consumable3 *ExtractedItem
}

type FormattedMatchData struct {
	MatchEndedEvent     []byte
	ItemsExtractedEvent []byte
}

type WallState struct {
	HouseID  uuid.UUID `json:"house_id"`
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
	Width    float64   `json:"width"`
	Height   float64   `json:"height"`
}

type EscapeDoorState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
	IsOpen   bool      `json:"is_open"`
	IsLocked bool      `json:"is_locked"`
}

// NPCState is one of the hub's residents as the client sees them. Function is
// empty for an ambient NPC, who opens nothing.
type NPCState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Name     string    `json:"name"`
	Function string    `json:"function"`
	// How they look; empty for a function NPC.
	Appearance string    `json:"appearance"`
	Position   *Position `json:"position"`
}

// MonsterState is one monster in a run's broadcast, corpses included until they
// are removed. FS-77AB6 §Requirements 32.
type MonsterState struct {
	EntityID uuid.UUID `json:"entity_id"`
	// ghoul | troll | demon
	Archetype string `json:"archetype"`
	// server-authored, elite prefix included, level excluded: the client
	// composes the nameplate
	Name     string   `json:"name"`
	Level    int      `json:"level"`
	Elite    bool     `json:"elite"`
	Boss     bool     `json:"boss"`
	Position Position `json:"position"`
	// the direction it faces; never zero
	Facing Position `json:"facing"`
	// idle | move | attack | dead
	Action        string `json:"action"`
	CurrentHealth int    `json:"current_health"`
	MaxHealth     int    `json:"max_health"`
}

// StairsState is the floor's way up. FS-F6F88 §Requirements 27.
type StairsState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
}

type SwitchState struct {
	EntityID    uuid.UUID `json:"entity_id"`
	Position    *Position `json:"position"`
	SwitchID    int       `json:"switch_id"`
	IsActivated bool      `json:"is_activated"`
}

type ItemConfig struct {
	TemplateID      uuid.UUID
	ItemType        ItemType
	Name            string
	AttackPower     int
	CriticalRate    float64
	WeaponType      string
	DefenseRating   int
	MagicResistance int
	ArmorSlot       ArmorSlot
	HealingAmount   int
	ManaAmount      int
	BuffDuration    int
	BuyPrice        int
	SellPrice       int
	Description     string

	InstanceID *uuid.UUID
	RarityID   string // item_rarities.id; empty = none
	// RarityCode is that rarity's item_rarities.rarity_code; empty = none.
	// FS-4R9M9 §Requirements 54.
	RarityCode string

	// RequiredLevel is the character level needed to equip the item, as the
	// item carries it; 0 means unset (level 1). FS-BDA7X §Requirements 30. A
	// rolled item carries the derived value (FS-4R9M9 §Requirements 23).
	RequiredLevel int

	// ItemLevel is fixed at the roll; 0 means unrolled. FS-4R9M9 §Requirements 10.
	ItemLevel int
	// Affixes are rolled once and never re-rolled. FS-4R9M9 §Requirements 16–20.
	Affixes []Affix

	// A unique's effect code and the one line shown to players; empty for
	// anything else. FS-4R9M9 §Requirements 6, 31.
	UniqueEffectCode string
	UniqueEffectText string
}

// Affix is one rolled stat bonus: a stat code from the affix table, the tier it
// rolled at (0 = a unique's fixed affix) and its value. FS-4R9M9 §Requirements 16, 19.
type Affix struct {
	Stat  string `json:"stat"`
	Tier  int    `json:"tier"`
	Value int    `json:"value"`
}

// Affix stat codes. FS-4R9M9 §Requirements 17.
const (
	AffixStrength        = "strength"
	AffixAgility         = "agility"
	AffixIntelligence    = "intelligence"
	AffixMaxHealth       = "max_health"
	AffixMaxMana         = "max_mana"
	AffixAttackSpeed     = "attack_speed"
	AffixMoveSpeed       = "move_speed"
	AffixCritChance      = "crit_chance"
	AffixFlatDamage      = "flat_damage"
	AffixDefense         = "defense"
	AffixMagicResistance = "magic_resistance"
)

// Unique effect codes: the effects this game-service knows. A unique whose
// code is not one of these never drops. FS-4R9M9 §Requirements 30–37.
const (
	UniqueEffectKillFrenzy      = "kill_frenzy"
	UniqueEffectMeleeReflect    = "melee_reflect"
	UniqueEffectPierce          = "pierce"
	UniqueEffectKillHeal        = "kill_heal"
	UniqueEffectBurningDash     = "burning_dash"
	UniqueEffectFloorAttributes = "floor_attributes"
)

type ItemType string

const (
	ItemTypeWeapon     ItemType = "weapon"
	ItemTypeArmor      ItemType = "armor"
	ItemTypeConsumable ItemType = "consumable"
	// ItemTypeRing has no base stats: its power is its affixes. FS-4R9M9 §Requirements 5.
	ItemTypeRing ItemType = "ring"
)

type ArmorSlot string

const (
	ArmorSlotHead   ArmorSlot = "head"
	ArmorSlotChest  ArmorSlot = "chest"
	ArmorSlotLegs   ArmorSlot = "legs"
	ArmorSlotGloves ArmorSlot = "gloves"
)

type ItemInstance struct {
	Id              uuid.UUID  `db:"id"`
	TemplateId      uuid.UUID  `db:"template_id"`
	OwnerMemberId   uuid.UUID  `db:"owner_member_id"`
	Source          string     `db:"source"`
	ItemType        string     `db:"item_type"`
	Name            string     `db:"name"`
	RarityId        *uuid.UUID `db:"rarity_id"`
	AttackPower     *int       `db:"attack_power"`
	CriticalRate    *float64   `db:"critical_rate"`
	WeaponType      *string    `db:"weapon_type"`
	DefenseRating   *int       `db:"defense_rating"`
	MagicResistance *int       `db:"magic_resistance"`
	ArmorSlot       *string    `db:"armor_slot"`
	HealingAmount   *int       `db:"healing_amount"`
	ManaAmount      *int       `db:"mana_amount"`
	BuffDuration    *int       `db:"buff_duration"`
	BuyPrice        *int       `db:"buy_price"`
	SellPrice       *int       `db:"sell_price"`
	Description     *string    `db:"description"`
	AcquiredAt      time.Time  `db:"acquired_at"`
	CreatedAt       time.Time  `db:"created_at"`
	UpdatedAt       time.Time  `db:"updated_at"`
}

// ErrCharacterNotFound is a character that is not the member's to play:
// another member's, a deleted one, and an unknown one alike, so a refusal is
// no existence oracle. FS-BDA7X §Requirements 1, 6.
var ErrCharacterNotFound = errors.New("character not found")

// CharacterInPlay is the character a member is playing: resolved from
// character-service at HUB entry, by id and scoped to the member, and carried
// on the player record across every world they are seated in. Its class, name,
// level and experience come from that record, never from the client.
// FS-BDA7X §Requirements 5, 7.
type CharacterInPlay struct {
	ID    uuid.UUID
	Name  string
	Class string
	// 1..progression.MaxLevel; anything below 1 seats as level 1
	Level int
	// total experience, monotonic
	Experience int64
}

// RunProgress is what a run did to one member's character in play. Gained is
// the experience earned in the run. Seated members are still in the run's world
// at its end, and Level and Experience are where their body finished; a member
// removed before the end has only Gained. FS-BDA7X §Requirements 22–24.
type RunProgress struct {
	MemberID    uuid.UUID
	CharacterID uuid.UUID
	Gained      int64
	Seated      bool
	Level       int
	Experience  int64
}
