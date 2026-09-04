package auth_test

import (
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	gwauth "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// newTypedRouter mounts the SERIALIZED member surface — the same call
// config/routes.go and cmd/openapi both make — so these tests exercise the
// operation that actually ships, not a hand-mounted stand-in.
func newTypedRouter(client gwauth.AuthClient) *gin.Engine {
	r := gin.New()
	api := contract.New(r)
	h := gwauth.NewHandler(client)
	gwauth.RegisterOperations(
		api, h,
		contract.MemberID, contract.Protected(nil), contract.SeamError, contract.Secured,
	)
	return r
}

// FS-0007 §Requirements 1-2. Signup published a command and answered 202 before
// the member existed. It now calls CreateMember and answers only once the member
// is durably created, so a 201 is a statement about the database rather than
// about a queue.
func TestSignup_ValidBody_Returns201WithMember(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{member: &pb.Member{
		Id:    "11111111-1111-1111-1111-111111111111",
		Name:  "Delver",
		Email: "delver@barrowspire.test",
		Role:  "player",
	}})

	w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
		`{"name":"Delver","email":"delver@barrowspire.test","password":"hunter2"}`)

	require.Equal(t, http.StatusCreated, w.Code)

	body := testsupport.Decode(t, w)
	assert.EqualValues(t, http.StatusCreated, body["statusCode"])

	result, ok := body["result"].(map[string]any)
	require.True(t, ok, "response must carry the member under `result`")
	assert.Equal(t, "11111111-1111-1111-1111-111111111111", result["id"])
	assert.Equal(t, "delver@barrowspire.test", result["email"])
	assert.Equal(t, "player", result["role"])

	// Signup creates a member; signin mints tokens. Requirement 5.
	assert.NotContains(t, result, "access_token")
	assert.NotContains(t, body, "access_token")
}

// FS-0007 §Requirements 3, §Edge States. The 409 path is fully built —
// auth-service maps the unique-email violation to ErrDuplicateResource, the
// interceptor to codes.AlreadyExists, and httperr to 409 — but signup could
// never reach it while it answered before touching the database. The client has
// been branching on ALREADY_EXISTS for a code that never arrived.
func TestSignup_DuplicateEmail_Returns409(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{
		err: status.Error(codes.AlreadyExists, "email taken"),
	})

	w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
		`{"name":"Delver","email":"taken@barrowspire.test","password":"hunter2"}`)

	testsupport.AssertProblem(t, w, http.StatusConflict, string(errcode.AlreadyExists))
}

// FS-0007 §Edge States. Signup no longer touches the broker, so "downstream is
// down" is now auth-service being unreachable. It must stay 503: the request was
// valid and retrying is correct, and collapsing it into 500 tells the client to
// abandon a request that would succeed a moment later.
func TestSignup_AuthServiceUnavailable_Returns503(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{
		err: status.Error(codes.Unavailable, "no healthy upstream"),
	})

	w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
		`{"name":"Delver","email":"delver@barrowspire.test","password":"hunter2"}`)

	testsupport.AssertProblem(t, w, http.StatusServiceUnavailable, string(errcode.ServiceUnavailable))
}
