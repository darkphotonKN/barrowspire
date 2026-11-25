package gameserver

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-KBA4Q §Requirements D (R24–R30), §The item snapshot. I-KBA4Q-1: a chat line may carry item
// links. The pod checks each snapshot's shape, closed sets and sizes, rebuilds it from what it
// read, and relays it inside the stamped line. It looks nothing up and keeps nothing.

// linkedText is a line holding the Rusty Blade's token.
const linkedText = "look [Rusty Blade] here"

// rustyBlade is a snapshot as the client sends it; numbers are float64, as JSON decodes them.
func rustyBlade() map[string]interface{} {
	return map[string]interface{}{
		"name":         "Rusty Blade",
		"item_type":    "weapon",
		"rarity":       "rare",
		"attack_power": float64(4),
	}
}

// linked is an inbound `items`.
func linked(items ...map[string]interface{}) []interface{} {
	out := make([]interface{}, 0, len(items))
	for _, item := range items {
		out = append(out, item)
	}
	return out
}

// named is the smallest valid snapshot of an item called name.
func named(name string) map[string]interface{} {
	return map[string]interface{}{"name": name, "item_type": "ring"}
}

func affix(stat string, tier, value float64) map[string]interface{} {
	return map[string]interface{}{"stat": stat, "tier": tier, "value": value}
}

func affixes(n int) []interface{} {
	out := make([]interface{}, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, affix("strength", 1, 5))
	}
	return out
}

// absent removes a field from the snapshot under test.
type absent struct{}

