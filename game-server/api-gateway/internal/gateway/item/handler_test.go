package item_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/item"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

type stubItemClient struct {
	err error

	types     *pb.ListItemTypesResponse
	rarities  *pb.ListItemRaritiesResponse
	weapons   *pb.ListWeaponsResponse
	loadout   *pb.GetLoadoutResponse
	instances *pb.ListItemInstancesResponse
}

func (s *stubItemClient) ListItemTypes(context.Context) (*pb.ListItemTypesResponse, error) {
	return s.types, s.err
}

func (s *stubItemClient) ListItemRarities(context.Context) (*pb.ListItemRaritiesResponse, error) {
	return s.rarities, s.err
}

func (s *stubItemClient) CreateWeapon(context.Context, *pb.CreateWeaponRequest) (*pb.Weapon, error) {
	return nil, s.err
}

func (s *stubItemClient) ListWeaponsWithTemplate(context.Context) (*pb.ListWeaponsResponse, error) {
	return s.weapons, s.err
}

func (s *stubItemClient) CreateItemTemplate(context.Context, *pb.CreateItemTemplateRequest) (*pb.ItemTemplate, error) {
	return nil, s.err
}

func (s *stubItemClient) CreateCompleteWeapon(context.Context, *pb.CreateCompleteWeaponRequest) (*pb.WeaponDetail, error) {
	return nil, s.err
}

func (s *stubItemClient) CreateCompleteArmor(context.Context, *pb.CreateCompleteArmorRequest) (*pb.ArmorDetail, error) {
	return nil, s.err
}

func (s *stubItemClient) CreateCompleteConsumable(context.Context, *pb.CreateCompleteConsumableRequest) (*pb.ConsumableDetail, error) {
	return nil, s.err
}

func (s *stubItemClient) GetLoadout(context.Context, *pb.GetLoadoutRequest) (*pb.GetLoadoutResponse, error) {
	return s.loadout, s.err
}

func (s *stubItemClient) ListItemInstances(context.Context, *pb.ListItemInstancesRequest) (*pb.ListItemInstancesResponse, error) {
	return s.instances, s.err
}

func (s *stubItemClient) UpdateLoadout(context.Context, *pb.UpdateLoadoutRequest) (*pb.UpdateLoadoutResponse, error) {
	return nil, s.err
}

const testIdentity = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

// newRouter mounts the item routes as config/routes.go does, with a stubbed
// identity middleware — the real one is covered by I-0002.
func newRouter(client item.ItemClient, identity string) *gin.Engine {
	r := gin.New()
	h := item.NewHandler(client)

	g := r.Group("/items")
	g.Use(func(c *gin.Context) {
		if identity != "" {
			c.Set("userIdStr", identity)
		}
		c.Next()
	})

	g.POST("/weapon", h.CreateWeaponHandler)
	g.POST("/template", h.CreateItemTemplateHandler)
	g.POST("/complete-weapon", h.CreateCompleteWeaponHandler)
	g.POST("/complete-armor", h.CreateCompleteArmorHandler)
	g.POST("/complete-consumable", h.CreateCompleteConsumableHandler)
	g.GET("/weapons", h.ListWeaponsWithTemplateHandler)
	g.GET("/types", h.ListItemTypesHandler)
	g.GET("/rarities", h.ListItemRaritiesHandler)
	g.GET("/loadout", h.GetLoadoutHandler)
	g.PUT("/loadout", h.UpdateLoadoutHandler)
	g.GET("/instances", h.ListItemInstancesHandler)

	return r
}

