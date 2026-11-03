package member_test

import (
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/member"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-V6SFK §Requirements 6-7: trim and lowercase first, then the result must be
// a bare address net/mail parses back to itself, at most 254 bytes.
func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
		err   bool
	}{
		{"trimmed and lowercased", "  Foo@Example.COM ", "foo@example.com", false},
		{"already normal", "delver@barrowspire.test", "delver@barrowspire.test", false},
		// The trim set is ASCII whitespace exactly, the same set migration
		// 000012 trims in SQL, so Go and the migration normalize alike.
		{"every ASCII whitespace is trimmed", "\v\t Foo@x.test\f\r\n", "foo@x.test", false},
		// net/mail accepts UTF-8 in the local part, so these stay addresses;
		// what matters is that neither side strips them.
		{"a leading non-ASCII space is kept", "\u00a0Foo@x.test", "\u00a0foo@x.test", false},
		{"a trailing non-ASCII space is kept", " Foo@x.test\u2003", "foo@x.test\u2003", false},
		{"display-name form is refused", "Name <a@b.c>", "", true},
		{"no at sign is refused", "not-an-email", "", true},
		{"empty is refused", "   ", "", true},
		{"trailing comment is refused", "a@b.c (work)", "", true},
		{"254 bytes is accepted", atLength(254), atLength(254), false},
		{"255 bytes is refused", atLength(255), "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := member.NormalizeEmail(tt.input)
			if !tt.err {
				require.NoError(t, err)
				assert.Equal(t, tt.want, got)
				return
			}
			var refusal *errcode.Refusal
			require.ErrorAs(t, err, &refusal)
			assert.Equal(t, errcode.EmailInvalid, refusal.Code)
		})
	}
}

// atLength builds a valid address exactly n bytes long, padding the domain
// with labels so net/mail still parses it.
func atLength(n int) string {
	const local = "a@"
	const tld = ".test"
	middle := n - len(local) - len(tld)
	var labels []string
	for middle > 0 {
		size := min(middle, 60)
		if middle-size == 1 { // never leave a remainder only a dot could fill
			size--
		}
		labels = append(labels, strings.Repeat("b", size))
		middle -= size
		if middle > 0 {
			middle-- // the dot joining the next label
		}
	}
	address := local + strings.Join(labels, ".") + tld
	if len(address) != n {
		panic("atLength built the wrong length")
	}
	return address
}
