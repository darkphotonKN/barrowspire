package types

import (
	"errors"
	"time"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
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
	// Token is the bearer token the member last connected with, refreshed on
	// every reconnect. Worlds load the member's worn gear with it. It is held,
	// not renewed: a member who stays in the hub past its expiry is seated in
	// their next world without gear until they reconnect.
	Token BearerToken `json:"-"`
}

// PlayerState is one player's state in a broadcast: what they show anyone in
// their world, and their bag and worn gear, which only their own frame carries
// (CurrentPlayerState). Another recipient is sent the shown part alone
// (OtherPlayerState). FS-KE075 §I Requirements 51–52, ADR-0064.
type PlayerState struct {
	PublicPlayerState
	Inventory []*ItemState    `json:"inventory"`
	Equipment *EquipmentState `json:"equipment"`
}

// PublicPlayerState is what a player shows anyone in their world: who they
// are, where they stand, how hale and how far along they are. Never their bag
// or worn gear: a later feature that needs those fetches them on demand.
// ADR-0064.
type PublicPlayerState struct {
	ID            uuid.UUID        `json:"id"`
	EntityID      uuid.UUID        `json:"entity_id"`
	Username      string           `json:"username"`
	Class         string           `json:"class"`
	Position      *Position        `json:"position"`
	Direction     *PlayerDirection `json:"direction"`
	Escape        bool             `json:"escape"`
	CurrentHealth int              `json:"current_health"`
	MaxHealth     int              `json:"max_health"`
	// Progression of the character in play, from the shared experience table.
	// NextLevelAt is absent at the cap. FS-BDA7X §Requirements 21.
	Level       int    `json:"level"`
	Experience  int64  `json:"experience"`
	LevelFloor  int64  `json:"level_floor"`
	NextLevelAt *int64 `json:"next_level_at,omitempty"`
	// Specialization is the body's (systems.Specialization), public as the
	// title is; absent before the pick. FS-E1ZDG §B R9.
	Specialization string `json:"specialization,omitempty"`
	// PoisonedFor is the seconds of poison left, absent when not poisoned:
	// public, so teammates' bars can show it. FS-5FZ4J §I R47.
	PoisonedFor float64 `json:"poisoned_for,omitempty"`
	// Blessed is true while the delver carries the hallowed altar's Blessing,
	// absent when not: public, as poison is. FS-5FZ4J §I R47.
	Blessed bool `json:"blessed,omitempty"`
}

// ResourceState is a delver's class resource as its owner is told it, in whole
// points: Current is the pool rounded down, so a client comparing it with
// AbilityCost reaches the same answer the server does. FS-8AY7S §Requirements 17.
// TreeAbilityCost is the held tree ability's, the least the server requires to
// cast it; nil while it is not held. FS-Q18Q3 §A R5.
type ResourceState struct {
	Kind            string `json:"kind"`
	Current         int    `json:"current"`
	Max             int    `json:"max"`
	AbilityCost     int    `json:"ability_cost"`
	TreeAbilityCost *int   `json:"tree_ability_cost,omitempty"`
}

// CooldownState is one of a delver's abilities' cooldowns as its owner is
// told it, in float seconds: Remaining left before it can be cast again, Total
// the length it started at (worn attack speed applied); both 0 when none
// runs. FS-Q18Q3 §A R1–R3.
type CooldownState struct {
	Remaining float64 `json:"remaining"`
	Total     float64 `json:"total"`
}

// ParryState is a mercenary's parry stance as its owner is told it. The parry
// charges themselves ride ResourceState. FS-MAMHR §Requirements 27–28.
type ParryState struct {
	ParryOpen bool `json:"parry_open"`
	// ParryLockout is the seconds left on the whiff lockout, 0 when none.
	ParryLockout float64 `json:"parry_lockout"`
	// Parries is how many strikes this mercenary has parried in this run; it
	// rises at the parry-charge cap too, so the client can flash every parry.
	Parries int `json:"parries"`
}

// TimedOpenState is a delver's timed open as its owner is told it: the
// target being worked, what for, and how far along it is. FS-MQYEX
// §Requirements 18; target_kind open, search or pray, FS-5FZ4J §I R49.
type TimedOpenState struct {
	EntityID   uuid.UUID `json:"entity_id"`
	TargetKind string    `json:"target_kind"`
	// Elapsed is the seconds of simulation time counted so far.
	Elapsed float64 `json:"elapsed"`
	// Duration is the seconds it takes.
	Duration float64 `json:"duration"`
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

	// Unsafe marks an unsafe find; absent means the delver brought it in.
	// FS-18Z5F §D R21.
	Unsafe bool `json:"unsafe,omitempty"`
}

