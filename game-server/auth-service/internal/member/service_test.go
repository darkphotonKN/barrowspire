package member_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// fakeRepo embeds the interface so any method this test does not stub panics
// loudly instead of silently returning a zero value.
type fakeRepo struct {
	member.Repository
	getMemberByEmail func(ctx context.Context, email string) (*models.Member, error)
}

func (f fakeRepo) GetMemberByEmail(ctx context.Context, email string) (*models.Member, error) {
	return f.getMemberByEmail(ctx, email)
}

func serviceWith(repo member.Repository) member.Service {
	return member.NewService(nil, repo, nil, nil, nil)
}

func memberWithPassword(t *testing.T, plaintext string) *models.Member {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.MinCost)
	require.NoError(t, err)
	return &models.Member{ID: uuid.New(), Email: "someone@example.com", Password: string(hash)}
}

// Login must not reveal whether an email is registered.
//
// The repo answers a missing row with ErrNotFound, and before this change the
// service propagated it — so the gRPC status interceptor mapped it to NotFound
// and the gateway answered 404, while a wrong password answered 401. That
// difference is a user-enumeration oracle: an attacker learns which emails have
// accounts by reading the status code.
func TestLoginMember_UnknownEmail_IsUnauthenticatedNotNotFound(t *testing.T) {
	svc := serviceWith(fakeRepo{
		getMemberByEmail: func(ctx context.Context, email string) (*models.Member, error) {
			return nil, fmt.Errorf("lookup failed: %w", commonconstants.ErrNotFound)
		},
	})

	_, err := svc.LoginMember(context.Background(), &pb.LoginRequest{
		Email: "nobody@example.com", Password: "whatever",
	})

	require.Error(t, err)
	assert.ErrorIs(t, err, commonconstants.ErrUnauthorized)
	assert.NotErrorIs(t, err, commonconstants.ErrNotFound,
		"a missing account must be indistinguishable from a wrong password")
}

func TestLoginMember_WrongPassword_IsUnauthorized(t *testing.T) {
	svc := serviceWith(fakeRepo{
		getMemberByEmail: func(ctx context.Context, email string) (*models.Member, error) {
			return memberWithPassword(t, "the-real-password"), nil
		},
	})

	_, err := svc.LoginMember(context.Background(), &pb.LoginRequest{
		Email: "someone@example.com", Password: "not-the-real-password",
	})

	require.Error(t, err)
	assert.ErrorIs(t, err, commonconstants.ErrUnauthorized)
}

// The two failure paths must be indistinguishable to a caller, which is the
// whole point — asserted directly rather than left implied by the two tests above.
func TestLoginMember_BothFailures_AreIndistinguishable(t *testing.T) {
	missing := serviceWith(fakeRepo{
		getMemberByEmail: func(ctx context.Context, email string) (*models.Member, error) {
			return nil, commonconstants.ErrNotFound
		},
	})
	wrongPassword := serviceWith(fakeRepo{
		getMemberByEmail: func(ctx context.Context, email string) (*models.Member, error) {
			return memberWithPassword(t, "correct"), nil
		},
	})

	_, errMissing := missing.LoginMember(context.Background(),
		&pb.LoginRequest{Email: "a@example.com", Password: "x"})
	_, errWrong := wrongPassword.LoginMember(context.Background(),
		&pb.LoginRequest{Email: "b@example.com", Password: "x"})

	require.Error(t, errMissing)
	require.Error(t, errWrong)
	assert.Equal(t, errMissing.Error(), errWrong.Error())
}
