package config

import (
	"net/http"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// buildRouter builds the real router. SetupRouter connects to nothing at
// construction (every client connects lazily), so it is built against
// addresses nothing listens on, and no channel.
func buildRouter(t *testing.T, features Features) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	unused := "localhost:1"
	r, closeDownstreams, err := SetupRouter(Downstreams{
		Auth: unused, Stats: unused, Notification: unused, Payment: unused, Items: unused,
		Ledger: unused, Marketplace: unused, Wallet: unused, Character: unused,
	}, []string{"http://localhost:3938"}, nil, features)
	require.NoError(t, err)
	t.Cleanup(func() { _ = closeDownstreams() })
	return r
}

// POST /api/wallet/deposit mints gold with no counterparty (ADR-0006), so it is
// a dev-seed convenience only: registered when DevEndpoints is on, absent
// otherwise, so production answers it with the plain unrouted 404.
func TestSetupRouter_WalletDepositOnlyWithDevEndpoints(t *testing.T) {
	const deposit = http.MethodPost + " /api/wallet/deposit"

	for _, tc := range []struct {
		name         string
		devEndpoints bool
		want         int
	}{
		{name: "off by default", devEndpoints: false, want: 0},
		{name: "on for dev", devEndpoints: true, want: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := buildRouter(t, Features{DevEndpoints: tc.devEndpoints})

			owned := 0
			for _, route := range r.Routes() {
				if route.Method+" "+route.Path == deposit {
					owned++
				}
			}
			assert.Equal(t, tc.want, owned)
		})
	}
}

// FS-BDA7X §Requirements 36: the legacy gin POST /api/character/ is replaced by
// the typed character operations, and gin and Huma never both own a path.
func TestSetupRouter_CharacterRoutesAreTypedOnly(t *testing.T) {
	r := buildRouter(t, Features{})

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

// FS-50MTX §API surface: the loadout routes sit under the character routes and
// share their wildcard (gin panics on a differing name at one position, so
// building the router at all is half of this). The old paths are gone with no
// shim, so with no token they 404 rather than answer the protected 401.
func TestSetupRouter_LoadoutRoutesMoveUnderTheCharacter(t *testing.T) {
	r := buildRouter(t, Features{})

	owned := map[string]int{}
	for _, route := range r.Routes() {
		owned[route.Method+" "+route.Path]++
	}
	assert.Equal(t, 1, owned[http.MethodGet+" /api/characters/:characterId/loadout"])
	assert.Equal(t, 1, owned[http.MethodPut+" /api/characters/:characterId/loadout"])

	for _, method := range []string{http.MethodGet, http.MethodPut} {
		w := testsupport.Do(r, method, "/api/items/loadout", "")

		testsupport.AssertProblem(t, w, http.StatusNotFound, string(errcode.NotFound))
	}
}

// FS-TVCZQ §Requirements 11, §API surface: nothing mints S3 upload URLs through
// the gateway any more, so both old paths fall through to the no-route handler.
// A registered route would answer 401 here first, because neither request
// carries a token.
func TestSetupRouter_AvatarPaths_AnswerNotFound(t *testing.T) {
	gin.SetMode(gin.TestMode)
	unused := "localhost:1"
	r, closeDownstreams, err := SetupRouter(Downstreams{
		Auth: unused, Stats: unused, Notification: unused, Payment: unused, Items: unused,
		Ledger: unused, Marketplace: unused, Wallet: unused, Character: unused,
	}, []string{"http://localhost:3938"}, nil, Features{})
	require.NoError(t, err)
	t.Cleanup(func() { _ = closeDownstreams() })

	for _, path := range []string{"/api/member/avatar/upload-request", "/api/member/avatar/confirm"} {
		t.Run(path, func(t *testing.T) {
			w := testsupport.Do(r, http.MethodPost, path, `{}`)

			testsupport.AssertProblem(t, w, http.StatusNotFound, string(errcode.NotFound))
		})
	}
}