type ContainerState struct {
	ContainerID uuid.UUID `json:"container_id"`
	EntityID    uuid.UUID `json:"entity_id"`
	// Kind is "chest" or "drop_pile". FS-4R9M9 §Requirements 55.
	Kind     string       `json:"kind"`
	Position *Position    `json:"position"`
	IsOpen   bool         `json:"is_open"`
	Items    []*ItemState `json:"items"`
	// ReservedFor is the member a field drop pile is reserved for while its
	// killer-first window is open; absent after it, and on every run pile
	// and chest. FS-X2F2H §Requirements 35.
	ReservedFor string `json:"reserved_for,omitempty"`
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
	// SettledMemberIDs are the members already settled by their own
	// settlement before the run's end, which the run's release skips
	// (FS-GV8WN R14, D3)
	SettledMemberIDs []uuid.UUID
}

// SettlementCarriedItem is an item a settled player carried out, in the WS
// item shape; Found marks a find from this run (FS-GV8WN §G R19).
type SettlementCarriedItem struct {
	ItemState
	Found bool `json:"found,omitempty"`
}

// SettlementLostItem is an item a settled player lost, in the WS item shape,
// with why: "unsafe" (a find lost on death) or "consumed" (used up in the run).
type SettlementLostItem struct {
	ItemState
	Reason string `json:"reason"`
}

// Settlement record outcomes, statuses and lost reasons (FS-GV8WN §G R19).
const (
	SettlementOutcomeEscaped = "escaped"
	SettlementOutcomeDied    = "died"

	SettlementStatusPending   = "pending"
	SettlementStatusConfirmed = "confirmed"

	SettlementLostUnsafe   = "unsafe"
	SettlementLostConsumed = "consumed"
)

// RawSettlement is one player's settlement, taken the moment they resolve
// (FS-GV8WN §A R1–R2): their body as it stands then, what they earned, and
// the position their resolution gave them.
type RawSettlement struct {
	SessionID     uuid.UUID
	StartedAt     time.Time
	EndedAt       time.Time
	Player        RawPlayerState
	Progress      RunProgress
	FinalPosition int32
}

type RawPlayerState struct {
	MemberID  string
	Username  string
	Kills     int32
	Deaths    int32
	Escape    bool
	Equipment ExtractedEquipment
	Inventory []*ExtractedItem
	// LoadoutUnknown: the stored loadout was never read, so Equipment says
	// nothing about it
	LoadoutUnknown bool
	// ConsumedItemIDs: the stored-loadout items the delver used up this run,
	// which leave the stash at extraction (FS-P9G8R §Requirements 14)
	ConsumedItemIDs []uuid.UUID
	// CharacterID: the character the body is seated as, whose finds these are
	// (FS-50MTX R30); zero when none was resolved
	CharacterID uuid.UUID
}

type RankedPlayerState struct {
	MemberID       string
	Username       string
	Kills          int32
	Deaths         int32
	FinalPosition  int32
	Win            bool
	Escape         bool
	Equipment      ExtractedEquipment
	Inventory      []*ExtractedItem
	LoadoutUnknown bool
	// ConsumedItemIDs: carried from RawPlayerState; a field visit has none
	ConsumedItemIDs []uuid.UUID
	// CharacterID: carried from RawPlayerState, or the visit's on a field visit
	CharacterID uuid.UUID
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
	// ghoul | troll | demon | blood_demon | bone_archer
	Archetype string `json:"archetype"`
	// Look is a hostile human's art variant within its archetype (a turned
	// Cutthroat's `cutthroat_a`), absent for every archetype whose look is the
	// archetype itself (FS-4EC7Z §F R24)
	Look string `json:"look,omitempty"`
	// server-authored, elite prefix included, level excluded: the client
	// composes the nameplate
	Name     string   `json:"name"`
	Level    int      `json:"level"`
	Elite    bool     `json:"elite"`
	Boss     bool     `json:"boss"`
	Position Position `json:"position"`
	// the direction it faces; never zero
	Facing Position `json:"facing"`
	// idle | move | attack | claw | ability | dead: attack is the wind-up and
	// strike, a demon's slam included; claw a demon's fire claw, from the tick
	// it lands for its show window (FS-VHGE7 §B R24); ability a monster
	// ability's wind-up (FS-C8VM7 §B R17)
	Action string `json:"action"`
	// Ability is its monster ability while one is pending, absent otherwise
	// (FS-C8VM7 §B R17)
	Ability       *MonsterAbilityState `json:"ability,omitempty"`
	CurrentHealth int                  `json:"current_health"`
	MaxHealth     int                  `json:"max_health"`
}

