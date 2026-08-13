package item

import "encoding/json"

// Transport types for the serialized items surface (FS-0002 slice 2).
//
// Field names, Go types and json tags are transcribed mechanically from
// common/api/proto/items/items.pb.go rather than retyped. Hand-copying a proto
// is how slice 1 declared expires_at as an int64 when it is a Timestamp object;
// the compiler caught that one, and nothing would have caught a wrong `omitempty`.
//
// They exist as separate types rather than reusing the protobuf structs because
// ADR-0001 §5 keeps downstream models off the wire: a proto regeneration must
// not silently reshape the public contract.

// Timestamp is protobuf's timestamp as encoding/json renders it — {seconds,
// nanos}, not RFC 3339. Transcribed, not improved (ADR-0002 §1).
type Timestamp struct {
	Seconds int64 `json:"seconds,omitempty"`
	Nanos   int32 `json:"nanos,omitempty"`
}

type Weapon struct {
	Id           string     `json:"id,omitempty"`
	RarityId     string     `json:"rarity_id,omitempty"`
	AttackPower  int32      `json:"attack_power,omitempty"`
	CriticalRate float32    `json:"critical_rate,omitempty"`
	WeaponType   string     `json:"weapon_type,omitempty"`
	Description  string     `json:"description,omitempty"`
	CreatedAt    *Timestamp `json:"created_at,omitempty"`
	UpdatedAt    *Timestamp `json:"updated_at,omitempty"`
}

type WeaponDetail struct {
	Id             string     `json:"id,omitempty"`
	RarityId       string     `json:"rarity_id,omitempty"`
	AttackPower    int32      `json:"attack_power,omitempty"`
	CriticalRate   float32    `json:"critical_rate,omitempty"`
	WeaponType     string     `json:"weapon_type,omitempty"`
	Description    string     `json:"description,omitempty"`
	ItemTemplateId string     `json:"item_template_id,omitempty"`
	ItemName       string     `json:"item_name,omitempty"`
	ItemCode       string     `json:"item_code,omitempty"`
	IconUrl        string     `json:"icon_url,omitempty"`
	RequiredLevel  int32      `json:"required_level,omitempty"`
	BaseSellPrice  int32      `json:"base_sell_price,omitempty"`
	BaseBuyPrice   int32      `json:"base_buy_price,omitempty"`
	CreatedAt      *Timestamp `json:"created_at,omitempty"`
	UpdatedAt      *Timestamp `json:"updated_at,omitempty"`
}

type ArmorDetail struct {
	Id              string     `json:"id,omitempty"`
	RarityId        string     `json:"rarity_id,omitempty"`
	DefenseRating   int32      `json:"defense_rating,omitempty"`
	MagicResistance int32      `json:"magic_resistance,omitempty"`
	ArmorSlot       string     `json:"armor_slot,omitempty"`
	Description     string     `json:"description,omitempty"`
	ItemTemplateId  string     `json:"item_template_id,omitempty"`
	ItemName        string     `json:"item_name,omitempty"`
	ItemCode        string     `json:"item_code,omitempty"`
	IconUrl         string     `json:"icon_url,omitempty"`
	RequiredLevel   int32      `json:"required_level,omitempty"`
	BaseSellPrice   int32      `json:"base_sell_price,omitempty"`
	BaseBuyPrice    int32      `json:"base_buy_price,omitempty"`
	CreatedAt       *Timestamp `json:"created_at,omitempty"`
	UpdatedAt       *Timestamp `json:"updated_at,omitempty"`
}

type ConsumableDetail struct {
	Id             string     `json:"id,omitempty"`
	RarityId       string     `json:"rarity_id,omitempty"`
	HealingAmount  int32      `json:"healing_amount,omitempty"`
	ManaAmount     int32      `json:"mana_amount,omitempty"`
	BuffDuration   int32      `json:"buff_duration,omitempty"`
	MaxStackSize   int32      `json:"max_stack_size,omitempty"`
	Description    string     `json:"description,omitempty"`
	ItemTemplateId string     `json:"item_template_id,omitempty"`
	ItemName       string     `json:"item_name,omitempty"`
	ItemCode       string     `json:"item_code,omitempty"`
	IconUrl        string     `json:"icon_url,omitempty"`
	RequiredLevel  int32      `json:"required_level,omitempty"`
	BaseSellPrice  int32      `json:"base_sell_price,omitempty"`
	BaseBuyPrice   int32      `json:"base_buy_price,omitempty"`
	CreatedAt      *Timestamp `json:"created_at,omitempty"`
	UpdatedAt      *Timestamp `json:"updated_at,omitempty"`
}

