package member

import (
	"net/mail"
	"strings"

	"github.com/darkphotonKN/barrowspire-server/common/errcode"
)

// maxEmailBytes is the longest address SMTP can carry in a forward path.
const maxEmailBytes = 254

// emailTrimSet is ASCII whitespace, exactly the set migration 000012 trims
// in SQL (E' \t\n\r\f\x0B'). strings.TrimSpace would also trim Unicode
// spaces, and then Go and the migration would normalize the same stored
// address differently.
const emailTrimSet = " \t\n\r\f\v"

// normalizedEmail is the only form of an email auth-service stores, compares
// or looks up: trimmed and lowercased, so Me@x.com and me@x.com are one
// address (FS-V6SFK §Requirements 6).
func normalizedEmail(email string) string {
	return strings.ToLower(strings.Trim(email, emailTrimSet))
}

// NormalizeEmail normalizes an email that is about to be stored and refuses
// it with EMAIL_INVALID unless it is a bare address: net/mail must parse it
// back to exactly itself (so "Name <a@b.c>" fails) and it must fit in 254
// bytes (FS-V6SFK §Requirements 7).
func NormalizeEmail(email string) (string, error) {
	normalized := normalizedEmail(email)
	if len(normalized) > maxEmailBytes {
		return "", errcode.Refuse(errcode.EmailInvalid)
	}
	parsed, err := mail.ParseAddress(normalized)
	if err != nil || parsed.Address != normalized {
		return "", errcode.Refuse(errcode.EmailInvalid)
	}
	return normalized, nil
}