// MonsterAbilityState is a monster's pending ability, fixed where it will land
// so the client draws its telegraph from the server's numbers. A shot ability
// sets only Kind and Remaining. FS-C8VM7 §B R17.
type MonsterAbilityState struct {
	// pounce | ground_slam | burst | wail | cleave | volley | dagger | rock
	Kind string `json:"kind"`
	// the area's centre, or the cone's apex, in world px
	X float64 `json:"x"`
	Y float64 `json:"y"`
	// the area's radius or the cone's reach, in px; 0 for a shot
	Radius float64 `json:"radius"`
	// the cone's full angle in degrees; 0 for a circle
	Arc float64 `json:"arc"`
	// seconds until it lands
	Remaining float64 `json:"remaining"`
}

// StairsState is the floor's way up. FS-F6F88 §Requirements 27.
type StairsState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
}

// TomeState is the Tome of Filth lying on the current floor: what it is and
// where, nothing of the run's plan. FS-3103M §E R14-R15.
type TomeState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
}

// AltarState is the Altar of Consecration on its floor, burned once the tome
// was burned at it. FS-3103M §E R14.
type AltarState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
	Burned   bool      `json:"burned"`
}

// FountainState is a floor's healing fountain: where it stands and whether
// its pool is spent. FS-5FZ4J §I R46.
type FountainState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
	Dry      bool      `json:"dry"`
}

// HallowedAltarState is the hallowed altar on its floor, once reachable:
// prayed once a prayer at it completed. Never the Altar of Consecration's
// AltarState. FS-5FZ4J §I R46.
type HallowedAltarState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position *Position `json:"position"`
	Prayed   bool      `json:"prayed"`
}

// EncounterNPCState is one encounter NPC on the wire. Kind is pilgrim,
// captive or cutthroat; Look its art variant; Stance peaceful, caged or ally;
// Action idle, move, attack, cower or dead. Line is the key of the last line
// it said and LineAt when, on its own clock; both absent until it says one.
// HirerID is an ally's hirer's member id, absent for any other. FS-4EC7Z §F
// R22, R26.
type EncounterNPCState struct {
	EntityID  uuid.UUID  `json:"entity_id"`
	Kind      string     `json:"kind"`
	Look      string     `json:"look"`
	Position  Position   `json:"position"`
	Facing    Position   `json:"facing"`
	Health    int        `json:"health"`
	MaxHealth int        `json:"max_health"`
	Stance    string     `json:"stance"`
	Action    string     `json:"action"`
	Line      string     `json:"line,omitempty"`
	LineAt    *float64   `json:"line_at,omitempty"`
	HirerID   *uuid.UUID `json:"hirer_id,omitempty"`
}

// CageState is the Captives' cage on the wire, sent whole: where it stands
// and whether it is open. FS-4EC7Z §F R23.
type CageState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position Position  `json:"position"`
	Open     bool      `json:"open"`
}

// EncounterKeyState is the cage key lying on the floor, sent whole while it
// lies. FS-4EC7Z §F R23.
type EncounterKeyState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Position Position  `json:"position"`
}

// MerchantState is the wandering merchant on his floor and his wares, sent
// whole; absent in the hub, a field and on a floor without him. FS-9JV5K §A R4.
type MerchantState struct {
	EntityID uuid.UUID            `json:"entity_id"`
	Position *Position            `json:"position"`
	Wares    []*MerchantWareState `json:"wares"`
}

// MerchantWareState is one of his wares: what it is, its price in gold, how
// many are neither sold nor reserved, and the item the client draws, absent
// for the tome.
type MerchantWareState struct {
	Ware  string            `json:"ware"`
	Price int64             `json:"price"`
	Left  int               `json:"left"`
	Item  *MerchantWareItem `json:"item,omitempty"`
}

// MerchantWareItem is a ware's display data: its name, rarity and the stats
// the client's icon resolver keys on (item type, healing, mana), since the
// catalogue carries no icon or item code.
type MerchantWareItem struct {
	Name          string   `json:"name"`
	ItemType      ItemType `json:"item_type"`
	Rarity        string   `json:"rarity,omitempty"`
	HealingAmount int      `json:"healing_amount,omitempty"`
	ManaAmount    int      `json:"mana_amount,omitempty"`
}

