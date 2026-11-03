package member_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const verifySecret = "test-secret-for-verify"

// serviceOver is the member service over the harness's verifier and store.
func (h *verifyHarness) service() member.Service {
	return member.NewService(nil, fakeRepo{getById: func(ctx context.Context, id uuid.UUID) (*models.Member, error) {
		m := h.store.member
		return &m, nil
	}}, nil, nil, member.NewPasswordPolicy(testCommonList), nil, h.verifier)
}

func accessClaims(t *testing.T, token string) jwt.MapClaims {
	t.Helper()
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) {
		return []byte(verifySecret), nil
	})
	require.NoError(t, err)
	return claims
}

// FS-V6SFK §Requirements 17, 20, 21, §Acceptance Criteria: verifying with the
// right code answers a fresh pair whose access token carries
// email_verified: true, and the member says so too.
func TestVerifyEmail_RightCode_ReturnsAFreshVerifiedPair(t *testing.T) {
	t.Setenv("JWT_SECRET", verifySecret)
	h := newVerifyHarness()
	code := h.issue(t)

	res, err := h.service().VerifyEmail(context.Background(), &pb.VerifyEmailRequest{Id: h.id().String(), Code: code})

	require.NoError(t, err)
	assert.Equal(t, true, accessClaims(t, res.AccessToken)["email_verified"])
	_, onRefresh := accessClaims(t, res.RefreshToken)["email_verified"]
	assert.False(t, onRefresh, "refresh tokens stay claim-free")
	assert.NotZero(t, res.AccessExpiresIn)
	assert.NotZero(t, res.RefreshExpiresIn)
	require.NotNil(t, res.MemberInfo)
	assert.True(t, res.MemberInfo.EmailVerified)
	assert.Equal(t, h.id().String(), res.MemberInfo.Id)
}

// FS-V6SFK §Requirements 17 (amendment 4): already verified still mints a
// fresh pair, so a stale or double submit just works.
func TestVerifyEmail_AlreadyVerified_StillReturnsAFreshPair(t *testing.T) {
	t.Setenv("JWT_SECRET", verifySecret)
	h := newVerifyHarness()
	at := time.Now()
	h.store.member.EmailVerifiedAt = &at

	res, err := h.service().VerifyEmail(context.Background(), &pb.VerifyEmailRequest{Id: h.id().String(), Code: "999999"})

	require.NoError(t, err)
	assert.Equal(t, true, accessClaims(t, res.AccessToken)["email_verified"])
	assert.True(t, res.MemberInfo.EmailVerified)
}

// FS-V6SFK §Requirements 17: a refusal crosses the service untouched, so the
// gateway can pass its code through.
func TestVerifyEmail_WrongCode_IsTheRefusal(t *testing.T) {
	h := newVerifyHarness()
	code := h.issue(t)

	res, err := h.service().VerifyEmail(context.Background(), &pb.VerifyEmailRequest{Id: h.id().String(), Code: wrong(code)})

	assert.Nil(t, res)
	assert.Equal(t, errcode.VerificationCodeInvalid, refusalCode(t, err))
}

// FS-V6SFK §Requirements 18-19: resend and change email reach the verifier
// for the member the request names.
func TestResendAndChangeEmail_ThroughTheService(t *testing.T) {
	h := newVerifyHarness()
	svc := h.service()
	ctx := context.Background()

	_, err := svc.ResendVerification(ctx, &pb.ResendVerificationRequest{Id: h.id().String()})
	require.NoError(t, err)
	assert.Len(t, h.outbox.written, 1)

	h.clock.advance(time.Minute)
	got, err := svc.ChangeUnverifiedEmail(ctx, &pb.ChangeUnverifiedEmailRequest{Id: h.id().String(), Email: "New@Example.com"})
	require.NoError(t, err)
	assert.Equal(t, "new@example.com", got.Email)
	assert.False(t, got.EmailVerified)
	assert.Len(t, h.outbox.written, 2)
}

// A member id that is not a UUID never reaches storage.
func TestVerificationRPCs_BadMemberID(t *testing.T) {
	svc := newVerifyHarness().service()
	ctx := context.Background()

	_, err := svc.VerifyEmail(ctx, &pb.VerifyEmailRequest{Id: "nope", Code: "123456"})
	assert.Error(t, err)
	_, err = svc.ResendVerification(ctx, &pb.ResendVerificationRequest{Id: "nope"})
	assert.Error(t, err)
	_, err = svc.ChangeUnverifiedEmail(ctx, &pb.ChangeUnverifiedEmailRequest{Id: "nope", Email: "a@b.co"})
	assert.Error(t, err)
}

// FS-V6SFK §Requirements 20: GetMember exposes email_verified, false included.
func TestGetMember_ExposesEmailVerified(t *testing.T) {
	h := newVerifyHarness()
	svc := h.service()

	got, err := svc.GetMember(context.Background(), &pb.GetMemberRequest{Id: h.id().String()})
	require.NoError(t, err)
	assert.False(t, got.EmailVerified)

	at := time.Now()
	h.store.member.EmailVerifiedAt = &at
	got, err = svc.GetMember(context.Background(), &pb.GetMemberRequest{Id: h.id().String()})
	require.NoError(t, err)
	assert.True(t, got.EmailVerified)
}
