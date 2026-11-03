package member_test

import (
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testCommonList stands in for the embedded list: a few entries, one in mixed
// case and padded, to prove the list is normalized when loaded.
const testCommonList = "password123\n  Dragonslayer  \n\nqwertyuiop\n"

// FS-V6SFK §Requirements 1: at least 10 code points, at most 72 bytes, not on
// the list (any case). Checks run short, long, common; the first failure wins.
func TestPasswordPolicy_Check(t *testing.T) {
	policy := member.NewPasswordPolicy(testCommonList)

	tests := []struct {
		name     string
		password string
		want     errcode.Code // "" means accepted
	}{
		{"9 chars is too short", "abcdefghi", errcode.PasswordTooShort},
		{"empty is too short", "", errcode.PasswordTooShort},
		{"10 unlisted chars is accepted", "abcdefghij", ""},
		{"72 bytes is accepted", strings.Repeat("a", 72), ""},
		{"73 bytes is too long", strings.Repeat("a", 73), errcode.PasswordTooLong},
		// 10 code points but 30 bytes: length is counted in code points
		{"10 multibyte code points is accepted", strings.Repeat("界", 10), ""},
		{"9 multibyte code points is too short", strings.Repeat("界", 9), errcode.PasswordTooShort},
		// 25 code points, 75 bytes: under the char floor, over the byte ceiling
		{"25 multibyte code points over 72 bytes is too long", strings.Repeat("界", 25), errcode.PasswordTooLong},
		{"listed exactly is too common", "password123", errcode.PasswordTooCommon},
		{"listed in mixed case is too common", "PassWord123", errcode.PasswordTooCommon},
		{"list entry was trimmed and lowercased on load", "DRAGONSLAYER", errcode.PasswordTooCommon},
		// order: a 9-char listed password reports short, not common
		{"short wins over common", "qwertyuio", errcode.PasswordTooShort},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := policy.Check(tt.password)
			if tt.want == "" {
				assert.NoError(t, err)
				return
			}
			var refusal *errcode.Refusal
			require.ErrorAs(t, err, &refusal)
			assert.Equal(t, tt.want, refusal.Code)
		})
	}
}

// FS-V6SFK §Requirements 4: the embedded list is the real blocklist, at least
// the top 10,000 common passwords.
func TestEmbeddedPasswordPolicy_ListsAtLeast10000Passwords(t *testing.T) {
	policy := member.EmbeddedPasswordPolicy()

	assert.GreaterOrEqual(t, policy.Size(), 10000)
	var refusal *errcode.Refusal
	require.ErrorAs(t, policy.Check("PASSWORD123"), &refusal, "a staple of every common list")
	assert.Equal(t, errcode.PasswordTooCommon, refusal.Code)
}