// Every row of the item snapshot's field table, at its boundary. FS-KBA4Q §The item snapshot, R27.
func TestValidateChatItems_Fields(t *testing.T) {
	tests := []struct {
		name  string
		field string
		value interface{}
		ok    bool
	}{
		{name: "name missing", field: "name", value: absent{}},
		{name: "name not a string", field: "name", value: float64(7)},
		{name: "name empty", field: "name", value: ""},
		{name: "name of one", field: "name", value: "A", ok: true},
		{name: "name of 100 cp", field: "name", value: strings.Repeat("字", 100), ok: true},
		{name: "name of 101 cp", field: "name", value: strings.Repeat("字", 101)},
		{name: "name with [", field: "name", value: "Rusty [Blade"},
		{name: "name with ]", field: "name", value: "Rusty] Blade"},
		{name: "name with a line break", field: "name", value: "Rusty\nBlade"},
		{name: "name with a zero-width space", field: "name", value: "Rusty\u200bBlade"},
		{name: "name with a right-to-left override", field: "name", value: "Rusty \u202eedalB"},
		{name: "name with a line separator", field: "name", value: "Rusty\u2028Blade"},
		{name: "name with a paragraph separator", field: "name", value: "Rusty\u2029Blade"},
		{name: "name with a no-break space inside", field: "name", value: "Rusty\u00a0Blade", ok: true},
		{name: "name with a combining mark", field: "name", value: "Rusty Blade\u0301", ok: true},
		{name: "name with a leading space", field: "name", value: " Rusty Blade"},
		{name: "name with a trailing space", field: "name", value: "Rusty Blade "},

		{name: "item_type missing", field: "item_type", value: absent{}},
		{name: "item_type unknown", field: "item_type", value: "trinket"},
		{name: "item_type not a string", field: "item_type", value: true},
		{name: "item_type weapon", field: "item_type", value: "weapon", ok: true},
		{name: "item_type armor", field: "item_type", value: "armor", ok: true},
		{name: "item_type ring", field: "item_type", value: "ring", ok: true},
		{name: "item_type consumable", field: "item_type", value: "consumable", ok: true},

		{name: "rarity absent", field: "rarity", value: absent{}, ok: true},
		{name: "rarity normal", field: "rarity", value: "normal", ok: true},
		{name: "rarity uncommon", field: "rarity", value: "uncommon", ok: true},
		{name: "rarity rare", field: "rarity", value: "rare", ok: true},
		{name: "rarity runed", field: "rarity", value: "runed", ok: true},
		{name: "rarity fabled", field: "rarity", value: "fabled", ok: true},
		{name: "rarity unknown", field: "rarity", value: "mythic"},
		{name: "rarity empty", field: "rarity", value: ""},
		{name: "rarity null", field: "rarity", value: nil},

		{name: "weapon_type of one", field: "weapon_type", value: "a", ok: true},
		{name: "weapon_type with an underscore", field: "weapon_type", value: "great_sword", ok: true},
		{name: "weapon_type of 32", field: "weapon_type", value: strings.Repeat("a", 32), ok: true},
		{name: "weapon_type of 33", field: "weapon_type", value: strings.Repeat("a", 33)},
		{name: "weapon_type empty", field: "weapon_type", value: ""},
		{name: "weapon_type with an upper-case letter", field: "weapon_type", value: "Sword"},
		{name: "weapon_type with a digit", field: "weapon_type", value: "sword2"},
		{name: "weapon_type not a string", field: "weapon_type", value: float64(1)},

		{name: "armor_slot head", field: "armor_slot", value: "head", ok: true},
		{name: "armor_slot chest", field: "armor_slot", value: "chest", ok: true},
		{name: "armor_slot legs", field: "armor_slot", value: "legs", ok: true},
		{name: "armor_slot gloves", field: "armor_slot", value: "gloves", ok: true},
		{name: "armor_slot unknown", field: "armor_slot", value: "feet"},

		{name: "attack_power 0", field: "attack_power", value: float64(0), ok: true},
		{name: "attack_power 999999", field: "attack_power", value: float64(999999), ok: true},
		{name: "attack_power -1", field: "attack_power", value: float64(-1)},
		{name: "attack_power 1.5", field: "attack_power", value: 1.5},
		{name: "attack_power 1000000", field: "attack_power", value: float64(1000000)},
		{name: "attack_power a string", field: "attack_power", value: "4"},
		{name: "defense_rating 999999", field: "defense_rating", value: float64(999999), ok: true},
		{name: "defense_rating 1000000", field: "defense_rating", value: float64(1000000)},
		{name: "magic_resistance 999999", field: "magic_resistance", value: float64(999999), ok: true},
		{name: "magic_resistance -1", field: "magic_resistance", value: float64(-1)},
		{name: "healing_amount 999999", field: "healing_amount", value: float64(999999), ok: true},
		{name: "healing_amount 0.5", field: "healing_amount", value: 0.5},
		{name: "mana_amount 999999", field: "mana_amount", value: float64(999999), ok: true},
		{name: "mana_amount 1000000", field: "mana_amount", value: float64(1000000)},

		{name: "critical_rate 0", field: "critical_rate", value: float64(0), ok: true},
		{name: "critical_rate 0.25", field: "critical_rate", value: 0.25, ok: true},
		{name: "critical_rate 1", field: "critical_rate", value: float64(1), ok: true},
		{name: "critical_rate 1.1", field: "critical_rate", value: 1.1},
		{name: "critical_rate below 0", field: "critical_rate", value: -0.1},
		{name: "critical_rate a string", field: "critical_rate", value: "0.2"},

		{name: "item_level 1", field: "item_level", value: float64(1), ok: true},
		{name: "item_level 999", field: "item_level", value: float64(999), ok: true},
		{name: "item_level 0", field: "item_level", value: float64(0)},
		{name: "item_level 1000", field: "item_level", value: float64(1000)},
		{name: "item_level 2.5", field: "item_level", value: 2.5},
		{name: "required_level 1", field: "required_level", value: float64(1), ok: true},
		{name: "required_level 999", field: "required_level", value: float64(999), ok: true},
		{name: "required_level 0", field: "required_level", value: float64(0)},
		{name: "required_level 1000", field: "required_level", value: float64(1000)},

		{name: "no affixes", field: "affixes", value: []interface{}{}, ok: true},
		{name: "six affixes", field: "affixes", value: affixes(6), ok: true},
		{name: "seven affixes", field: "affixes", value: affixes(7)},
		{name: "affixes not an array", field: "affixes", value: affix("strength", 1, 5)},
		{name: "an affix that is not an object", field: "affixes", value: []interface{}{"strength"}},
		{name: "every affix stat", field: "affixes", value: []interface{}{
			affix("strength", 0, 0), affix("agility", 9, 999999), affix("intelligence", 1, 1),
			affix("max_health", 1, 1), affix("max_mana", 1, 1), affix("attack_speed", 1, 1),
		}, ok: true},
		{name: "the other affix stats", field: "affixes", value: []interface{}{
			affix("move_speed", 1, 1), affix("crit_chance", 1, 1), affix("flat_damage", 1, 1),
			affix("defense", 1, 1), affix("magic_resistance", 1, 1),
		}, ok: true},
		{name: "affix stat unknown", field: "affixes", value: []interface{}{affix("luck", 1, 5)}},
		{name: "affix tier 10", field: "affixes", value: []interface{}{affix("strength", 10, 5)}},
		{name: "affix tier -1", field: "affixes", value: []interface{}{affix("strength", -1, 5)}},
		{name: "affix tier 1.5", field: "affixes", value: []interface{}{affix("strength", 1.5, 5)}},
		{name: "affix value 1000000", field: "affixes", value: []interface{}{affix("strength", 1, 1000000)}},
		{name: "affix value -1", field: "affixes", value: []interface{}{affix("strength", 1, -1)}},
		{name: "affix with a fourth key", field: "affixes", value: []interface{}{
			map[string]interface{}{"stat": "strength", "tier": float64(1), "value": float64(5), "id": "x"},
		}},
		{name: "affix missing its value", field: "affixes", value: []interface{}{
			map[string]interface{}{"stat": "strength", "tier": float64(1)},
		}},

		{name: "unique_effect of one", field: "unique_effect", value: "x", ok: true},
		{name: "unique_effect of 200 cp", field: "unique_effect", value: strings.Repeat("字", 200), ok: true},
		{name: "unique_effect of 201 cp", field: "unique_effect", value: strings.Repeat("字", 201)},
		{name: "unique_effect empty", field: "unique_effect", value: ""},
		{name: "unique_effect with a tab", field: "unique_effect", value: "kills\theal"},
		{name: "unique_effect with a zero-width joiner", field: "unique_effect", value: "kills\u200dheal"},
		{name: "unique_effect with a right-to-left override", field: "unique_effect", value: "\u202elaeh sllik"},
		{name: "unique_effect with a line separator", field: "unique_effect", value: "kills\u2028heal"},
		{name: "unique_effect with an emoji and its variation selector", field: "unique_effect", value: "kills \u2694\ufe0f heal", ok: true},
		{name: "description with a zero-width space", field: "description", value: "old\u200biron"},
		{name: "description with a byte order mark", field: "description", value: "\ufeffold iron"},
		{name: "description with a paragraph separator", field: "description", value: "old\u2029iron"},
		{name: "description with a soft hyphen", field: "description", value: "old\u00adiron"},
		{name: "description with a no-break space", field: "description", value: "old\u00a0iron", ok: true},
		{name: "description of 300 cp", field: "description", value: strings.Repeat("字", 300), ok: true},
		{name: "description of 301 cp", field: "description", value: strings.Repeat("字", 301)},
		{name: "description empty", field: "description", value: ""},
		{name: "description with a line break", field: "description", value: "old\niron"},
		{name: "description not a string", field: "description", value: []interface{}{"old iron"}},

		{name: "unknown key status", field: "status", value: "listed"},
		{name: "unknown key entity_id", field: "entity_id", value: uuid.NewString()},
		{name: "unknown key quantity", field: "quantity", value: float64(1)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := map[string]interface{}{"name": "Rusty Blade", "item_type": "weapon"}
			if _, remove := tt.value.(absent); remove {
				delete(item, tt.field)
			} else {
				item[tt.field] = tt.value
			}
			text := "[Rusty Blade]"
			if name, isName := item["name"].(string); isName {
				text = "[" + name + "]"
			}

			got, err := validateChatItems(linked(item), text)

			if !tt.ok {
				assert.Error(t, err)
				assert.Nil(t, got, "a refused line carries nothing")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, linked(item), got, "the rebuilt snapshot is what was sent")
		})
	}
}

