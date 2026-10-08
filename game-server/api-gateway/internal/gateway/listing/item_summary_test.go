package listing_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
)

// embeddedItem fetches one listing whose item is the given summary and returns
// the embedded item object as the client receives it.
func embeddedItem(t *testing.T, summary *pbitems.ItemSummary) map[string]any {
	t.Helper()
	summary.Id = oneItemID
	client := &stubListingClient{one: browsable(oneListingID, oneItemID, time.Date(2026, 12, 2, 18, 0, 0, 0, time.UTC))}
	items := &stubItemSummaries{byID: map[string]*pbitems.ItemSummary{oneItemID: summary}}

	w := getListing(newRouterWithItems(client, items), oneListingID)
	require.Equal(t, http.StatusOK, w.Code)

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	item, ok := body["item"].(map[string]any)
	require.True(t, ok, "the listing embeds its item")
	return item
}

// FS-4R9M9 §Requirements 57, §API surface: the embedded summary carries what
// the item rolled — item level, the derived required level and every affix.
func TestItemSummary_CarriesItemLevelRequiredLevelAndAffixes(t *testing.T) {
	item := embeddedItem(t, &pbitems.ItemSummary{
		Name: "Ironbound Ring", ItemType: "ring", Rarity: "rare",
		ItemLevel: 14, RequiredLevel: 9,
		Affixes: []*pbitems.Affix{
			{Stat: "strength", Tier: 2, Value: 6},
			{Stat: "crit_chance", Tier: 3, Value: 4},
		},
	})

	assert.EqualValues(t, 14, item["itemLevel"])
	assert.EqualValues(t, 9, item["requiredLevel"])
	assert.Equal(t, []any{
		map[string]any{"stat": "strength", "tier": float64(2), "value": float64(6)},
		map[string]any{"stat": "crit_chance", "tier": float64(3), "value": float64(4)},
	}, item["affixes"])
	assert.NotContains(t, item, "uniqueEffect", "a non-unique carries no unique effect")
}

// A unique's fixed affix is tier 0 and still serialises its tier; the effect
// text reaches the client, never the effect code.
func TestItemSummary_AUniqueCarriesItsEffectAndTierZeroAffix(t *testing.T) {
	item := embeddedItem(t, &pbitems.ItemSummary{
		Name: "Emberwake", ItemType: "armor", Rarity: "fabled",
		ItemLevel: 30, RequiredLevel: 22,
		Affixes:          []*pbitems.Affix{{Stat: "fire_damage", Tier: 0, Value: 0}},
		UniqueEffectText: proto.String("Your footsteps leave a burning trail."),
	})

	assert.Equal(t, "Your footsteps leave a burning trail.", item["uniqueEffect"])
	assert.Equal(t, []any{
		map[string]any{"stat": "fire_damage", "tier": float64(0), "value": float64(0)},
	}, item["affixes"])
}

// A legacy item (from before item levels) has no affixes: the client gets an
// empty list, never null and never an absent field.
func TestItemSummary_ALegacyItemSerialisesEmptyAffixes(t *testing.T) {
	item := embeddedItem(t, &pbitems.ItemSummary{
		Name: "Longsword", ItemType: "weapon", Rarity: "normal", ItemLevel: 1, RequiredLevel: 1,
	})

	assert.Equal(t, []any{}, item["affixes"])
	assert.NotContains(t, item, "uniqueEffect")
}