// CellState is a cell's column and row on the floor map's grid.
type CellState struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// SealState is a sealed floor's seal: the current, first unbroken seal's kind
// and stage, or the last one's once all are broken; stages is how many the
// floor chains; broken is set once every one is. FS-5FZ4J §I R46, R48.
type SealState struct {
	Kind   string `json:"kind"`
	Stage  int    `json:"stage"`
	Stages int    `json:"stages"`
	Broken bool   `json:"broken"`
	// KeyCarried is true while the party carries the floor's stair key and
	// its seal is unbroken (§E R32; amended 2026-11-25: false once the key
	// has turned the gate), absent otherwise
	KeyCarried bool `json:"key_carried,omitempty"`
	// WindowEndsIn is the seconds left of a Braziers window while one runs
	// (§E R34), absent otherwise
	WindowEndsIn float64 `json:"window_ends_in,omitempty"`
}

// SealPieceState is one seal piece: a lever's glyph, absent on the others;
// active a lever down, a plate held, a brazier lit, a bridge lowered.
// FS-5FZ4J §I R46.
type SealPieceState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Kind     string    `json:"kind"`
	Position *Position `json:"position"`
	Cell     CellState `json:"cell"`
	Glyph    string    `json:"glyph,omitempty"`
	Active   bool      `json:"active"`
}

// BarrierState is one barrier, a gate, a secret door or a pit, and the cells
// it covers. FS-5FZ4J §I R46. Revealed is set on a secret door the
// Cutthroats' tip revealed, absent on every other (FS-4EC7Z §F R28).
type BarrierState struct {
	EntityID uuid.UUID   `json:"entity_id"`
	Kind     string      `json:"kind"`
	Cells    []CellState `json:"cells"`
	Open     bool        `json:"open"`
	Revealed bool        `json:"revealed,omitempty"`
}

// TrapState is one detected trap (FS-5FZ4J §I R46): armed false while a
// fired trap waits to re-arm and for a spent tripwire, a gas vent always
// armed; revealed by a book page (FS-X2CMM), always false in v1. PuffedAt is
// a gas vent's last puff, in seconds of the floor's simulation time, absent
// before its first; the client reads a puff off it rising (R48).
type TrapState struct {
	EntityID uuid.UUID `json:"entity_id"`
	Kind     string    `json:"kind"`
	Cell     CellState `json:"cell"`
	Armed    bool      `json:"armed"`
	Revealed bool      `json:"revealed"`
	PuffedAt *float64  `json:"puffed_at,omitempty"`
}

// GateState is a hub gate as the client sees it: where it goes, where it
// stands and how close counts. Its arrival point is server-only. FS-0XMCP
// §Requirements 6.
type GateState struct {
	EntityID uuid.UUID `json:"entity_id"`
	// spire | forest | meadows
	Destination string    `json:"destination"`
	Position    *Position `json:"position"`
	Range       float64   `json:"range"`
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

	// Safe is set only by seating: an item the delver brought in. Left unset,
	// the item is an unsafe find, so a new item source is unsafe without being
	// told. FS-18Z5F §D R19.
	Safe bool
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

// AntidoteName is the antidote's catalogue name. The template data the session
// loads carries no item code, so the name is how the game knows an antidote:
// a consumable keeps its base name whatever rarity it rolls. FS-9JV5K §D R16.
const AntidoteName = "Antidote"

// IsAntidote is whether an item of itemType named name is an antidote.
func IsAntidote(itemType ItemType, name string) bool {
	return itemType == ItemTypeConsumable && name == AntidoteName
}

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
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Class string    `json:"class"`
	// 1..progression.MaxLevel; anything below 1 seats as level 1
	Level int `json:"level"`
	// total experience, monotonic
	Experience int64 `json:"experience"`
	// PassiveRanks is the passive tree ranks held, by node id, from the same
	// record (FS-8RZ51 R14), raised by a spend in town (R20). Never written
	// in place: every copy of the record shares it, so it is replaced whole.
	// The queue entry and a handoff carry it with the rest of the character.
	PassiveRanks passivetree.Ranks `json:"passive_ranks,omitempty"`
}

// WireCharacterID is id as a gRPC request or an event carries it. No character
// is empty, never the zero UUID, which would read as a real id (FS-50MTX R32).
func WireCharacterID(id uuid.UUID) string {
	if id == uuid.Nil {
		return ""
	}
	return id.String()
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

type ResolvedMatchedPlayers struct {
	LocalPlayers   []*Player
	HandoffPlayers []*Player
}