// The characters no name, effect or lore may hold: controls (Cc), format characters (Cf: zero-width,
// bidi overrides), and the line and paragraph separators (Zl, Zp). The client's `isUnseen`
// (game-client/src/chat/itemLinks.ts) is the same definition, tested on the same characters.
func TestChatItemUnseen_Boundary(t *testing.T) {
	unseen := []rune{
		0x0000, 0x001f, 0x007f, 0x009f, // Cc
		0x00ad, 0x0600, 0x061c, 0x200b, 0x200f, 0x202a, 0x202e, 0x2060, 0x2069, 0xfeff, 0xe0001, // Cf
		0x2028, // Zl
		0x2029, // Zp
	}
	for _, r := range unseen {
		assert.True(t, chatItemUnseen(r), "%U is unseen", r)
		_, ok := chatItemText("Rusty"+string(r)+"Blade", chatItemNameMax)
		assert.False(t, ok, "text holding %U is refused", r)
	}
	seen := []rune{
		' ', 0x00a0, 0x3000, // Zs
		0x00e9, 0x00a1, // a letter, the first printing character past the C1 controls
		0x0301, 0xfe0f, // Mn: a combining mark, a variation selector
		0xe000,  // Co
		0x1f5e1, // an emoji
	}
	for _, r := range seen {
		assert.False(t, chatItemUnseen(r), "%U is not unseen", r)
		_, ok := chatItemText("Rusty"+string(r)+"Blade", chatItemNameMax)
		assert.True(t, ok, "text holding %U is taken", r)
	}
}

