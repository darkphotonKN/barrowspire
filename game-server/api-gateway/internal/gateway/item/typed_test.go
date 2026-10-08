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
