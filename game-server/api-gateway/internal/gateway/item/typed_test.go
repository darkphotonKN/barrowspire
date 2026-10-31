package item_test

import (
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/item"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
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

// The instance list tells a delver which relics can be listed: every instance carries
// its snake_case `status` (FS-8EGFA §API surface).
func TestListItemInstances_CarriesStatus(t *testing.T) {
	client := &stubItemClient{instances: &pb.ListItemInstancesResponse{Items: []*pb.ItemInstance{
		{Id: "a", Name: "Blade", Status: "AVAILABLE"},
		{Id: "b", Name: "Shield", Status: "LISTED"},
		{Id: "c", Name: "Ring", Status: "IN_ESCROW"},
		{Id: "d", Name: "Helm", Status: "PENDING_SETTLEMENT"},
		{Id: "e", Name: "Torch", Status: "IN_RUN"},
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
	assert.Equal(t, map[string]any{"a": "AVAILABLE", "b": "LISTED", "c": "IN_ESCROW", "d": "PENDING_SETTLEMENT", "e": "IN_RUN"}, got)
}

// FS-18Z5F R4 and §API surface (list instances): the documented status enum
// carries IN_RUN, so the generated client accepts an item checked out into a
// run.
func TestItemInstanceSchema_StatusEnumCarriesInRun(t *testing.T) {
	api := contract.New(gin.New())
	item.RegisterOperations(api, item.NewHandler(&stubItemClient{}),
		contract.Protected(func(*gin.Context) {}), contract.SeamError, contract.Secured)

	schema := api.OpenAPI().Components.Schemas.Map()["ItemInstance"]
	if assert.NotNil(t, schema) && assert.Contains(t, schema.Properties, "status") {
		assert.Contains(t, schema.Properties["status"].Enum, any("IN_RUN"))
	}
}

// listInstances answers the instance list for the given instances, keyed by id.
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

// FS-VPD8Y R21: every instance says where the member keeps it, lowercase, and
// the field is always present.
func TestListItemInstances_CarriesLocation(t *testing.T) {
	got := listInstances(t,
		&pb.ItemInstance{Id: "carried", Name: "Blade", Location: "bag"},
		&pb.ItemInstance{Id: "stored", Name: "Shield", Location: "stash"},
	)

	assert.Equal(t, "bag", got["carried"]["location"])
	assert.Equal(t, "stash", got["stored"]["location"])
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
		{http.MethodPut, "/api/items/instances/" + uuid.NewString() + "/location", `{"location":"stash"}`},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			client := &stubItemClient{
				types: &pb.ListItemTypesResponse{}, rarities: &pb.ListItemRaritiesResponse{},
				weapons: &pb.ListWeaponsResponse{}, loadout: &pb.GetLoadoutResponse{},
				instances: &pb.ListItemInstancesResponse{}, moved: &pb.MoveItemInstanceResponse{Location: "stash"},
			}
			testsupport.DoWithHeaders(newTypedRouter(client), tt.method, tt.path, tt.body, map[string]string{
				"Content-Type":  "application/json",
				"Authorization": "Bearer caller-token",
			})
			assert.Equal(t, []string{"Bearer caller-token"}, client.gotAuth)
		})
	}
}

// FS-VPD8Y §API surface (move-item-instance): the id and destination reach
// items-service, never a member id, and the result echoes where the item is.
func TestMoveItemInstance_MovesAndEchoes(t *testing.T) {
	id := uuid.NewString()
	client := &stubItemClient{moved: &pb.MoveItemInstanceResponse{Id: id, Location: "stash"}}

	w := testsupport.DoWithHeaders(newTypedRouter(client), http.MethodPut, "/api/items/instances/"+id+"/location",
		`{"location":"stash"}`, map[string]string{"Content-Type": "application/json"})

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, &pb.MoveItemInstanceRequest{ItemInstanceId: id, Location: "stash"}, client.gotMove)
	body := testsupport.Decode(t, w)
	assert.EqualValues(t, http.StatusOK, body["statusCode"])
	assert.Equal(t, map[string]any{"id": id, "location": "stash"}, body["result"])
}

