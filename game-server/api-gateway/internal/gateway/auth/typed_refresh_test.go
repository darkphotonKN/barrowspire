package auth_test

import (
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const refreshPath = "/api/member/refresh"

// FS-ZPX58 §Requirements 8, 10, §API surface: renewal is public and answers a
// bare RefreshResult. newTypedRouter's protect fails closed, so a 200 here is
// also the proof that the route runs no bearer check: the access token it
// replaces is typically expired.
func TestRefresh_Returns200WithABareRefreshResult(t *testing.T) {
	client := &stubAuthClient{refresh: &pb.RefreshAccessTokenResponse{
		AccessToken: "new-access", AccessExpiresIn: 3600,
		MemberInfo: &pb.Member{Id: "m-1", Email: "delver@barrowspire.test", Role: "player", EmailVerified: true},
	}}
	r := newTypedRouter(client)

	w := testsupport.Do(r, http.MethodPost, refreshPath, `{"refresh_token":"the-refresh-token"}`)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	body := testsupport.Decode(t, w)
	assert.Equal(t, "new-access", body["access_token"])
	assert.EqualValues(t, 3600, body["access_expires_in"])
	assert.NotContains(t, body, "refresh_token", "v1 does not rotate (ADR-0066)")
	assert.NotContains(t, body, "result", "no envelope")
	member, ok := body["member_info"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "m-1", member["id"])
	assert.Equal(t, true, member["email_verified"])

	require.NotNil(t, client.refreshReq)
	assert.Equal(t, "the-refresh-token", client.refreshReq.RefreshToken, "the token reaches auth untouched")
}

// FS-ZPX58 §Requirements 3, 11: every refusal auth decides is the one 401 ·
// UNAUTHENTICATED problem, whatever the cause.
func TestRefresh_Refused_Returns401Unauthenticated(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{err: status.Error(codes.Unauthenticated, "unauthenticated")})

	w := testsupport.Do(r, http.MethodPost, refreshPath, `{"refresh_token":"expired"}`)

	testsupport.AssertProblem(t, w, http.StatusUnauthorized, string(errcode.Unauthenticated))
}

// FS-ZPX58 §Requirements 9: the body's shape is checked at the edge; a bad one
// never reaches auth-service.
func TestRefresh_BodyShape_Returns422(t *testing.T) {
	for _, body := range []string{`{}`, `{"refresh_token":""}`, `{"refresh_token":"t","member_id":"x"}`} {
		t.Run(body, func(t *testing.T) {
			client := &stubAuthClient{}
			r := newTypedRouter(client)

			w := testsupport.Do(r, http.MethodPost, refreshPath, body)

			testsupport.AssertProblem(t, w, http.StatusUnprocessableEntity, string(errcode.ValidationFailed))
			assert.Nil(t, client.refreshReq, "a malformed body never reaches auth-service")
		})
	}
}

// FS-ZPX58 §Requirements 7, 11: auth being down is 503, never 401, so the
// client keeps the session rather than signing the player out.
func TestRefresh_AuthUnavailable_Returns503(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{err: status.Error(codes.Unavailable, "connection refused")})

	w := testsupport.Do(r, http.MethodPost, refreshPath, `{"refresh_token":"t"}`)

	testsupport.AssertProblem(t, w, http.StatusServiceUnavailable, string(errcode.ServiceUnavailable))
}

// A nil answer with a nil error is a downstream contract violation, not a 200
// with an empty token.
func TestRefresh_NoResult_Returns500(t *testing.T) {
	r := newTypedRouter(&stubAuthClient{})

	w := testsupport.Do(r, http.MethodPost, refreshPath, `{"refresh_token":"t"}`)

	testsupport.AssertProblem(t, w, http.StatusInternalServerError, string(errcode.Internal))
}
