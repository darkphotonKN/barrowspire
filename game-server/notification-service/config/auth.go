package config

import (
	"errors"
	"os"
	"strings"
)

// errNoJWTSecret: JWT_SECRET is unset or blank.
var errNoJWTSecret = errors.New("JWT_SECRET is not set: notification verifies every mailbox token with it and refuses to start without it")

// JWTSecret is the key that verifies the tokens the gateway forwards. An empty
// HMAC key verifies tokens signed with an empty key, so a pod started without
// it would accept a forged admin token: unset or blank is an error, and main
// stops at boot.
func JWTSecret() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	if strings.TrimSpace(secret) == "" {
		return nil, errNoJWTSecret
	}
	return []byte(secret), nil
}
