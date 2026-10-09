package config

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// FS-BDA7X §Requirements 36: the legacy gin POST /api/character/ is replaced by
// the typed character operations, and gin and Huma never both own a path.
//
// SetupRouter dials nothing at construction (every client connects lazily), so
// the real router is built here with no registry and no channel.
func TestSetupRouter_CharacterRoutesAreTypedOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := SetupRouter(nil, nil)

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
