package character_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/character"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// fakeCharacterClient answers every RPC with canned values and records what the
// gateway sent, so tests can prove the member came from the token.
type fakeCharacterClient struct {
	character  *pb.Character
	characters []*pb.Character
	err        error

	calls     int
	gotCreate *pb.CreateCharacterRequest
	gotList   *pb.ListCharactersRequest
	gotGet    *pb.GetCharacterRequest
	gotDelete *pb.DeleteCharacterRequest
}

func (f *fakeCharacterClient) CreateCharacter(_ context.Context, req *pb.CreateCharacterRequest) (*pb.Character, error) {
	f.calls++
	f.gotCreate = req
	if f.err != nil {
		return nil, f.err
	}
	return f.character, nil
}

func (f *fakeCharacterClient) ListCharacters(_ context.Context, req *pb.ListCharactersRequest) (*pb.ListCharactersResponse, error) {
	f.calls++
	f.gotList = req
	if f.err != nil {
		return nil, f.err
	}
	return &pb.ListCharactersResponse{Characters: f.characters}, nil
}

func (f *fakeCharacterClient) GetCharacter(_ context.Context, req *pb.GetCharacterRequest) (*pb.Character, error) {
	f.calls++
	f.gotGet = req
	if f.err != nil {
		return nil, f.err
	}
	return f.character, nil
}

func (f *fakeCharacterClient) DeleteCharacter(_ context.Context, req *pb.DeleteCharacterRequest) (*emptypb.Empty, error) {
	f.calls++
	f.gotDelete = req
	if f.err != nil {
		return nil, f.err
	}
	return &emptypb.Empty{}, nil
}

// signedIn stands in for AuthMiddleware's success path with a fixed member.
func signedIn(member uuid.UUID) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request = c.Request.WithContext(commonauth.EmbedIdentity(c.Request.Context(),
			commonauth.Identity{MemberID: member, Role: commonauth.RolePlayer}))
	}
}

func newRouter(client character.CharacterClient, mw gin.HandlerFunc) *gin.Engine {
	r := gin.New()
	api := contract.New(r)
	character.RegisterOperations(api, character.NewHandler(client),
		contract.Protected(mw), contract.SeamError, contract.Secured)
	return r
}

var created = time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)

func pbCharacter(id, name, class string, level int32, exp, floor int64, next *int64) *pb.Character {
	return &pb.Character{
		Id:          id,
		Name:        name,
		Class:       class,
		Level:       level,
		Experience:  exp,
		LevelFloor:  floor,
		NextLevelAt: next,
		CreatedAt:   timestamppb.New(created),
	}
}

func TestListMyCharacters_ReturnsLevelAndExperience(t *testing.T) {
	member := uuid.New()
	firstID, capID := uuid.NewString(), uuid.NewString()
	client := &fakeCharacterClient{characters: []*pb.Character{
		pbCharacter(firstID, "Ash", "warrior", 2, 150, 100, proto.Int64(230)),
		pbCharacter(capID, "Maxed", "mage", 20, 40000, 38530, nil),
	}}

	w := testsupport.Do(newRouter(client, signedIn(member)), http.MethodGet, "/api/characters", "")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, member.String(), client.gotList.GetMemberId(), "member must come from the token")

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	list, ok := body["characters"].([]any)
	require.True(t, ok)
	require.Len(t, list, 2)

	assert.Equal(t, map[string]any{
		"id":          firstID,
		"name":        "Ash",
		"class":       "warrior",
		"level":       float64(2),
		"experience":  float64(150),
		"levelFloor":  float64(100),
		"nextLevelAt": float64(230),
		"createdAt":   "2026-10-08T12:00:00Z",
	}, list[0])

	capped := list[1].(map[string]any)
	assert.NotContains(t, capped, "nextLevelAt", "absent at the cap")
	assert.Equal(t, float64(38530), capped["levelFloor"])
}

func TestCreateCharacter_CreatesForTheTokenMember(t *testing.T) {
	member := uuid.New()
	id := uuid.NewString()
	client := &fakeCharacterClient{character: pbCharacter(id, "Ash", "warrior", 1, 0, 0, proto.Int64(100))}

	w := testsupport.Do(newRouter(client, signedIn(member)), http.MethodPost, "/api/characters",
		`{"name":"Ash","class":"warrior"}`)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	assert.Equal(t, member.String(), client.gotCreate.GetMemberId())
	assert.Equal(t, "Ash", client.gotCreate.GetName())
	assert.Equal(t, "warrior", client.gotCreate.GetClass())

	body := testsupport.Decode(t, w)
	assert.Equal(t, id, body["id"])
	assert.Equal(t, float64(1), body["level"], "level 1 stays on the wire")
	assert.Equal(t, float64(0), body["experience"], "0 experience stays on the wire")
	assert.Equal(t, float64(0), body["levelFloor"])
	assert.Equal(t, float64(100), body["nextLevelAt"])
}

