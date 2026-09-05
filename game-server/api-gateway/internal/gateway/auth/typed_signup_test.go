package auth_test

import (
	"context"
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

// FS-0007 §Requirements 1-2, §API surface. Signup published a command and
// answered 202 before the member existed. It now calls CreateMember and answers
// only once the member is durably created, so a 201 is a statement about the
// database rather than about a queue.
//
// The body is the member itself, NOT an envelope: FS-0007 §API surface declares
// the response as the member's own fields, and signup is the first operation on
// this surface to shed the statusCode/message wrapper.
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
	assert.Equal(t, "11111111-1111-1111-1111-111111111111", body["id"])
	assert.Equal(t, "delver@barrowspire.test", body["email"])
	assert.Equal(t, "player", body["role"])

	// The envelope is gone: these would be present if the member were nested.
	assert.NotContains(t, body, "statusCode")
	assert.NotContains(t, body, "result")

	// Signup creates a member; signin mints tokens. Requirement 5.
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

// FS-0007 §Edge States: auth-service down answers 503, never 500.
//
// This case covers the RPC failing on an established connection.
// TestSignup_AuthServiceNotDiscoverable_Returns503 covers the other, likelier
// half — and the two are NOT interchangeable, which is the whole reason both
// exist. See that test.
func TestSignup_AuthServiceRPCUnavailable_Returns503(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{
		err: status.Error(codes.Unavailable, "no healthy upstream"),
	})

	w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
		`{"name":"Delver","email":"delver@barrowspire.test","password":"hunter2"}`)

	testsupport.AssertProblem(t, w, http.StatusServiceUnavailable, string(errcode.ServiceUnavailable))
}

// emptyRegistry discovers no instances, which is exactly what Consul reports
// once auth-service deregisters — the ordinary way the service is "down".
type emptyRegistry struct{}

func (emptyRegistry) Register(context.Context, string, string, string) error { return nil }
func (emptyRegistry) Deregister(context.Context, string, string) error       { return nil }
func (emptyRegistry) HealthCheck(string, string) error                       { return nil }
func (emptyRegistry) Discover(context.Context, string) ([]string, error) {
	return nil, nil
}

// FS-0007 §Edge States, through the REAL client rather than a stub.
//
// This is the case a stubbed AuthClient structurally cannot reach. When
// auth-service has deregistered, the failure happens in ensureConn ->
// discovery.ServiceConnection, which returns a plain error carrying no gRPC
// status. Nothing in httperr's errors.Is chain matches a bare error, so without
// an explicit ErrUnavailable marker the seam answers 500 — telling the client to
// abandon a request that would have succeeded once the service came back.
//
// Injecting codes.Unavailable into a stub cannot catch that regression: it skips
// ensureConn entirely and only re-proves the gRPC status mapping.
func TestSignup_AuthServiceNotDiscoverable_Returns503(t *testing.T) {
	r := newTypedRouter(gwauth.NewClient(emptyRegistry{}))

	w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
		`{"name":"Delver","email":"delver@barrowspire.test","password":"hunter2"}`)

	testsupport.AssertProblem(t, w, http.StatusServiceUnavailable, string(errcode.ServiceUnavailable))
}

// A nil member alongside a nil error is a downstream contract violation. The
// response body is a value type, so an unguarded dereference would panic the
// request rather than fail it.
func TestSignup_DownstreamReturnsNoMember_Returns500(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{member: nil, err: nil})

	w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
		`{"name":"Delver","email":"delver@barrowspire.test","password":"hunter2"}`)

	testsupport.AssertProblem(t, w, http.StatusInternalServerError, string(errcode.Internal))
}

// FS-0007 §Requirements 4, §API surface. The 422 is the boundary's, not
// auth-service's: plane-1 request validation is strict (docs/agents/contract.md),
// so an unknown member is rejected at the edge and never reaches the RPC.
func TestSignup_MalformedBody_Returns422(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{member: &pb.Member{Id: "unused"}})

	w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
		`{"name":"Delver","email":"delver@barrowspire.test","password":"hunter2","nope":1}`)

	testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
}

// FS-0007 §Requirements 11, §API surface. check-email existed for one reason:
// signup answered 202 without creating the account, so the client polled this
// endpoint to learn when it appeared. I-0041 made signup synchronous and the
// poll went with it, leaving an endpoint whose only caller and whose stated
// purpose are both gone.
//
// Asserted through the mounted router rather than by grepping the source: a
// route can survive a deleted handler if a stale registration is left behind,
// and that is exactly the residue this check is for.
func TestCheckEmail_IsRemovedFromTheSurface(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{})

	w := testsupport.Do(r, http.MethodGet, "/api/member/check-email?email=a@b.c", "")

	assert.Equal(t, http.StatusNotFound, w.Code,
		"check-email must not be routable once FS-0007 removes it")
}