// Bodies for the complete-* cases satisfy `binding:"required"` on purpose: an
// empty body fails at the binder with its own 400, so the downstream error would
// never be reached and a 400 assertion would pass for the wrong reason.
//
// FS-0001 §Requirements 4, 5, 7. This package's five switches handled only
// InvalidArgument and AlreadyExists; three more sites called FromError and threw
// the result away; three handlers had no mapping at all. Every code other than
// those two therefore returned 500 here, and these cases are the record of what
// changes.
func TestItemHandler_DownstreamFailures_ResolveThroughTheSeam(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		clientErr  error
		wantStatus int
		wantCode   errcode.Code
	}{
		{
			name: "create weapon rejected", method: http.MethodPost, path: "/items/weapon", body: `{}`,
			clientErr:  status.Error(codes.InvalidArgument, "damage must be positive"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "create weapon conflicts", method: http.MethodPost, path: "/items/weapon", body: `{}`,
			clientErr:  status.Error(codes.AlreadyExists, "weapon code taken"),
			wantStatus: http.StatusConflict, wantCode: errcode.AlreadyExists,
		},
		{
			// CHANGED: no NotFound case in any item switch — was 500.
			name: "create weapon with missing template", method: http.MethodPost, path: "/items/weapon", body: `{}`,
			clientErr:  status.Error(codes.NotFound, "no such template"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			// CHANGED: ListWeapons called FromError and discarded it — always 500.
			name: "list weapons while downstream is down", method: http.MethodGet, path: "/items/weapons",
			clientErr:  status.Error(codes.Unavailable, "items-service unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
		{
			// CHANGED: ListItemTypes discarded its status too.
			name: "list types not found", method: http.MethodGet, path: "/items/types",
			clientErr:  status.Error(codes.NotFound, "no types configured"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			// CHANGED: ListItemRarities, same shape.
			name: "list rarities rejected", method: http.MethodGet, path: "/items/rarities",
			clientErr:  status.Error(codes.InvalidArgument, "bad filter"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			// CHANGED: GetLoadout had NO mapping at all — every failure was 500.
			name: "get loadout not found", method: http.MethodGet, path: "/items/loadout",
			clientErr:  status.Error(codes.NotFound, "no loadout for member"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			// CHANGED: same handler, forbidden was also 500.
			name: "get loadout forbidden", method: http.MethodGet, path: "/items/loadout",
			clientErr:  status.Error(codes.PermissionDenied, "not your loadout"),
			wantStatus: http.StatusForbidden, wantCode: errcode.Forbidden,
		},
		{
			// CHANGED: ListItemInstances had no mapping.
			name: "list instances while downstream is down", method: http.MethodGet, path: "/items/instances",
			clientErr:  status.Error(codes.Unavailable, "items-service unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
		{
			// CHANGED: UpdateLoadout had no mapping.
			name: "update loadout rejected", method: http.MethodPut, path: "/items/loadout", body: `{}`,
			clientErr:  status.Error(codes.InvalidArgument, "slot occupied"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "complete weapon conflicts", method: http.MethodPost, path: "/items/complete-weapon", body: `{"item_name":"Axe","item_code":"AXE1","type_id":"t1","rarity_id":"r1","attack_power":5,"durability":10}`,
			clientErr:  status.Error(codes.AlreadyExists, "already exists"),
			wantStatus: http.StatusConflict, wantCode: errcode.AlreadyExists,
		},
		{
			name: "complete armor rejected", method: http.MethodPost, path: "/items/complete-armor", body: `{"item_name":"Mail","item_code":"MAIL1","type_id":"t1","rarity_id":"r1","defense_rating":5,"durability":10}`,
			clientErr:  status.Error(codes.InvalidArgument, "defense required"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "complete consumable not found", method: http.MethodPost, path: "/items/complete-consumable", body: `{"item_name":"Potion","item_code":"POT1","type_id":"t1","rarity_id":"r1","max_stack_size":9}`,
			clientErr:  status.Error(codes.NotFound, "no such effect"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRouter(&stubItemClient{err: tt.clientErr}, testIdentity)

			w := testsupport.Do(r, tt.method, tt.path, tt.body)

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// FS-0001 §Requirements 9 — CreateItemTemplateHandler put err.Error() in an
// "error" member of the response, so a malformed body handed the client Go type
// and offset detail.
func TestItemHandler_BindErrors_AreNotEchoed(t *testing.T) {
	r := newRouter(&stubItemClient{}, testIdentity)

	w := testsupport.Do(r, http.MethodPost, "/items/template", `{"item_name":`)

	body := testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.ValidationFailed))
	assert.NotContains(t, w.Body.String(), "unexpected EOF")
	assert.NotContains(t, w.Body.String(), "json:")
	assert.NotContains(t, body, "error", "the legacy `error` member is gone")
}

// FS-0001 §Requirements 9 — downstream prose never crosses the boundary.
func TestItemHandler_DownstreamMessages_NeverReachTheClient(t *testing.T) {
	const leak = "pq: insert or update on table \"item_instances\" violates foreign key constraint"

	r := newRouter(&stubItemClient{err: status.Error(codes.InvalidArgument, leak)}, testIdentity)

	w := testsupport.Do(r, http.MethodPost, "/items/weapon", `{}`)

	assert.NotContains(t, w.Body.String(), "item_instances")
	assert.NotContains(t, w.Body.String(), "pq:")
}

// The identity these handlers read comes from the JWT middleware; its absence is
// a wiring fault. Status stays 401 as today (§Requirements 12), now with a code.
func TestItemHandler_MissingIdentity_Returns401(t *testing.T) {
	for _, tc := range []struct{ method, path string }{
		{http.MethodPost, "/items/template"},
		{http.MethodPost, "/items/complete-weapon"},
		{http.MethodGet, "/items/loadout"},
		{http.MethodGet, "/items/instances"},
		{http.MethodPut, "/items/loadout"},
	} {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			r := newRouter(&stubItemClient{}, "")

			w := testsupport.Do(r, tc.method, tc.path, `{}`)

			testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
		})
	}
}

// FS-0001 §Requirements 12 — success responses are untouched.
func TestItemHandler_SuccessResponses_AreUnchanged(t *testing.T) {
	client := &stubItemClient{
		weapons: &pb.ListWeaponsResponse{},
		types:   &pb.ListItemTypesResponse{},
	}

	t.Run("list weapons", func(t *testing.T) {
		w := testsupport.Do(newRouter(client, testIdentity), http.MethodGet, "/items/weapons", "")

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

		body := testsupport.Decode(t, w)
		assert.Equal(t, float64(http.StatusOK), body["statusCode"])
		assert.Equal(t, "Weapons retrieved successfully", body["message"])
	})
}
