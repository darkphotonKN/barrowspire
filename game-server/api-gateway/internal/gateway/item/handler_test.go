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
	"google.golang.org/grpc/metadata"
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

	gotAuth []string // outgoing authorization metadata of the last call
}

func (s *stubItemClient) recordAuth(ctx context.Context) {
	md, _ := metadata.FromOutgoingContext(ctx)
	s.gotAuth = md.Get("authorization")
}

func (s *stubItemClient) ListItemTypes(ctx context.Context) (*pb.ListItemTypesResponse, error) {
	s.recordAuth(ctx)
	return s.types, s.err
}

func (s *stubItemClient) ListItemRarities(ctx context.Context) (*pb.ListItemRaritiesResponse, error) {
	s.recordAuth(ctx)
	return s.rarities, s.err
}

func (s *stubItemClient) CreateWeapon(ctx context.Context, _ *pb.CreateWeaponRequest) (*pb.Weapon, error) {
	s.recordAuth(ctx)
	return nil, s.err
}

func (s *stubItemClient) ListWeaponsWithTemplate(ctx context.Context) (*pb.ListWeaponsResponse, error) {
	s.recordAuth(ctx)
	return s.weapons, s.err
}

func (s *stubItemClient) CreateItemTemplate(ctx context.Context, _ *pb.CreateItemTemplateRequest) (*pb.ItemTemplate, error) {
	s.recordAuth(ctx)
	return nil, s.err
}

func (s *stubItemClient) CreateCompleteWeapon(ctx context.Context, _ *pb.CreateCompleteWeaponRequest) (*pb.WeaponDetail, error) {
	s.recordAuth(ctx)
	return nil, s.err
}

func (s *stubItemClient) CreateCompleteArmor(ctx context.Context, _ *pb.CreateCompleteArmorRequest) (*pb.ArmorDetail, error) {
	s.recordAuth(ctx)
	return nil, s.err
}

func (s *stubItemClient) CreateCompleteConsumable(ctx context.Context, _ *pb.CreateCompleteConsumableRequest) (*pb.ConsumableDetail, error) {
	s.recordAuth(ctx)
	return nil, s.err
}

func (s *stubItemClient) GetLoadout(ctx context.Context, _ *pb.GetLoadoutRequest) (*pb.GetLoadoutResponse, error) {
	s.recordAuth(ctx)
	return s.loadout, s.err
}

func (s *stubItemClient) ListItemInstances(ctx context.Context, _ *pb.ListItemInstancesRequest) (*pb.ListItemInstancesResponse, error) {
	s.recordAuth(ctx)
	return s.instances, s.err
}

func (s *stubItemClient) UpdateLoadout(ctx context.Context, _ *pb.UpdateLoadoutRequest) (*pb.UpdateLoadoutResponse, error) {
	s.recordAuth(ctx)
	return nil, s.err
}

// newRouter mounts the item gin routes that read no caller identity. The
// member-scoped ones are typed operations now and read the caller from
// commonauth; see typed.go.
func newRouter(client item.ItemClient) *gin.Engine {
	r := gin.New()
	h := item.NewHandler(client)

	g := r.Group("/items")
	g.POST("/weapon", h.CreateWeaponHandler)
	g.GET("/weapons", h.ListWeaponsWithTemplateHandler)
	g.GET("/types", h.ListItemTypesHandler)
	g.GET("/rarities", h.ListItemRaritiesHandler)

	return r
}

// FS-22WKC §Requirements 4, 5, 7. This package's five switches handled only
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRouter(&stubItemClient{err: tt.clientErr})

			w := testsupport.Do(r, tt.method, tt.path, tt.body)

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// FS-22WKC §Requirements 9 — downstream prose never crosses the boundary.
func TestItemHandler_DownstreamMessages_NeverReachTheClient(t *testing.T) {
	const leak = "pq: insert or update on table \"item_instances\" violates foreign key constraint"

	r := newRouter(&stubItemClient{err: status.Error(codes.InvalidArgument, leak)})

	w := testsupport.Do(r, http.MethodPost, "/items/weapon", `{}`)

	assert.NotContains(t, w.Body.String(), "item_instances")
	assert.NotContains(t, w.Body.String(), "pq:")
}

// FS-22WKC §Requirements 12 — success responses are untouched.
func TestItemHandler_SuccessResponses_AreUnchanged(t *testing.T) {
	client := &stubItemClient{
		weapons:  &pb.ListWeaponsResponse{},
		types:    &pb.ListItemTypesResponse{},
		rarities: &pb.ListItemRaritiesResponse{},
	}

	t.Run("every success path keeps its status and envelope", func(t *testing.T) {
		for _, tc := range []struct {
			method, path string
			wantStatus   int
		}{
			{http.MethodGet, "/items/weapons", http.StatusOK},
			{http.MethodGet, "/items/types", http.StatusOK},
			{http.MethodGet, "/items/rarities", http.StatusOK},
		} {
			w := testsupport.Do(newRouter(client), tc.method, tc.path, "")

			assert.Equal(t, tc.wantStatus, w.Code, tc.path)
			assert.Contains(t, w.Header().Get("Content-Type"), "application/json", tc.path)
			body := testsupport.Decode(t, w)
			assert.Equal(t, float64(tc.wantStatus), body["statusCode"], tc.path)
			assert.NotContains(t, body, "code", "a success must never carry a problem+json code")
		}
	})

	t.Run("list weapons", func(t *testing.T) {
		w := testsupport.Do(newRouter(client), http.MethodGet, "/items/weapons", "")

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

		body := testsupport.Decode(t, w)
		assert.Equal(t, float64(http.StatusOK), body["statusCode"])
		assert.Equal(t, "Weapons retrieved successfully", body["message"])
	})
}