// An object with more keys than the snapshot has fields is refused by its count, before anything
// is sized by it or read from it; one with as many, or with a key the snapshot lacks, is read.
func TestRebuildChatObject_MoreKeysThanFields(t *testing.T) {
	flood := func(n int) map[string]interface{} {
		object := map[string]interface{}{"name": "Rusty Blade", "item_type": "weapon"}
		for i := 0; len(object) < n; i++ {
			object["k"+strings.Repeat("x", i)] = float64(i)
		}
		return object
	}

	_, err := rebuildChatObject(flood(len(chatItemFields)+1), chatItemFields, chatItemRequired)
	assert.EqualError(t, err, "has too many keys")

	_, err = rebuildChatObject(flood(len(chatItemFields)), chatItemFields, chatItemRequired)
	assert.EqualError(t, err, "has an unknown key", "within the count, each key is still checked")

	_, err = rebuildChatObject(map[string]interface{}{
		"stat": "strength", "tier": float64(1), "value": float64(5), "id": "x",
	}, chatAffixFields, chatAffixRequired)
	assert.EqualError(t, err, "has too many keys", "an affix is counted the same way")

	_, err = validateChatItems(linked(flood(5000)), "[Rusty Blade]")
	assert.ErrorIs(t, err, errBadItemLink, "the one refusal, whatever the reason")
}

