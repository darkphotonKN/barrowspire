package auth

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// NewValidator returns the token-validation func the gRPC auth interceptor needs.
// Keeping JWT parsing here means internal/interceptor stays pure metadata plumbing.
func NewValidator(secret []byte) func(string) (uuid.UUID, error) {
	return func(tokenStr string) (uuid.UUID, error) {
		claims := jwt.RegisteredClaims{}
		_, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return secret, nil
		})
		if err != nil {
			return uuid.Nil, fmt.Errorf("parse token: %w", err)
		}
		return uuid.Parse(claims.Subject)
	}
}
