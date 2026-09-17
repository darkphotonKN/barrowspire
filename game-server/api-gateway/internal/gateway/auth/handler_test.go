package auth_test

import (
	"context"
	"net/http"
	"testing"

	gwauth "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
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

// stubAuthClient returns a fixed error (or a fixed response) for every method.
// A gateway handler's job on a failure path is to translate, so the only thing
// worth varying per test is what came back from downstream.
type stubAuthClient struct {
	err error

	member         *pb.Member
	login          *pb.LoginResponse
	updatePassword *pb.UpdatePasswordResponse
	validateToken  *pb.ValidateTokenResponse
	requestAvatar  *pb.RequestAvatarUploadResponse
	confirmAvatar  *pb.ConfirmAvatarUploadResponse
}

func (s *stubAuthClient) CreateMember(context.Context, *pb.CreateMemberRequest) (*pb.Member, error) {
	return s.member, s.err
}

func (s *stubAuthClient) GetMember(context.Context, *pb.GetMemberRequest) (*pb.Member, error) {
	return s.member, s.err
}

func (s *stubAuthClient) LoginMember(context.Context, *pb.LoginRequest) (*pb.LoginResponse, error) {
	return s.login, s.err
}

func (s *stubAuthClient) UpdateMemberInfo(context.Context, *pb.UpdateMemberInfoRequest) (*pb.Member, error) {
	return s.member, s.err
}

func (s *stubAuthClient) UpdateMemberPassword(context.Context, *pb.UpdatePasswordRequest) (*pb.UpdatePasswordResponse, error) {
	return s.updatePassword, s.err
}

func (s *stubAuthClient) ValidateToken(context.Context, *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	return s.validateToken, s.err
}

func (s *stubAuthClient) RequestAvatarUpload(context.Context, *pb.RequestAvatarUploadRequest) (*pb.RequestAvatarUploadResponse, error) {
	return s.requestAvatar, s.err
}

func (s *stubAuthClient) ConfirmAvatarUpload(context.Context, *pb.ConfirmAvatarUploadRequest) (*pb.ConfirmAvatarUploadResponse, error) {
	return s.confirmAvatar, s.err
}

// newRouter mounts the public auth routes the way config/routes.go does. The
// member-scoped routes are typed operations now and read the caller from
// commonauth; see typed.go.
func newRouter(client gwauth.AuthClient) *gin.Engine {
	r := gin.New()
	h := gwauth.NewHandler(client)

	public := r.Group("/member")
	public.POST("/signup", h.CreateMemberHandler)
	public.POST("/signin", h.LoginMemberHandler)
	public.POST("/validate-token", h.ValidateTokenHandler)

	return r
}

// FS-22WKC §Requirements 4, 5, 7 — every downstream failure in this package now
// resolves through the one seam, in problem+json, with the code the client
// switches on.
//
// The nine handlers previously had nine DIFFERENT switches, each handling only a
// subset of gRPC codes and falling through to 500 for the rest. These cases are
// therefore also the record of which statuses change.
func TestAuthHandler_DownstreamFailures_ResolveThroughTheSeam(t *testing.T) {
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
			name: "signup rejected", method: http.MethodPost, path: "/member/signup", body: `{}`,
			clientErr:  status.Error(codes.InvalidArgument, "email is required"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "signup conflicts", method: http.MethodPost, path: "/member/signup", body: `{}`,
			clientErr:  status.Error(codes.AlreadyExists, "email taken"),
			wantStatus: http.StatusConflict, wantCode: errcode.AlreadyExists,
		},
		{
			// CHANGED: this switch had no NotFound case, so it returned 500.
			name: "signup with downstream not-found", method: http.MethodPost, path: "/member/signup", body: `{}`,
			clientErr:  status.Error(codes.NotFound, "no such tenant"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			name: "signin with bad credentials", method: http.MethodPost, path: "/member/signin", body: `{}`,
			clientErr:  status.Error(codes.Unauthenticated, "bad password"),
			wantStatus: http.StatusUnauthorized, wantCode: errcode.Unauthenticated,
		},
		{
			name: "signin for unknown member", method: http.MethodPost, path: "/member/signin", body: `{}`,
			clientErr:  status.Error(codes.NotFound, "no such member"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			name: "validate token rejected", method: http.MethodPost, path: "/member/validate-token", body: `{}`,
			clientErr:  status.Error(codes.Unauthenticated, "expired"),
			wantStatus: http.StatusUnauthorized, wantCode: errcode.Unauthenticated,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRouter(&stubAuthClient{err: tt.clientErr})

			w := testsupport.Do(r, tt.method, tt.path, tt.body)

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// FS-22WKC §Requirements 9 — every one of these handlers interpolated
// status.Message() straight into the response body.
func TestAuthHandler_DownstreamMessages_NeverReachTheClient(t *testing.T) {
	const leak = "pq: duplicate key value violates unique constraint members_email_key"

	r := newRouter(&stubAuthClient{err: status.Error(codes.AlreadyExists, leak)})

	w := testsupport.Do(r, http.MethodPost, "/member/signup", `{}`)

	assert.Equal(t, http.StatusConflict, w.Code)
	assert.NotContains(t, w.Body.String(), "members_email_key")
	assert.NotContains(t, w.Body.String(), "pq:")
}

// FS-22WKC §Requirements 9 — LoginMemberHandler was the worst of them: it
// formatted the raw bind error into the message with fmt.Sprintf.
func TestAuthHandler_Signin_DoesNotEchoTheBindError(t *testing.T) {
	r := newRouter(&stubAuthClient{})

	w := testsupport.Do(r, http.MethodPost, "/member/signin", `{"email":`)

	body := testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.ValidationFailed))
	assert.NotContains(t, w.Body.String(), "unexpected EOF")
	assert.NotContains(t, w.Body.String(), "json:")
	assert.NotEmpty(t, body["detail"])
}

// Malformed JSON is the gateway's own decision, so it keeps an authored detail
// rather than the status text — the client can tell it from a domain rejection.
func TestAuthHandler_MalformedBodies_Return400WithAuthoredDetail(t *testing.T) {
	for _, path := range []string{
		"/member/signup",
		"/member/validate-token",
	} {
		t.Run(path, func(t *testing.T) {
			r := newRouter(&stubAuthClient{})

			w := testsupport.Do(r, http.MethodPost, path, `{"broken":`)

			testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.ValidationFailed))
		})
	}
}