// Shape is the edge's (422); domain validity is character-service's (400).
func TestCreateCharacter_ShapeFailuresAre422AndNeverReachTheService(t *testing.T) {
	cases := map[string]string{
		"missing class":       `{"name":"Ash"}`,
		"missing name":        `{"class":"warrior"}`,
		"unknown body member": `{"name":"Ash","class":"warrior","memberId":"someone-else"}`,
		"wrong type":          `{"name":7,"class":"warrior"}`,
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			client := &fakeCharacterClient{}
			w := testsupport.Do(newRouter(client, signedIn(uuid.New())), http.MethodPost, "/api/characters", payload)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Equal(t, 0, client.calls)
		})
	}
}

func TestGetCharacter_ReadsTheTokenMembersCharacter(t *testing.T) {
	member := uuid.New()
	id := uuid.NewString()
	client := &fakeCharacterClient{character: pbCharacter(id, "Ash", "archer", 5, 650, 600, proto.Int64(870))}

	w := testsupport.Do(newRouter(client, signedIn(member)), http.MethodGet, "/api/characters/"+id, "")

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Equal(t, member.String(), client.gotGet.GetMemberId())
	assert.Equal(t, id, client.gotGet.GetCharacterId())

	body := testsupport.Decode(t, w)
	assert.Equal(t, float64(5), body["level"])
	assert.Equal(t, float64(870), body["nextLevelAt"])
}

func TestDeleteCharacter_DeletesTheTokenMembersCharacter(t *testing.T) {
	member := uuid.New()
	id := uuid.NewString()
	client := &fakeCharacterClient{}

	w := testsupport.Do(newRouter(client, signedIn(member)), http.MethodDelete, "/api/characters/"+id, "")

	require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	assert.Empty(t, w.Body.String())
	assert.Equal(t, member.String(), client.gotDelete.GetMemberId())
	assert.Equal(t, id, client.gotDelete.GetCharacterId())
}

// The gateway checks uuid shape itself: a non-uuid id is a 422 at the edge and
// character-service is never asked.
func TestCharacterByID_NonUUIDIs422(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodDelete} {
		t.Run(method, func(t *testing.T) {
			client := &fakeCharacterClient{}
			w := testsupport.Do(newRouter(client, signedIn(uuid.New())), method, "/api/characters/char_123", "")

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Equal(t, 0, client.calls)
		})
	}
}

type call struct {
	name, method, path, body string
}

func allOps() []call {
	id := uuid.NewString()
	return []call{
		{"create-character", http.MethodPost, "/api/characters", `{"name":"Ash","class":"warrior"}`},
		{"list-my-characters", http.MethodGet, "/api/characters", ""},
		{"get-character", http.MethodGet, "/api/characters/" + id, ""},
		{"delete-character", http.MethodDelete, "/api/characters/" + id, ""},
	}
}

// Every character-service failure goes through the FS-22WKC seam, and no
// downstream prose reaches the client.
func TestCharacterOps_DownstreamErrorsGoThroughTheSeam(t *testing.T) {
	rows := []struct {
		name   string
		code   codes.Code
		status int
		want   errcode.Code
	}{
		{"domain validation (class, name)", codes.InvalidArgument, http.StatusBadRequest, errcode.ValidationFailed},
		{"name taken", codes.AlreadyExists, http.StatusConflict, errcode.AlreadyExists},
		{"foreign, deleted or unknown", codes.NotFound, http.StatusNotFound, errcode.NotFound},
		{"character-service down", codes.Unavailable, http.StatusServiceUnavailable, errcode.ServiceUnavailable},
		{"anything else", codes.Internal, http.StatusInternalServerError, errcode.Internal},
	}

	for _, op := range allOps() {
		for _, row := range rows {
			t.Run(op.name+"/"+row.name, func(t *testing.T) {
				client := &fakeCharacterClient{err: status.Error(row.code, "downstream detail that must not leak")}

				w := testsupport.Do(newRouter(client, signedIn(uuid.New())), op.method, op.path, op.body)

				body := testsupport.AssertProblem(t, w, row.status, string(row.want))
				assert.NotContains(t, body["detail"], "downstream detail")
			})
		}
	}
}

// The real AuthMiddleware: no token is a problem+json 401 and character-service
// is never asked.
func TestCharacterOps_UnauthenticatedIs401(t *testing.T) {
	for _, op := range allOps() {
		t.Run(op.name, func(t *testing.T) {
			client := &fakeCharacterClient{}

			w := testsupport.Do(newRouter(client, auth.AuthMiddleware()), op.method, op.path, op.body)

			testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
			assert.Equal(t, 0, client.calls)
		})
	}
}

// A member with no characters gets [], never null (the schema says non-null).
func TestListMyCharacters_NoCharactersIsAnEmptyArray(t *testing.T) {
	w := testsupport.Do(newRouter(&fakeCharacterClient{}, signedIn(uuid.New())), http.MethodGet, "/api/characters", "")

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"characters":[]}`, w.Body.String())
}