// No links: nothing to carry, and nothing refused. Up to three; `items` must be an array of
// objects. FS-KBA4Q R24, R27.
func TestValidateChatItems_Count(t *testing.T) {
	four := "[A] [B] [C] [D]"
	tests := []struct {
		name  string
		items interface{}
		want  int
		ok    bool
	}{
		{name: "absent", items: nil, ok: true},
		{name: "empty", items: []interface{}{}, ok: true},
		{name: "one", items: linked(named("A")), want: 1, ok: true},
		{name: "three", items: linked(named("A"), named("B"), named("C")), want: 3, ok: true},
		{name: "four", items: linked(named("A"), named("B"), named("C"), named("D"))},
		{name: "not an array", items: named("A")},
		{name: "a string", items: "[A]"},
		{name: "an entry that is not an object", items: []interface{}{"A"}},
		{name: "an entry that is null", items: []interface{}{nil}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := validateChatItems(tt.items, four)

			if !tt.ok {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Len(t, got, tt.want)
		})
	}
}

// Every snapshot pairs with a `[name]` in the text, in order, each after the one before.
// FS-KBA4Q R10, R27.
func TestValidateChatItems_Pairing(t *testing.T) {
	tests := []struct {
		name  string
		text  string
		items []interface{}
		ok    bool
	}{
		{name: "one, in a sentence", text: "look [A] here", items: linked(named("A")), ok: true},
		{name: "two in order", text: "[A] then [B]", items: linked(named("A"), named("B")), ok: true},
		{name: "two the other way round", text: "[B] then [A]", items: linked(named("A"), named("B"))},
		{name: "token not in the text", text: "look here", items: linked(named("A"))},
		{name: "token without its brackets", text: "look A here", items: linked(named("A"))},
		{name: "token edited", text: "look [A ] here", items: linked(named("A"))},
		{name: "the same item twice", text: "[A][A]", items: linked(named("A"), named("A")), ok: true},
		{name: "the same item twice, one token", text: "[A]", items: linked(named("A"), named("A"))},
		{name: "a typed token that no snapshot claims", text: "[X] and [A]", items: linked(named("A")), ok: true},
		{name: "a name inside another", text: "[AB] [B]", items: linked(named("B"), named("AB"))},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := validateChatItems(tt.items, tt.text)

			if tt.ok {
				assert.NoError(t, err)
				return
			}
			assert.Error(t, err)
		})
	}
}

// itemsOfSize is three snapshots, tokens "[A][B][C]", whose rebuilt JSON is exactly size bytes.
func itemsOfSize(t *testing.T, size int) []interface{} {
	t.Helper()

	full := func(name string) map[string]interface{} {
		item := named(name)
		item["unique_effect"] = strings.Repeat("字", 200)
		item["description"] = strings.Repeat("字", 300)
		return item
	}
	last := named("C")
	last["unique_effect"] = strings.Repeat("字", 200)
	items := linked(full("A"), full("B"), last)

	description := "x"
	for {
		last["description"] = description
		raw, err := json.Marshal(items)
		require.NoError(t, err)
		switch left := size - len(raw); {
		case left == 0:
			require.LessOrEqual(t, utf8.RuneCountInString(description), 300, "the filler stays a valid description")
			return items
		case left < 0:
			t.Fatalf("cannot build items of %d bytes: already %d", size, len(raw))
		case left >= 3:
			description += "字"
		default:
			description += "x"
		}
	}
}

// The rebuilt `items`, as JSON, is at most 4096 bytes. FS-KBA4Q R27.
func TestValidateChatItems_ByteLimit(t *testing.T) {
	const text = "[A][B][C]"

	atLimit, err := validateChatItems(itemsOfSize(t, chatItemLinksBytesMax), text)
	require.NoError(t, err, "4096 bytes is within the limit")
	assert.Len(t, atLimit, 3)

	_, err = validateChatItems(itemsOfSize(t, chatItemLinksBytesMax+1), text)
	assert.Error(t, err, "4097 bytes is over it")
}

