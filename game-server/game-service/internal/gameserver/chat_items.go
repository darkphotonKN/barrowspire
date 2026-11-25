package gameserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

/**
* Item links (FS-KBA4Q): a chat line may show items. Each is a `[Name]` token in the line's text
* paired with an item snapshot in the line's `items`, sent by the client. The pod checks every
* snapshot's shape, closed sets and sizes, then builds what it relays from the values it read, so
* nothing it did not read reaches another player or another pod (R27, R29).
*
* It does not look the item up: no ownership check, no world, no other service, no store (R26).
* No error made here carries a value the client sent, so a refusal can be logged (ADR-0033).
**/

// The most a line's item links may be. FS-KBA4Q R27.
const (
	// chatItemLinksMax is the most item links one line may carry.
	chatItemLinksMax = 3
	// chatItemAffixesMax is the most affixes one item snapshot may carry.
	chatItemAffixesMax = 6
	// chatItemLinksBytesMax is the most bytes the rebuilt `items` may take as JSON.
	chatItemLinksBytesMax = 4096
)

// An item snapshot's field bounds. Sanity bounds, far above any real item; they say nothing about
// balance. An item the stock client cannot link for one of them is fixed by raising it here.
// FS-KBA4Q §The item snapshot.
const (
	chatItemNameMax         = 100 // code points
	chatItemWeaponTypeMax   = 32  // characters of a–z and _
	chatItemUniqueEffectMax = 200 // code points
	chatItemDescriptionMax  = 300 // code points
	chatItemStatMax         = 999999
	chatItemLevelMin        = 1
	chatItemLevelMax        = 999
	chatItemAffixTierMax    = 9
)

var errBadItemLink = errors.New("bad item link")

// chatItemField reads one field's inbound value and returns the value to relay.
type chatItemField func(v interface{}) (interface{}, bool)

// chatItemFields is the item snapshot: its closed key set, and how each key's value is read. The
// names and meanings are the world state's ItemState (FS-4R9M9 R54). A snapshot names no owner,
// no instance and no standing, so no such key is here.
var chatItemFields = map[string]chatItemField{
	"name":             chatItemName,
	"item_type":        chatItemOneOf(string(types.ItemTypeWeapon), string(types.ItemTypeArmor), string(types.ItemTypeRing), string(types.ItemTypeConsumable)),
	"rarity":           chatItemOneOf("normal", "uncommon", "rare", "runed", "fabled"),
	"weapon_type":      chatItemWeaponType,
	"armor_slot":       chatItemOneOf(string(types.ArmorSlotHead), string(types.ArmorSlotChest), string(types.ArmorSlotLegs), string(types.ArmorSlotGloves)),
	"attack_power":     chatItemWhole(0, chatItemStatMax),
	"defense_rating":   chatItemWhole(0, chatItemStatMax),
	"magic_resistance": chatItemWhole(0, chatItemStatMax),
	"healing_amount":   chatItemWhole(0, chatItemStatMax),
	"mana_amount":      chatItemWhole(0, chatItemStatMax),
	"critical_rate":    chatItemFraction,
	"item_level":       chatItemWhole(chatItemLevelMin, chatItemLevelMax),
	"required_level":   chatItemWhole(chatItemLevelMin, chatItemLevelMax),
	"affixes":          chatItemAffixes,
	"unique_effect":    chatItemProse(chatItemUniqueEffectMax),
	"description":      chatItemProse(chatItemDescriptionMax),
}

// chatItemRequired are the keys every snapshot carries.
var chatItemRequired = []string{"name", "item_type"}

// chatAffixFields is one affix: all three keys, and no other. FS-4R9M9 R17 names the stats.
var chatAffixFields = map[string]chatItemField{
	"stat": chatItemOneOf(
		types.AffixStrength, types.AffixAgility, types.AffixIntelligence, types.AffixMaxHealth,
		types.AffixMaxMana, types.AffixAttackSpeed, types.AffixMoveSpeed, types.AffixCritChance,
		types.AffixFlatDamage, types.AffixDefense, types.AffixMagicResistance,
	),
	"tier":  chatItemWhole(0, chatItemAffixTierMax),
	"value": chatItemWhole(0, chatItemStatMax),
}

var chatAffixRequired = []string{"stat", "tier", "value"}

// validateChatItems checks a line's inbound `items` against its normalised text and returns the
// snapshots to relay, rebuilt, in order. No `items`, or an empty one, is a line with no links:
// nil and no error. Anything else that fails refuses the whole line. FS-KBA4Q R24, R27, R29.
func validateChatItems(raw interface{}, text string) ([]interface{}, error) {
	if raw == nil {
		return nil, nil
	}
	inbound, isArray := raw.([]interface{})
	if !isArray {
		return nil, fmt.Errorf("%w: items is not an array", errBadItemLink)
	}
	if len(inbound) == 0 {
		return nil, nil
	}
	if len(inbound) > chatItemLinksMax {
		return nil, fmt.Errorf("%w: more than %d items", errBadItemLink, chatItemLinksMax)
	}

	items := make([]interface{}, 0, len(inbound))
	// where in the text the next token is looked for: after the pair before it (R10)
	rest := text
	for _, entry := range inbound {
		item, err := rebuildChatObject(entry, chatItemFields, chatItemRequired)
		if err != nil {
			return nil, fmt.Errorf("%w: item %w", errBadItemLink, err)
		}
		token := "[" + item["name"].(string) + "]"
		at := strings.Index(rest, token)
		if at < 0 {
			return nil, fmt.Errorf("%w: an item's token is not in the text, in order", errBadItemLink)
		}
		rest = rest[at+len(token):]
		items = append(items, item)
	}

	encoded, err := json.Marshal(items)
	if err != nil {
		return nil, fmt.Errorf("%w: items not encoded", errBadItemLink)
	}
	if len(encoded) > chatItemLinksBytesMax {
		return nil, fmt.Errorf("%w: items over %d bytes", errBadItemLink, chatItemLinksBytesMax)
	}
	return items, nil
}

