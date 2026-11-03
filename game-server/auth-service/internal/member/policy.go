package member

import (
	_ "embed"
	"strings"
	"unicode/utf8"

	"github.com/darkphotonKN/barrowspire-server/common/errcode"
)

const (
	// minPasswordChars is counted in Unicode code points, not bytes, so a
	// password in any script needs the same number of characters (ADR-0041).
	minPasswordChars = 10

	// maxPasswordBytes is bcrypt's input limit, a hashing fact rather than a
	// preference: bcrypt ignores everything past it, and x/crypto refuses
	// longer input outright (ADR-0041).
	maxPasswordBytes = 72
)

// commonPasswords is the blocklist, one password per line.
//
// Source: SecLists,
// Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt
// (https://github.com/danielmiessler/SecLists), MIT License, Copyright (c)
// 2018 Daniel Miessler. Filtered to unique (case-insensitive) printable
// entries of 10-72 bytes, 117,571 lines: the 10k-most-common list had only 51
// entries of 10 or more characters, so almost none of it could ever match a
// password the length rule lets through. Bundled rather than fetched: no
// network call and no third party at runtime (FS-V6SFK §Requirements 4).
//
//go:embed common_passwords.txt
var commonPasswords string

// passwordPolicy is the rule a password must meet when it is SET: at signup
// and at password change. Login never consults it, so a password chosen
// before the policy existed keeps working (ADR-0041).
type passwordPolicy struct {
	common map[string]struct{}
}

// NewPasswordPolicy builds the policy over a newline-separated blocklist.
// Entries are trimmed and lowercased once here, so Check compares in any case.
func NewPasswordPolicy(commonList string) *passwordPolicy {
	common := make(map[string]struct{})
	for _, line := range strings.Split(commonList, "\n") {
		if entry := strings.ToLower(strings.TrimSpace(line)); entry != "" {
			common[entry] = struct{}{}
		}
	}
	return &passwordPolicy{common: common}
}

// EmbeddedPasswordPolicy is the policy over the list bundled with the
// service. Build it once at startup.
func EmbeddedPasswordPolicy() *passwordPolicy {
	return NewPasswordPolicy(commonPasswords)
}

// Check refuses a password that breaks the policy. The checks run short,
// long, common, and the first failure is the one reported (FS-V6SFK
// §Requirements 1).
func (p *passwordPolicy) Check(password string) error {
	if utf8.RuneCountInString(password) < minPasswordChars {
		return errcode.Refuse(errcode.PasswordTooShort)
	}
	if len(password) > maxPasswordBytes {
		return errcode.Refuse(errcode.PasswordTooLong)
	}
	if _, listed := p.common[strings.ToLower(password)]; listed {
		return errcode.Refuse(errcode.PasswordTooCommon)
	}
	return nil
}

// Size is how many distinct passwords the blocklist holds.
func (p *passwordPolicy) Size() int {
	return len(p.common)
}