// Every length at its most at once is still a line. FS-KBA4Q §Acceptance Criteria.
func TestValidateChatItems_EverythingAtItsMost(t *testing.T) {
	name := strings.Repeat("字", 100)
	item := map[string]interface{}{
		"name":          name,
		"item_type":     "weapon",
		"affixes":       affixes(6),
		"unique_effect": strings.Repeat("字", 200),
		"description":   strings.Repeat("字", 300),
	}
	text := "[" + name + "]"
	require.LessOrEqual(t, utf8.RuneCountInString(text), chatTextMax)

	got, err := validateChatItems(linked(item), text)

	require.NoError(t, err)
	assert.Equal(t, linked(item), got)
}

// What goes out is built from what was read, never the inbound object itself. FS-KBA4Q R29.
func TestValidateChatItems_RebuildsRatherThanPassesThrough(t *testing.T) {
	inboundAffix := affix("strength", 2, 7)
	inbound := rustyBlade()
	inbound["affixes"] = []interface{}{inboundAffix}

	got, err := validateChatItems(linked(inbound), linkedText)
	require.NoError(t, err)

	// what the sender's map becomes afterwards does not reach the line
	inbound["entity_id"] = "smuggled"
	inboundAffix["id"] = "smuggled"
	want := rustyBlade()
	want["affixes"] = []interface{}{affix("strength", 2, 7)}
	assert.Equal(t, linked(want), got)
}

// ---- through the relay ---------------------------------------------------------------------------

func (r *rulesRig) sayWith(p *types.Player, text string, items interface{}) {
	r.relay.relay(context.Background(), p, &websocket.Conn{}, map[string]interface{}{"channel": "area", "text": text, "items": items})
}

func (r *rulesRig) noticeCodes() []string {
	codes := make([]string, 0, len(r.spy.notices))
	for _, n := range r.spy.notices {
		codes = append(codes, n.Payload["code"].(string))
	}
	return codes
}

// A line with a link is stamped with the seven fields and the validated `items`. FS-KBA4Q R25.
func TestChatRelay_ItemLinks_RideTheStampedLine(t *testing.T) {
	rig := newRulesRig()
	wren := seatedSpeaker("Wren")

	rig.sayWith(wren, linkedText, linked(rustyBlade()))

	require.Empty(t, rig.spy.notices)
	require.Len(t, rig.spy.lines, 1)
	payload := rig.spy.lines[0].Payload
	assert.Equal(t, linked(rustyBlade()), payload["items"])
	assert.Equal(t, linkedText, payload["text"])
	assert.Len(t, payload, len(chatLineKeys)+1, "the seven stamp fields and items")
}

// A line with no links, however that is said, has no `items` member at all. FS-KBA4Q R24, R25.
func TestChatRelay_ItemLinks_NoneLeavesTheLineAsItWas(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]interface{}
	}{
		{name: "no items", payload: map[string]interface{}{"channel": "area", "text": linkedText}},
		{name: "empty items", payload: map[string]interface{}{"channel": "area", "text": linkedText, "items": []interface{}{}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newRulesRig()
			wren := seatedSpeaker("Wren")

			rig.relay.relay(context.Background(), wren, &websocket.Conn{}, tt.payload)

			require.Empty(t, rig.spy.notices)
			require.Len(t, rig.spy.lines, 1)
			payload := rig.spy.lines[0].Payload
			assert.NotContains(t, payload, "items")
			assert.Len(t, payload, len(chatLineKeys), "the seven stamp fields and nothing else")
		})
	}
}

