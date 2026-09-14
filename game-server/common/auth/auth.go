package auth

import (
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// NewValidator returns the token-validation func the gRPC auth interceptor needs.
// Keeping JWT parsing here means internal/interceptor stays pure metadata plumbing.
//
// It parses into Claims — the same struct auth-service mints with — so a claim
// the minter adds cannot silently go unread here.
func NewValidator(secret []byte) func(string) (Identity, error) {
	return func(tokenStr string) (Identity, error) {
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

		// FS-0003 §Requirement 29: every access token carries a role, so a token
		// without one is unauthorizable. This also refuses refresh tokens, which
		// are minted without a role.
		if claims.Role == "" {
			return Identity{}, errors.New("token carries no role")
		}

		return Identity{
			MemberID:  memberID,
			AccountID: claims.AccountID,
			Role:      Role(claims.Role),
		}, nil
	}
}
