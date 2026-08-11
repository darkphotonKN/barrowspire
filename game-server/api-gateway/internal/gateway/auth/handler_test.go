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
	checkEmail     *pb.CheckEmailResponse
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

func (s *stubAuthClient) CheckEmailExists(context.Context, *pb.CheckEmailRequest) (*pb.CheckEmailResponse, error) {
	return s.checkEmail, s.err
}

// newRouter mounts the auth routes the way config/routes.go does. The identity
// middleware is stubbed rather than real: these tests are about error
// translation, and I-0002 already covers the JWT paths.
func newRouter(client gwauth.AuthClient, identity string) *gin.Engine {
	r := gin.New()
	h := gwauth.NewHandler(client)

	public := r.Group("/member")
	public.POST("/signup", h.CreateMemberHandler)
	public.POST("/signin", h.LoginMemberHandler)
	public.GET("/check-email", h.CheckEmailExistsHandler)
	public.POST("/validate-token", h.ValidateTokenHandler)

	private := r.Group("/member")
	private.Use(func(c *gin.Context) {
		if identity != "" {
			c.Set("userIdStr", identity)
		}
		c.Next()
	})
	private.GET("", h.GetMemberByIdHandler)
	private.PATCH("/update-password", h.UpdatePasswordMemberHandler)
	private.PATCH("/update-info", h.UpdateInfoMemberHandler)
	private.POST("/avatar/upload-request", h.RequestAvatarUploadHandler)
	private.POST("/avatar/confirm", h.ConfirmAvatarUploadHandler)

	return r
}

const testIdentity = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

// FS-0001 §Requirements 4, 5, 7 — every downstream failure in this package now
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
			// CHANGED: CheckEmailExists had NO switch at all — every failure was 500.
			name: "check-email rejected", method: http.MethodGet, path: "/member/check-email?email=a@b.c",
			clientErr:  status.Error(codes.InvalidArgument, "malformed email"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			// CHANGED: was 500 for the same reason.
			name: "check-email while downstream is down", method: http.MethodGet, path: "/member/check-email?email=a@b.c",
			clientErr:  status.Error(codes.Unavailable, "dial tcp 10.0.0.7:50051: connect: connection refused"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
		{
			name: "get member not found", method: http.MethodGet, path: "/member",
			clientErr:  status.Error(codes.NotFound, "no such member"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			// CHANGED: GetMember's switch had no PermissionDenied case.
			name: "get member forbidden", method: http.MethodGet, path: "/member",
			clientErr:  status.Error(codes.PermissionDenied, "not your member"),
			wantStatus: http.StatusForbidden, wantCode: errcode.Forbidden,
		},
		{
			name: "update password unauthorized", method: http.MethodPatch, path: "/member/update-password", body: `{}`,
			clientErr:  status.Error(codes.Unauthenticated, "wrong current password"),
			wantStatus: http.StatusUnauthorized, wantCode: errcode.Unauthenticated,
		},
		{
			name: "update info rejected", method: http.MethodPatch, path: "/member/update-info", body: `{}`,
			clientErr:  status.Error(codes.InvalidArgument, "display name too long"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "validate token rejected", method: http.MethodPost, path: "/member/validate-token", body: `{}`,
			clientErr:  status.Error(codes.Unauthenticated, "expired"),
			wantStatus: http.StatusUnauthorized, wantCode: errcode.Unauthenticated,
		},
		{
			// PRESERVED: this handler already mapped Unavailable to 503 by hand.
			// FS-0001 §Requirements 5 was amended so the migration keeps it.
			name: "avatar upload while downstream is down", method: http.MethodPost, path: "/member/avatar/upload-request", body: `{"filename":"a.png"}`,
			clientErr:  status.Error(codes.Unavailable, "storage unreachable"),
			wantStatus: http.StatusServiceUnavailable, wantCode: errcode.ServiceUnavailable,
		},
		{
			name: "avatar confirm not found", method: http.MethodPost, path: "/member/avatar/confirm", body: `{"upload_id":"u1"}`,
			clientErr:  status.Error(codes.NotFound, "no such upload"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newRouter(&stubAuthClient{err: tt.clientErr}, testIdentity)

			w := testsupport.Do(r, tt.method, tt.path, tt.body)

			testsupport.AssertProblem(t, w, tt.wantStatus, string(tt.wantCode))
		})
	}
}

// FS-0001 §Requirements 9 — every one of these handlers interpolated
// status.Message() straight into the response body.
func TestAuthHandler_DownstreamMessages_NeverReachTheClient(t *testing.T) {
	const leak = "pq: duplicate key value violates unique constraint members_email_key"

	r := newRouter(&stubAuthClient{err: status.Error(codes.AlreadyExists, leak)}, testIdentity)

	w := testsupport.Do(r, http.MethodPost, "/member/signup", `{}`)

	assert.Equal(t, http.StatusConflict, w.Code)
	assert.NotContains(t, w.Body.String(), "members_email_key")
	assert.NotContains(t, w.Body.String(), "pq:")
}

// FS-0001 §Requirements 9 — LoginMemberHandler was the worst of them: it
// formatted the raw bind error into the message with fmt.Sprintf.
func TestAuthHandler_Signin_DoesNotEchoTheBindError(t *testing.T) {
	r := newRouter(&stubAuthClient{}, testIdentity)

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
		"/member/update-password",
		"/member/update-info",
		"/member/validate-token",
	} {
		t.Run(path, func(t *testing.T) {
			r := newRouter(&stubAuthClient{}, testIdentity)

			w := testsupport.Do(r, http.MethodPost, path, `{"broken":`)

			// PATCH routes reject POST with 404 before the handler runs; retry
			// with the right verb rather than asserting on a routing artifact.
			if w.Code == http.StatusNotFound {
				w = testsupport.Do(r, http.MethodPatch, path, `{"broken":`)
			}

			testsupport.AssertProblem(t, w, http.StatusBadRequest, string(errcode.ValidationFailed))
		})
	}
}

// FS-0001 §Requirements 11 — the identity these handlers read is set by the JWT
// middleware. Its absence means the middleware did not run, which is a wiring
// fault rather than a caller mistake; the status stays 401 as it is today
// (§Requirements 12), but it now carries a code.
func TestAuthHandler_MissingIdentity_Returns401(t *testing.T) {
	r := newRouter(&stubAuthClient{}, "")

	w := testsupport.Do(r, http.MethodGet, "/member", "")

	testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
}

// FS-0001 §Requirements 12 — success responses are untouched by this feature.
func TestAuthHandler_SuccessResponses_AreUnchanged(t *testing.T) {
	client := &stubAuthClient{
		member:     &pb.Member{Id: testIdentity},
		checkEmail: &pb.CheckEmailResponse{Exists: true},
	}

	t.Run("check email", func(t *testing.T) {
		w := testsupport.Do(newRouter(client, testIdentity), http.MethodGet, "/member/check-email?email=a@b.c", "")

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

		body := testsupport.Decode(t, w)
		assert.Equal(t, float64(http.StatusOK), body["statusCode"])
		assert.Equal(t, true, body["exists"])
	})

	t.Run("get member", func(t *testing.T) {
		w := testsupport.Do(newRouter(client, testIdentity), http.MethodGet, "/member", "")

		assert.Equal(t, http.StatusOK, w.Code)

		body := testsupport.Decode(t, w)
		assert.Equal(t, float64(http.StatusOK), body["statusCode"])
		assert.Equal(t, "Successfully retrieved member", body["message"])
		assert.Contains(t, body, "result")
	})
}
