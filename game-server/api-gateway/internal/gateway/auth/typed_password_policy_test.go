package auth_test

import (
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	gwauth "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/auth"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// FS-V6SFK §API surface. auth-service owns the password policy and the email
// rules; the gateway only carries its refusal through as 400 plus the code
// (ADR-0001 §6), and never restates the rule itself.
func TestSignup_DomainRefusal_PassesThroughAs400(t *testing.T) {
	refusals := []errcode.Code{
		errcode.PasswordTooShort, errcode.PasswordTooLong, errcode.PasswordTooCommon, errcode.EmailInvalid,
	}
	for _, code := range refusals {
		t.Run(string(code), func(t *testing.T) {
			r := newTypedRouter(&stubAuthClient{err: errcode.Refuse(code)})

			w := testsupport.Do(r, http.MethodPost, "/api/member/signup",
				`{"name":"Delver","email":"delver@barrowspire.test","password":"hunter2"}`)

			testsupport.AssertProblem(t, w, http.StatusBadRequest, string(code))
		})
	}
}

// newSignedInRouter mounts the member surface with a caller already embedded,
// so a protected operation reaches its handler.
func newSignedInRouter(client gwauth.AuthClient) *gin.Engine {
	r := gin.New()
	embed := func(c *gin.Context) {
		c.Request = c.Request.WithContext(commonauth.EmbedIdentity(c.Request.Context(),
			commonauth.Identity{MemberID: uuid.New(), Role: commonauth.RolePlayer}))
	}
	gwauth.RegisterOperations(contract.New(r), gwauth.NewHandler(client),
		contract.Protected(embed), contract.SeamError, contract.Secured)
	return r
}

// FS-V6SFK §API surface: update-password carries the same three password
// refusals for the new password.
func TestUpdatePassword_PolicyRefusal_PassesThroughAs400(t *testing.T) {
	refusals := []errcode.Code{errcode.PasswordTooShort, errcode.PasswordTooLong, errcode.PasswordTooCommon}
	for _, code := range refusals {
		t.Run(string(code), func(t *testing.T) {
			r := newSignedInRouter(&stubAuthClient{err: errcode.Refuse(code)})

			w := testsupport.Do(r, http.MethodPatch, "/api/member/update-password",
				`{"current_password":"old","new_password":"x","repeat_new_password":"x"}`)

			testsupport.AssertProblem(t, w, http.StatusBadRequest, string(code))
		})
	}
}

// FS-V6SFK §API surface: signup now declares 400 among its errors, so the
// generated contract tells the client a refusal can arrive.
func TestSignup_Declares400(t *testing.T) {
	r := gin.New()
	api := contract.New(r)
	gwauth.RegisterOperations(api, gwauth.NewHandler(nil),
		contract.Protected(nil), contract.SeamError, contract.Secured)

	op := api.OpenAPI().Paths["/api/member/signup"].Post
	if op == nil {
		t.Fatal("signup is not registered")
	}
	if _, ok := op.Responses["400"]; !ok {
		t.Errorf("signup responses %v do not declare 400", keys(op.Responses))
	}
}

func keys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