type ItemTemplate struct {
	Id              string     `json:"id,omitempty"`
	ItemName        string     `json:"item_name,omitempty"`
	Rarity          string     `json:"rarity,omitempty"`
	ItemType        string     `json:"item_type,omitempty"`
	IconUrl         string     `json:"icon_url,omitempty"`
	RequiredLevel   int32      `json:"required_level,omitempty"`
	BaseSellPrice   int32      `json:"base_sell_price,omitempty"`
	BaseBuyPrice    int32      `json:"base_buy_price,omitempty"`
	AttackPower     int32      `json:"attack_power,omitempty"`
	CriticalRate    float32    `json:"critical_rate,omitempty"`
	WeaponType      string     `json:"weapon_type,omitempty"`
	DefenseRating   int32      `json:"defense_rating,omitempty"`
	MagicResistance int32      `json:"magic_resistance,omitempty"`
	ArmorSlot       string     `json:"armor_slot,omitempty"`
	HealingAmount   int32      `json:"healing_amount,omitempty"`
	ManaAmount      int32      `json:"mana_amount,omitempty"`
	BuffDuration    int32      `json:"buff_duration,omitempty"`
	MaxStackSize    int32      `json:"max_stack_size,omitempty"`
	Description     string     `json:"description,omitempty"`
	CreatedAt       *Timestamp `json:"created_at,omitempty"`
	UpdatedAt       *Timestamp `json:"updated_at,omitempty"`
}

type ItemType struct {
	Id          string     `json:"id,omitempty"`
	Name        string     `json:"name,omitempty"`
	Description string     `json:"description,omitempty"`
	CreatedAt   *Timestamp `json:"created_at,omitempty"`
	UpdatedAt   *Timestamp `json:"updated_at,omitempty"`
}

type ItemRarity struct {
	Id          string     `json:"id,omitempty"`
	Name        string     `json:"name,omitempty"`
	Description string     `json:"description,omitempty"`
	CreatedAt   *Timestamp `json:"created_at,omitempty"`
	UpdatedAt   *Timestamp `json:"updated_at,omitempty"`
}

// !! LoadoutSlot not found
type ItemInstance struct {
	Id              string  `json:"id,omitempty"`
	TemplateId      string  `json:"template_id,omitempty"`
	OwnerMemberId   string  `json:"owner_member_id,omitempty"`
	Source          string  `json:"source,omitempty"`
	ItemType        string  `json:"item_type,omitempty"`
	Name            string  `json:"name,omitempty"`
	RarityId        string  `json:"rarity_id,omitempty"`
	AttackPower     int32   `json:"attack_power,omitempty"`
	CriticalRate    float32 `json:"critical_rate,omitempty"`
	WeaponType      string  `json:"weapon_type,omitempty"`
	DefenseRating   int32   `json:"defense_rating,omitempty"`
	MagicResistance int32   `json:"magic_resistance,omitempty"`
	ArmorSlot       string  `json:"armor_slot,omitempty"`
	HealingAmount   int32   `json:"healing_amount,omitempty"`
	ManaAmount      int32   `json:"mana_amount,omitempty"`
	BuffDuration    int32   `json:"buff_duration,omitempty"`
	BuyPrice        int32   `json:"buy_price,omitempty"`
	SellPrice       int32   `json:"sell_price,omitempty"`
	Description     string  `json:"description,omitempty"`
}

type GetLoadoutResponse struct {
	Id            string     `json:"id,omitempty"`
	MemberId      string     `json:"memberId,omitempty"`
	WeaponId      string     `json:"weaponId,omitempty"`
	HeadId        string     `json:"headId,omitempty"`
	ChestId       string     `json:"chestId,omitempty"`
	GlovesId      string     `json:"glovesId,omitempty"`
	LegsId        string     `json:"legsId,omitempty"`
	Ring1Id       string     `json:"ring1Id,omitempty"`
	Ring2Id       string     `json:"ring2Id,omitempty"`
	Consumable1Id string     `json:"consumable1Id,omitempty"`
	Consumable2Id string     `json:"consumable2Id,omitempty"`
	Consumable3Id string     `json:"consumable3Id,omitempty"`
	CreatedAt     *Timestamp `json:"created_at,omitempty"`
	UpdatedAt     *Timestamp `json:"updated_at,omitempty"`
}

// asWire converts a downstream protobuf message into its transport mirror by
// marshalling and unmarshalling through JSON.
//
// This is deliberate, not lazy. The mirror's json tags are transcribed from the
// proto's, so a JSON round-trip reproduces the wire bytes the legacy handler
// produced BY CONSTRUCTION — including every `omitempty`. Assigning ~120 fields
// by hand across ten types would make fidelity a matter of care, and slice 1
// already demonstrated what care produces at that scale.
//
// The transport type still governs the generated schema, so ADR-0001 §5 holds:
// the wire shape is declared here, not inherited from the proto.
//
// TestWireTypes_RoundTripFaithfully asserts the tags actually agree; if a proto
// regeneration renames a field, that test fails rather than the contract
// silently drifting.
func asWire[T any](src any) (*T, error) {
	raw, err := json.Marshal(src)
	if err != nil {
		return nil, err
	}
	var dst T
	if err := json.Unmarshal(raw, &dst); err != nil {
		return nil, err
	}
	return &dst, nil
}

// asWireSlice is asWire for a repeated field.
func asWireSlice[T any](src any) ([]T, error) {
	raw, err := json.Marshal(src)
	if err != nil {
		return nil, err
	}
	var dst []T
	if err := json.Unmarshal(raw, &dst); err != nil {
		return nil, err
	}
	if dst == nil {
		dst = []T{}
	}
	return dst, nil
}
