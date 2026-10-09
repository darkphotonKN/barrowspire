package item_test

import (
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/item"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func newTypedRouter(client item.ItemClient) *gin.Engine {
	r := gin.New()
	embed := func(c *gin.Context) {
		c.Request = c.Request.WithContext(commonauth.EmbedIdentity(c.Request.Context(),
			commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RoleAdmin}))
	}
	item.RegisterOperations(contract.New(r), item.NewHandler(client),
		contract.Protected(embed), contract.SeamError, contract.Secured)
	return r
}

// The stash tells a delver which relics can be listed: every instance carries
// its snake_case `status` (FS-8EGFA §API surface).
func TestListItemInstances_CarriesStatus(t *testing.T) {
	client := &stubItemClient{instances: &pb.ListItemInstancesResponse{Items: []*pb.ItemInstance{
		{Id: "a", Name: "Blade", Status: "AVAILABLE"},
		{Id: "b", Name: "Shield", Status: "LISTED"},
		{Id: "c", Name: "Ring", Status: "IN_ESCROW"},
		{Id: "d", Name: "Helm", Status: "PENDING_SETTLEMENT"},
	}}}
	w := testsupport.Do(newTypedRouter(client), http.MethodGet, "/api/items/instances", "")
	assert.Equal(t, http.StatusOK, w.Code)

	body := testsupport.Decode(t, w)
	items := body["result"].(map[string]any)["items"].([]any)
	got := map[string]any{}
	for _, it := range items {
		m := it.(map[string]any)
		got[m["id"].(string)] = m["status"]
	}
	assert.Equal(t, map[string]any{"a": "AVAILABLE", "b": "LISTED", "c": "IN_ESCROW", "d": "PENDING_SETTLEMENT"}, got)
}

// listInstances answers the stash for the given instances, keyed by id.
func listInstances(t *testing.T, instances ...*pb.ItemInstance) map[string]map[string]any {
	t.Helper()
	client := &stubItemClient{instances: &pb.ListItemInstancesResponse{Items: instances}}
	w := testsupport.Do(newTypedRouter(client), http.MethodGet, "/api/items/instances", "")
	assert.Equal(t, http.StatusOK, w.Code)

	got := map[string]map[string]any{}
	for _, it := range testsupport.Decode(t, w)["result"].(map[string]any)["items"].([]any) {
		m := it.(map[string]any)
		got[m["id"].(string)] = m
	}
	return got
}

// FS-4R9M9 §API surface: each instance carries what it rolled — item level,
// the derived required level and its affixes — and a unique its effect text,
// never its effect code.
func TestListItemInstances_CarriesItemLevelAffixesAndUniqueEffect(t *testing.T) {
	got := listInstances(t,
		&pb.ItemInstance{
			Id: "rolled", Name: "Ironbound Ring", ItemType: "ring", ItemLevel: 14, RequiredLevel: 9,
			Affixes: []*pb.Affix{{Stat: "strength", Tier: 2, Value: 6}, {Stat: "crit_chance", Tier: 3, Value: 4}},
		},
		&pb.ItemInstance{
			Id: "unique", Name: "Emberwake", ItemType: "armor", ItemLevel: 30, RequiredLevel: 22,
			Affixes:          []*pb.Affix{{Stat: "fire_damage", Tier: 0, Value: 0}},
			UniqueEffectCode: "burning_trail",
			UniqueEffectText: "Your footsteps leave a burning trail.",
		},
	)

	rolled := got["rolled"]
	assert.EqualValues(t, 14, rolled["item_level"])
	assert.EqualValues(t, 9, rolled["required_level"])
	assert.Equal(t, []any{
		map[string]any{"stat": "strength", "tier": float64(2), "value": float64(6)},
		map[string]any{"stat": "crit_chance", "tier": float64(3), "value": float64(4)},
	}, rolled["affixes"])
	assert.NotContains(t, rolled, "unique_effect", "a non-unique carries no unique effect")

	unique := got["unique"]
	assert.Equal(t, "Your footsteps leave a burning trail.", unique["unique_effect"])
	assert.Equal(t, []any{
		map[string]any{"stat": "fire_damage", "tier": float64(0), "value": float64(0)},
	}, unique["affixes"], "a unique's fixed affix keeps its tier 0")
	assert.NotContains(t, unique, "unique_effect_code")
	assert.NotContains(t, unique, "unique_effect_text")
}

// A legacy item (from before item levels) serialises affixes as [], never
// null and never absent.
func TestListItemInstances_ALegacyItemSerialisesEmptyAffixes(t *testing.T) {
	got := listInstances(t, &pb.ItemInstance{Id: "legacy", Name: "Longsword", ItemType: "weapon", ItemLevel: 1, RequiredLevel: 1})

	assert.Equal(t, []any{}, got["legacy"]["affixes"])
	assert.EqualValues(t, 1, got["legacy"]["item_level"])
	assert.NotContains(t, got["legacy"], "unique_effect")
}

// items-service authenticates every RPC from the authorization metadata
// (common/auth.Auth), so each operation must forward the caller's token.
func TestItemOperations_ForwardTheCallersToken(t *testing.T) {
	const rarity = `"rarity_id":"r","type_id":"t","item_name":"n","item_code":"c"`
	tests := []struct {
		method, path, body string
	}{
		{http.MethodPost, "/api/items/weapon", `{}`},
		{http.MethodGet, "/api/items/weapons", ``},
		{http.MethodPost, "/api/items/template", `{` + rarity + `,"item_type":"weapon","item_id":"i"}`},
		{http.MethodPost, "/api/items/complete-weapon", `{` + rarity + `,"attack_power":1,"durability":1}`},
		{http.MethodPost, "/api/items/complete-armor", `{` + rarity + `,"defense_rating":1,"durability":1}`},
		{http.MethodPost, "/api/items/complete-consumable", `{` + rarity + `,"max_stack_size":1}`},
		{http.MethodGet, "/api/items/types", ``},
		{http.MethodGet, "/api/items/rarities", ``},
		{http.MethodGet, "/api/items/loadout", ``},
		{http.MethodGet, "/api/items/instances", ``},
		{http.MethodPut, "/api/items/loadout", `{"slot":"weapon"}`},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			client := &stubItemClient{
				types: &pb.ListItemTypesResponse{}, rarities: &pb.ListItemRaritiesResponse{},
				weapons: &pb.ListWeaponsResponse{}, loadout: &pb.GetLoadoutResponse{},
				instances: &pb.ListItemInstancesResponse{},
			}
			testsupport.DoWithHeaders(newTypedRouter(client), tt.method, tt.path, tt.body, map[string]string{
				"Content-Type":  "application/json",
				"Authorization": "Bearer caller-token",
			})
			assert.Equal(t, []string{"Bearer caller-token"}, client.gotAuth)
		})
	}
}
