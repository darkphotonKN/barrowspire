package member_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// fakeRepo embeds the interface so any method this test does not stub panics
// loudly instead of silently returning a zero value.
type fakeRepo struct {
	member.Repository
	getMemberByEmail    func(ctx context.Context, email string) (*models.Member, error)
	getByIdWithPassword func(ctx context.Context, id uuid.UUID) (*models.Member, error)
	updatePassword      func(ctx context.Context, params member.MemberUpdatePasswordParams) error
	getById             func(ctx context.Context, id uuid.UUID) (*models.Member, error)
}

func (f fakeRepo) GetById(ctx context.Context, id uuid.UUID) (*models.Member, error) {
	return f.getById(ctx, id)
}

func (f fakeRepo) GetMemberByEmail(ctx context.Context, email string) (*models.Member, error) {
	return f.getMemberByEmail(ctx, email)
}

func (f fakeRepo) GetByIdWithPassword(ctx context.Context, id uuid.UUID) (*models.Member, error) {
	return f.getByIdWithPassword(ctx, id)
}

func (f fakeRepo) UpdatePassword(ctx context.Context, params member.MemberUpdatePasswordParams) error {
	return f.updatePassword(ctx, params)
}

func serviceWith(repo member.Repository) member.Service {
	return member.NewService(nil, repo, nil, nil, member.NewPasswordPolicy(testCommonList), nil, nil)
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

func refusalCode(t *testing.T, err error) errcode.Code {
	t.Helper()
	var refusal *errcode.Refusal
	require.ErrorAs(t, err, &refusal)
	return refusal.Code
}

// FS-V6SFK §Requirements 2, 7. A refused signup never reaches the database:
// the fake repo stubs nothing, so any repository call would panic.
func TestCreateMember_RefusesBeforeTouchingTheDatabase(t *testing.T) {
	tests := []struct {
		name     string
		email    string
		password string
		want     errcode.Code
	}{
		{"9-char password", "delver@barrowspire.test", "abcdefghi", errcode.PasswordTooShort},
		{"73-byte password", "delver@barrowspire.test", strings.Repeat("a", 73), errcode.PasswordTooLong},
		{"listed password in another case", "delver@barrowspire.test", "PASSWORD123", errcode.PasswordTooCommon},
		{"display-name email", "Name <a@b.c>", "abcdefghij", errcode.EmailInvalid},
		{"not an email", "not-an-email", "abcdefghij", errcode.EmailInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := serviceWith(fakeRepo{})

			_, err := svc.CreateMember(context.Background(), &pb.CreateMemberRequest{
				Name: "Delver", Email: tt.email, Password: tt.password,
			})

			assert.Equal(t, tt.want, refusalCode(t, err))
		})
	}
}

// FS-V6SFK §Requirements 3, user story 14. Login never applies the policy: a
// 6-character password set before it existed still signs in. The lookup uses
// the normalized email, so any casing of the address finds the member.
func TestLoginMember_OldShortPasswordAndAnyEmailCase_Succeeds(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	var lookedUp string
	svc := serviceWith(fakeRepo{
		getMemberByEmail: func(ctx context.Context, email string) (*models.Member, error) {
			lookedUp = email
			return memberWithPassword(t, "abc123"), nil
		},
	})

	res, err := svc.LoginMember(context.Background(), &pb.LoginRequest{
		Email: " FOO@example.com", Password: "abc123",
	})

	require.NoError(t, err)
	assert.NotEmpty(t, res.AccessToken)
	assert.Equal(t, "foo@example.com", lookedUp)
}

// FS-V6SFK §Requirements 2, 5. The existing checks (repeat matches, current
// password correct) run first; the policy then checks the new password, and a
// refused password is never stored.
func TestUpdateMemberPassword_Policy(t *testing.T) {
	const current = "old-pw"
	tests := []struct {
		name        string
		newPassword string
		repeat      string
		current     string
		want        errcode.Code // "" means a plain (non-refusal) error is expected
		wantStored  bool
	}{
		{"too short", "abcdefghi", "abcdefghi", current, errcode.PasswordTooShort, false},
		{"too long", strings.Repeat("a", 73), strings.Repeat("a", 73), current, errcode.PasswordTooLong, false},
		{"too common", "Qwertyuiop", "Qwertyuiop", current, errcode.PasswordTooCommon, false},
		{"mismatch is checked before the policy", "short", "other", current, "", false},
		{"wrong current is checked before the policy", "short", "short", "nope", "", false},
		{"compliant password is stored", "abcdefghij", "abcdefghij", current, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stored := false
			svc := serviceWith(fakeRepo{
				getByIdWithPassword: func(ctx context.Context, id uuid.UUID) (*models.Member, error) {
					return memberWithPassword(t, current), nil
				},
				updatePassword: func(ctx context.Context, params member.MemberUpdatePasswordParams) error {
					stored = true
					return bcrypt.CompareHashAndPassword([]byte(params.Password), []byte(tt.newPassword))
				},
			})

			_, err := svc.UpdateMemberPassword(context.Background(), &pb.UpdatePasswordRequest{
				Id: uuid.NewString(), CurrentPassword: tt.current,
				NewPassword: tt.newPassword, RepeatNewPassword: tt.repeat,
			})

			assert.Equal(t, tt.wantStored, stored)
			switch {
			case tt.wantStored:
				assert.NoError(t, err)
			case tt.want != "":
				assert.Equal(t, tt.want, refusalCode(t, err))
			default:
				require.Error(t, err)
				var refusal *errcode.Refusal
				assert.False(t, errors.As(err, &refusal), "the existing checks answer before the policy")
			}
		})
	}
}
