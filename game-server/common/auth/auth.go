package auth

import (
	"errors"
	"fmt"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// NewValidator returns the token-validation func the gRPC auth interceptor needs.
// Keeping JWT parsing here means internal/interceptor stays pure metadata plumbing.
//
// It parses into Claims, the same struct auth-service mints with, so a claim
// the minter adds cannot silently go unread here.
func NewValidator(secret []byte) func(string) (Identity, error) {
	return func(tokenStr string) (Identity, error) {
		// An empty secret would accept a token signed with the empty key, so
		// it accepts nothing (FS-ZPX58 L7).
		if len(secret) == 0 {
			return Identity{}, errors.New("no token secret configured")
		}

		var claims Claims
		_, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (any, error) {
			// TODO: READ UP
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return secret, nil
		})
		if err != nil {
			// also covers an account_id present but not a uuid: Claims.AccountID
			// is a *uuid.UUID, so decoding it fails the parse.
			return Identity{}, fmt.Errorf("parse token: %w", err)
		}

		memberID, err := uuid.Parse(claims.Subject)
		if err != nil {
			return Identity{}, fmt.Errorf("parse sub: %w", err)
		}

		// Only an access token is a credential here (FS-ZPX58 L1). Every token
		// auth-service mints is typed, so this refuses nothing it handed out as
		// access, and a refresh token is refused even if it carried a role.
		if claims.TokenType != string(commonconstants.Access) {
			return Identity{}, fmt.Errorf("token type %q is not access", claims.TokenType)
		}

		// FS-F9R7Q §Requirement 29: every access token carries a role, so a token
		// without one is unauthorizable. This also refuses refresh tokens, which
		// are minted without a role.
		if claims.Role == "" {
			return Identity{}, errors.New("token carries no role")
		}

		return Identity{
			MemberID:      memberID,
			AccountID:     claims.AccountID,
			Role:          Role(claims.Role),
			EmailVerified: claims.EmailVerified,
		}, nil
	}
}