// rebuildChatObject reads entry as an object of fields and nothing else, and returns a new one
// holding each value as its field read it. More keys than fields, a key outside fields, a value
// its field refuses, or a missing required key fails. The error names a key only when it is one of ours.
func rebuildChatObject(entry interface{}, fields map[string]chatItemField, required []string) (map[string]interface{}, error) {
	inbound, isObject := entry.(map[string]interface{})
	if !isObject {
		return nil, errors.New("is not an object")
	}
	// counted before anything is sized by it: the client chose how many keys it sent
	if len(inbound) > len(fields) {
		return nil, errors.New("has too many keys")
	}
	rebuilt := make(map[string]interface{}, len(inbound))
	for key, value := range inbound {
		read, known := fields[key]
		if !known {
			return nil, errors.New("has an unknown key")
		}
		v, ok := read(value)
		if !ok {
			return nil, fmt.Errorf("has a bad %s", key)
		}
		rebuilt[key] = v
	}
	for _, key := range required {
		if _, has := rebuilt[key]; !has {
			return nil, fmt.Errorf("has no %s", key)
		}
	}
	return rebuilt, nil
}

// chatItemName is the name a token carries: 1–100 code points, with no unseen character
// (chatItemUnseen), no bracket, and no whitespace at either end.
func chatItemName(v interface{}) (interface{}, bool) {
	name, ok := chatItemText(v, chatItemNameMax)
	if !ok || strings.ContainsAny(name, "[]") || strings.TrimSpace(name) != name {
		return nil, false
	}
	return name, true
}

// chatItemProse is a line of words of 1 to max code points with no unseen character.
func chatItemProse(max int) chatItemField {
	return func(v interface{}) (interface{}, bool) {
		s, ok := chatItemText(v, max)
		return s, ok
	}
}

// chatItemText is a string of 1 to max code points with no unseen character (chatItemUnseen).
func chatItemText(v interface{}, max int) (string, bool) {
	s, isString := v.(string)
	if !isString || s == "" || utf8.RuneCountInString(s) > max {
		return "", false
	}
	if strings.IndexFunc(s, chatItemUnseen) >= 0 {
		return "", false
	}
	return s, true
}

// chatItemUnseen reports a character no item text may hold: a control (Unicode Cc), a format
// character (Cf: zero-width, bidi override), or a line or paragraph separator (Zl, Zp). With one
// of them a tag could show nothing, or a tip read backwards. The client's `isUnseen` is the same
// definition (game-client/src/chat/itemLinks.ts).
func chatItemUnseen(r rune) bool {
	return unicode.IsControl(r) || unicode.In(r, unicode.Cf, unicode.Zl, unicode.Zp)
}

// chatItemWeaponType is a weapon kind's code. game-service holds no closed set of them, so it is
// checked by its shape: 1–32 characters of a–z and _.
func chatItemWeaponType(v interface{}) (interface{}, bool) {
	s, isString := v.(string)
	if !isString || s == "" || len(s) > chatItemWeaponTypeMax {
		return nil, false
	}
	for _, c := range s {
		if (c < 'a' || c > 'z') && c != '_' {
			return nil, false
		}
	}
	return s, true
}

// chatItemOneOf is a string from a closed set.
func chatItemOneOf(set ...string) chatItemField {
	return func(v interface{}) (interface{}, bool) {
		s, isString := v.(string)
		if !isString {
			return nil, false
		}
		for _, member := range set {
			if s == member {
				return s, true
			}
		}
		return nil, false
	}
}

// chatItemWhole is a whole number from min to max, as JSON decodes a number.
func chatItemWhole(min, max float64) chatItemField {
	return func(v interface{}) (interface{}, bool) {
		n, isNumber := v.(float64)
		if !isNumber || n < min || n > max || n != math.Trunc(n) {
			return nil, false
		}
		return n, true
	}
}

// chatItemFraction is a number from 0 to 1, as the world state sends a critical rate.
func chatItemFraction(v interface{}) (interface{}, bool) {
	n, isNumber := v.(float64)
	if !isNumber || !(n >= 0 && n <= 1) {
		return nil, false
	}
	return n, true
}

// chatItemAffixes is at most chatItemAffixesMax affixes, each rebuilt.
func chatItemAffixes(v interface{}) (interface{}, bool) {
	inbound, isArray := v.([]interface{})
	if !isArray || len(inbound) > chatItemAffixesMax {
		return nil, false
	}
	affixes := make([]interface{}, 0, len(inbound))
	for _, entry := range inbound {
		affix, err := rebuildChatObject(entry, chatAffixFields, chatAffixRequired)
		if err != nil {
			return nil, false
		}
		affixes = append(affixes, affix)
	}
	return affixes, true
}
