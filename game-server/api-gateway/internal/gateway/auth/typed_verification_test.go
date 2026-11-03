package auth_test

import (
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/auth"
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

// verificationOps are the three FS-V6SFK §API surface member-email routes,
// each with a body that passes the shape check.
var verificationOps = []struct {
	name, method, path, body string
}{
	{"verify", http.MethodPost, "/api/member/email/verify", `{"code":"123456"}`},
	{"resend", http.MethodPost, "/api/member/email/resend", ``},
	{"change", http.MethodPut, "/api/member/email", `{"email":"new@barrowspire.test"}`},
}

// FS-V6SFK §API surface, §Requirements 17: verify answers the LoginResult
// bare, the same type as signin's result, and the member it carries says it
// is verified.
func TestVerifyEmail_Returns200WithABareLoginResult(t *testing.T) {
	client := &stubAuthClient{login: &pb.LoginResponse{
		AccessToken: "access", RefreshToken: "refresh", AccessExpiresIn: 3600, RefreshExpiresIn: 604800,
		MemberInfo: &pb.Member{Id: "m-1", Email: "delver@barrowspire.test", EmailVerified: true},
	}}
	r := newSignedInRouter(client)

	w := testsupport.Do(r, http.MethodPost, "/api/member/email/verify", `{"code":"012345"}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	body := testsupport.Decode(t, w)
	assert.Equal(t, "access", body["access_token"])
	assert.Equal(t, "refresh", body["refresh_token"])
	assert.NotContains(t, body, "result", "no envelope")
	member, ok := body["member_info"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, true, member["email_verified"])

	// identity from the token, never the body
	require.NotNil(t, client.verifyReq)
	assert.NotEmpty(t, client.verifyReq.Id)
	assert.Equal(t, "012345", client.verifyReq.Code)
}

// FS-V6SFK §API surface: the code is exactly 6 digits, checked at the edge as
// shape (422), never reaching auth-service.
func TestVerifyEmail_CodeShape_Returns422(t *testing.T) {
	for _, body := range []string{`{}`, `{"code":"12345"}`, `{"code":"1234567"}`, `{"code":"12a456"}`, `{"code":"123456","id":"x"}`} {
		t.Run(body, func(t *testing.T) {
			client := &stubAuthClient{}
			r := newSignedInRouter(client)

			w := testsupport.Do(r, http.MethodPost, "/api/member/email/verify", body)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Nil(t, client.verifyReq, "a malformed code never reaches auth-service")
		})
	}
}

// FS-V6SFK §API surface: resend answers 204 with no body.
func TestResendVerification_Returns204(t *testing.T) {
	client := &stubAuthClient{}
	r := newSignedInRouter(client)

	w := testsupport.Do(r, http.MethodPost, "/api/member/email/resend", "")

	assert.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
	assert.Empty(t, w.Body.String())
	require.NotNil(t, client.resendReq)
	assert.NotEmpty(t, client.resendReq.Id)
}

// FS-V6SFK §API surface, §Requirements 19: change email answers the updated
// member bare.
func TestChangeEmail_Returns200WithTheBareMember(t *testing.T) {
	client := &stubAuthClient{member: &pb.Member{Id: "m-1", Email: "new@barrowspire.test"}}
	r := newSignedInRouter(client)

	w := testsupport.Do(r, http.MethodPut, "/api/member/email", `{"email":"New@Barrowspire.test"}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	body := testsupport.Decode(t, w)
	assert.Equal(t, "new@barrowspire.test", body["email"])
	assert.Equal(t, false, body["email_verified"], "false is on the wire, not omitted")
	assert.NotContains(t, body, "result", "no envelope")
	require.NotNil(t, client.changeReq)
	assert.NotEmpty(t, client.changeReq.Id)
	assert.Equal(t, "New@Barrowspire.test", client.changeReq.Email, "auth normalizes, not the edge")
}

// FS-V6SFK §API surface: change email requires the email.
func TestChangeEmail_MissingEmail_Returns422(t *testing.T) {
	r := newSignedInRouter(&stubAuthClient{})

	w := testsupport.Do(r, http.MethodPut, "/api/member/email", `{}`)

	testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
}

// FS-V6SFK §API surface: every refusal auth-service decides passes through as
// 400 plus its code, on each route that declares it.
func TestVerificationRoutes_DomainRefusal_PassesThroughAs400(t *testing.T) {
	cases := map[string][]errcode.Code{
		"verify": {errcode.VerificationCodeInvalid, errcode.VerificationCodeExpired},
		"resend": {errcode.VerificationResendTooSoon, errcode.EmailAlreadyVerified},
		"change": {errcode.EmailInvalid, errcode.EmailAlreadyVerified, errcode.VerificationResendTooSoon},
	}
	for _, op := range verificationOps {
		for _, code := range cases[op.name] {
			t.Run(op.name+"/"+string(code), func(t *testing.T) {
				r := newSignedInRouter(&stubAuthClient{err: errcode.Refuse(code)})

				w := testsupport.Do(r, op.method, op.path, op.body)

				testsupport.AssertProblem(t, w, http.StatusBadRequest, string(code))
			})
		}
	}
}

// FS-V6SFK §API surface, §Edge States (Concurrent): an address another member
// holds answers 409.
func TestChangeEmail_Taken_Returns409(t *testing.T) {
	r := newSignedInRouter(&stubAuthClient{err: status.Error(codes.AlreadyExists, "taken")})

	w := testsupport.Do(r, http.MethodPut, "/api/member/email", `{"email":"taken@barrowspire.test"}`)

	testsupport.AssertProblem(t, w, http.StatusConflict, string(errcode.AlreadyExists))
}

// FS-V6SFK §Edge States (Unauthorized): the three routes are protected, so no
// token answers 401 through the real middleware and auth-service is never
// called.
func TestVerificationRoutes_NoToken_Returns401(t *testing.T) {
	for _, op := range verificationOps {
		t.Run(op.name, func(t *testing.T) {
			client := &stubAuthClient{}
			r := gin.New()
			gwauth.RegisterOperations(contract.New(r), gwauth.NewHandler(client),
				contract.Protected(auth.AuthMiddleware()), contract.SeamError, contract.Secured)

			w := testsupport.Do(r, op.method, op.path, op.body)

			testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
			assert.Nil(t, client.verifyReq)
			assert.Nil(t, client.resendReq)
			assert.Nil(t, client.changeReq)
		})
	}
}

// FS-V6SFK §Requirements 20, §API surface: get-member and signin carry
// email_verified, and false serializes rather than being omitted.
func TestEmailVerified_OnGetMemberAndSignin(t *testing.T) {
	t.Run("get-member", func(t *testing.T) {
		r := newSignedInRouter(&stubAuthClient{member: &pb.Member{Id: "m-1"}})

		w := testsupport.Do(r, http.MethodGet, "/api/member", "")

		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		result, ok := testsupport.Decode(t, w)["result"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, false, result["email_verified"])
	})

	t.Run("signin", func(t *testing.T) {
		r := newTypedRouter(&stubAuthClient{login: &pb.LoginResponse{
			AccessToken: "a", MemberInfo: &pb.Member{Id: "m-1", EmailVerified: true},
		}})

		w := testsupport.Do(r, http.MethodPost, "/api/member/signin", `{"email":"a@b.co","password":"x"}`)

		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		result := testsupport.Decode(t, w)["result"].(map[string]any)
		member := result["member_info"].(map[string]any)
		assert.Equal(t, true, member["email_verified"])
	})
}