// FS-VPD8Y R13, R25 and §API surface: items-service decides every refusal and
// the seam carries its code; the boundary rejects shape with 422 before any
// call. Each answer is problem+json.
func TestMoveItemInstance_Errors(t *testing.T) {
	id := uuid.NewString()
	tests := []struct {
		name       string
		path       string
		body       string
		err        error
		wantStatus int
		wantCode   errcode.Code
		wantCall   bool
	}{
		{"not the caller's", id, `{"location":"bag"}`, status.Error(codes.NotFound, "item instance not found"), http.StatusNotFound, errcode.NotFound, true},
		{"worn", id, `{"location":"stash"}`, errcode.Refuse(errcode.ItemWorn), http.StatusBadRequest, errcode.ItemWorn, true},
		{"listed", id, `{"location":"stash"}`, errcode.Refuse(errcode.ItemNotAvailable), http.StatusBadRequest, errcode.ItemNotAvailable, true},
		{"bag full", id, `{"location":"bag"}`, errcode.Refuse(errcode.BagFull), http.StatusBadRequest, errcode.BagFull, true},
		{"stash full", id, `{"location":"stash"}`, errcode.Refuse(errcode.StashFull), http.StatusBadRequest, errcode.StashFull, true},
		{"items-service down", id, `{"location":"bag"}`, status.Error(codes.Unavailable, "dial tcp"), http.StatusServiceUnavailable, errcode.ServiceUnavailable, true},
		{"malformed id", "not-a-uuid", `{"location":"bag"}`, nil, http.StatusUnprocessableEntity, errcode.ValidationFailed, false},
		{"unknown location", id, `{"location":"worn"}`, nil, http.StatusUnprocessableEntity, errcode.ValidationFailed, false},
		{"missing location", id, `{}`, nil, http.StatusUnprocessableEntity, errcode.ValidationFailed, false},
		{"unknown body member", id, `{"location":"bag","member_id":"x"}`, nil, http.StatusUnprocessableEntity, errcode.ValidationFailed, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &stubItemClient{err: tt.err}

			w := testsupport.DoWithHeaders(newTypedRouter(client), http.MethodPut, "/api/items/instances/"+tt.path+"/location",
				tt.body, map[string]string{"Content-Type": "application/json"})

			assert.Equal(t, tt.wantStatus, w.Code)
			assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))
			assert.Equal(t, string(tt.wantCode), testsupport.Decode(t, w)["code"])
			assert.Equal(t, tt.wantCall, client.gotMove != nil, "items-service called")
		})
	}
}

// FS-VPD8Y §API surface (move-item-instance): the documented error set is the
// one the operation produces, 503 included, so the generated client knows a
// down items-service answers SERVICE_UNAVAILABLE.
func TestMoveItemInstance_DocumentsItsErrors(t *testing.T) {
	api := contract.New(gin.New())
	item.RegisterOperations(api, item.NewHandler(&stubItemClient{}),
		contract.Protected(func(*gin.Context) {}), contract.SeamError, contract.Secured)

	path := api.OpenAPI().Paths["/api/items/instances/{id}/location"]
	if !assert.NotNil(t, path) || !assert.NotNil(t, path.Put) {
		return
	}
	for _, want := range []string{"400", "401", "404", "422", "500", "503"} {
		assert.Contains(t, path.Put.Responses, want, "move-item-instance documents %s", want)
	}
}

// FS-VPD8Y R18, R23 and §API surface (update-loadout): items-service refuses
// an unequip, or a swap that would grow the bag, into a bag at or over 30, and
// the seam answers 400 · BAG_FULL as problem+json.
func TestUpdateLoadout_BagFull(t *testing.T) {
	client := &stubItemClient{err: errcode.Refuse(errcode.BagFull)}

	w := testsupport.DoWithHeaders(newTypedRouter(client), http.MethodPut, "/api/items/loadout",
		`{"slot":"weapon","item_instance_id":""}`, map[string]string{"Content-Type": "application/json"})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))
	assert.Equal(t, string(errcode.BagFull), testsupport.Decode(t, w)["code"])
}

// FS-18Z5F R32, R33 and §API surface (update-loadout): items-service refuses
// equipping an instance that is not AVAILABLE (in a run, listed, pending
// settlement), and the seam answers 400 · ITEM_NOT_AVAILABLE as problem+json.
func TestUpdateLoadout_ItemNotAvailable(t *testing.T) {
	client := &stubItemClient{err: errcode.Refuse(errcode.ItemNotAvailable)}

	w := testsupport.DoWithHeaders(newTypedRouter(client), http.MethodPut, "/api/items/loadout",
		`{"slot":"weapon","item_instance_id":"`+uuid.NewString()+`"}`, map[string]string{"Content-Type": "application/json"})

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))
	assert.Equal(t, string(errcode.ItemNotAvailable), testsupport.Decode(t, w)["code"])
}
