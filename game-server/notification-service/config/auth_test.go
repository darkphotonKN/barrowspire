package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// An empty HMAC key verifies tokens signed with an empty key, so a pod booted
// without the Secret would accept forged admin tokens. notification refuses
// to start without one.
func TestJWTSecret(t *testing.T) {
	for name, value := range map[string]string{"unset": "", "blank": "  \t"} {
		t.Run(name+" refuses to boot", func(t *testing.T) {
			t.Setenv("JWT_SECRET", value)
			_, err := JWTSecret()
			require.Error(t, err)
		})
	}

	t.Run("set is used as given", func(t *testing.T) {
		t.Setenv("JWT_SECRET", "the-gateway-signing-key")
		got, err := JWTSecret()
		require.NoError(t, err)
		assert.Equal(t, []byte("the-gateway-signing-key"), got)
	})
}