// A line whose items fail is refused whole with bad_item_link and its words, told to nobody.
// FS-KBA4Q R27, R28.
func TestChatRelay_ItemLinks_BadOnesRefuseTheLine(t *testing.T) {
	unknownKey := rustyBlade()
	unknownKey["status"] = "listed"
	tests := []struct {
		name  string
		items interface{}
	}{
		{name: "four", items: linked(rustyBlade(), rustyBlade(), rustyBlade(), rustyBlade())},
		{name: "not an array", items: rustyBlade()},
		{name: "an entry that is not an object", items: []interface{}{"Rusty Blade"}},
		{name: "an unknown key", items: linked(unknownKey)},
		{name: "a token the text lacks", items: linked(named("Iron Helm"))},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newRulesRig()

			rig.sayWith(seatedSpeaker("Wren"), strings.Repeat("[Rusty Blade]", 4), tt.items)

			assert.Empty(t, rig.spy.lines, "a refused line reaches nobody")
			require.Len(t, rig.spy.notices, 1)
			notice := rig.spy.notices[0]
			assert.Equal(t, chatNoticeAction, notice.Action)
			assert.Equal(t, "bad_item_link", notice.Payload["code"])
			assert.Equal(t, "That item could not be shown. Your line was not sent.", notice.Payload["text"])
		})
	}
}

// A refused line does not use the sender's flood window; an accepted one with three links starts
// the same window as any line. FS-KBA4Q R27, R30.
func TestChatRelay_ItemLinks_AndTheFloodWindow(t *testing.T) {
	rig := newRulesRig()
	wren := seatedSpeaker("Wren")
	three := linked(named("A"), named("B"), named("C"))

	rig.sayWith(wren, "[A]", linked(named("Z")))
	rig.sayWith(wren, "[A] [B] [C]", three)
	require.Equal(t, []string{"bad_item_link"}, rig.noticeCodes(), "the valid line right after the refused one is told")
	require.Len(t, rig.spy.lines, 1)

	rig.clock.advance(chatFloodWindow - time.Millisecond)
	rig.say(wren, "again")
	assert.Equal(t, []string{"bad_item_link", "too_fast"}, rig.noticeCodes(), "inside the window")

	rig.clock.advance(time.Millisecond)
	rig.say(wren, "again")
	assert.Len(t, rig.spy.lines, 2, "two seconds on, heard again")
}

// too_long is decided on the text alone and comes first; inside the window a good line with
// links is too_fast like any other. FS-KBA4Q R27, §Edge States.
func TestChatRelay_ItemLinks_RefusalOrder(t *testing.T) {
	rig := newRulesRig()
	wren := seatedSpeaker("Wren")

	rig.sayWith(wren, strings.Repeat("a", chatTextMax+1), linked(named("Z")))
	assert.Equal(t, []string{"too_long"}, rig.noticeCodes(), "too long before the items are looked at")

	rig.say(wren, "first")
	rig.sayWith(wren, "[Z]", "not an array")
	rig.sayWith(wren, linkedText, linked(rustyBlade()))
	assert.Equal(t, []string{"too_long", "bad_item_link", "too_fast"}, rig.noticeCodes(),
		"a bad link is refused as such inside the window, a good one as too fast")
	assert.Len(t, rig.spy.lines, 1)
}

// Nothing the relay logs carries any part of a snapshot, whether the line is told or refused.
// FS-KBA4Q R26; ADR-0033.
func TestChatRelay_ItemLinks_LogsCarryNoSnapshot(t *testing.T) {
	sink := captureLogs(t)
	rig := newRulesRig()
	wren := seatedSpeaker("Wren")
	secret := func(name string) map[string]interface{} {
		return map[string]interface{}{
			"name":          name,
			"item_type":     "weapon",
			"weapon_type":   "swordfish_blade",
			"unique_effect": "swordfish-effect",
			"description":   "swordfish-lore",
		}
	}

	rig.sayWith(wren, "[Swordfish Edge]", linked(secret("Swordfish Edge")))
	require.Len(t, rig.spy.lines, 1)
	refused := secret("Swordfish Edge")
	refused["swordfish_key"] = "swordfish-value"
	rig.sayWith(wren, "[Swordfish Edge]", linked(refused))
	rig.sayWith(wren, "nothing here", linked(secret("Swordfish Edge")))
	require.Equal(t, []string{"bad_item_link", "bad_item_link"}, rig.noticeCodes())

	assert.NotContains(t, strings.ToLower(sink.String()), "swordfish", "part of a snapshot reached the log")
}
