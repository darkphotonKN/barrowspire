package items

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// Affix is one rolled modifier on an owned item (FS-4R9M9 R16): a stat code
// from the affix table, the tier it rolled at (1-3, or 0 for a unique's fixed
// affix, R19) and its integer value.
type Affix struct {
	Stat  string `json:"stat"`
	Tier  int    `json:"tier"`
	Value int    `json:"value"`
}

// maxAffixTier is the highest rollable tier (FS-4R9M9 R17: tiers I-III).
const maxAffixTier = 3

// affixStats is FS-4R9M9 R17's affix table: the only stat codes an affix may name.
var affixStats = map[string]bool{
	"strength":         true,
	"agility":          true,
	"intelligence":     true,
	"max_health":       true,
	"max_mana":         true,
	"attack_speed":     true,
	"move_speed":       true,
	"crit_chance":      true,
	"flat_damage":      true,
	"defense":          true,
	"magic_resistance": true,
}

// wellFormed is FS-4R9M9 R50's test: a known stat code, tier 0-3, value >= 0.
func (a Affix) wellFormed() bool {
	return affixStats[a.Stat] && a.Tier >= 0 && a.Tier <= maxAffixTier && a.Value >= 0
}

// Affixes is an item's affix list as stored in item_instances.affixes (JSONB).
// It always writes a JSON array, never null, so the column's array CHECK holds.
type Affixes []Affix

// Value writes the list as JSON array text; nil becomes []. Text rather than
// bytes, so the driver never sends it as bytea.
func (a Affixes) Value() (driver.Value, error) {
	if a == nil {
		return "[]", nil
	}
	b, err := json.Marshal([]Affix(a))
	if err != nil {
		return nil, fmt.Errorf("marshal affixes: %w", err)
	}
	return string(b), nil
}

// Scan reads the JSONB column; NULL reads as an empty list.
func (a *Affixes) Scan(src any) error {
	var raw []byte
	switch v := src.(type) {
	case nil:
		*a = Affixes{}
		return nil
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("scan affixes: unsupported type %T", src)
	}

	list := Affixes{}
	if err := json.Unmarshal(raw, &list); err != nil {
		return fmt.Errorf("scan affixes: %w", err)
	}
	*a = list
	return nil
}

// AffixRange is one fixed affix of a unique (FS-4R9M9 R6, R19): a stat code
// and the inclusive range its value rolls in.
type AffixRange struct {
	Stat string `json:"stat"`
	Min  int    `json:"min"`
	Max  int    `json:"max"`
}

// AffixRanges is a unique's fixed affixes as stored in
// unique_items.fixed_affixes (JSONB). Read-only here: uniques are seeded.
type AffixRanges []AffixRange

// Scan reads the JSONB column; NULL (a template with no unique row) reads as nil.
func (a *AffixRanges) Scan(src any) error {
	var raw []byte
	switch v := src.(type) {
	case nil:
		*a = nil
		return nil
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("scan affix ranges: unsupported type %T", src)
	}

	var list AffixRanges
	if err := json.Unmarshal(raw, &list); err != nil {
		return fmt.Errorf("scan affix ranges: %w", err)
	}
	*a = list
	return nil
}
