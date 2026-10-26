package config

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BDA7X §Requirements 36: the legacy gin POST /api/character/ is replaced by
// the typed character operations, and gin and Huma never both own a path.
//
// SetupRouter connects to nothing at construction (every client connects
// lazily), so the real router is built here against addresses nothing listens
// on, and no channel.
func TestSetupRouter_CharacterRoutesAreTypedOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	unused := "localhost:1"
	r, closeDownstreams, err := SetupRouter(Downstreams{
		Auth: unused, Stats: unused, Notification: unused, Payment: unused, Items: unused,
		Ledger: unused, Marketplace: unused, Wallet: unused, Character: unused,
	}, []string{"http://localhost:3938"}, nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = closeDownstreams() })

	owned := map[string]int{}
	for _, route := range r.Routes() {
		owned[route.Method+" "+route.Path]++
		assert.NotEqual(t, "/api/character/", route.Path, "legacy gin character route must be gone")
	}

	for _, want := range []string{
		http.MethodPost + " /api/characters",
		http.MethodGet + " /api/characters",
		http.MethodGet + " /api/characters/:characterId",
		http.MethodDelete + " /api/characters/:characterId",
	} {
		assert.Equal(t, 1, owned[want], "%s must be registered exactly once", want)
	}
}
