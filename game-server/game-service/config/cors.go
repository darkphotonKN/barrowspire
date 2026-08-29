package config

import (
	"log/slog"
	"net"
	"net/url"
	"strings"

	commonhelpers "github.com/darkphotonKN/barrowspire-server/common/utils"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// defaultAllowedOrigins is the client's dev origin, used when GAME_ALLOWED_ORIGINS is unset.
const defaultAllowedOrigins = "http://localhost:3938"

/**
* Reads the explicit origin allowlist from the environment. Comma separated, so a
* deployment can name several client origins without a rebuild.
**/
func AllowedOrigins() []string {
	raw := commonhelpers.GetEnvString("GAME_ALLOWED_ORIGINS", defaultAllowedOrigins)

	origins := make([]string, 0, strings.Count(raw, ",")+1)
	for _, part := range strings.Split(raw, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	return origins
}

/**
* Reports whether origin may open a connection to the game service.
*
* The explicit allowlist always wins. Outside production any loopback origin is also
* accepted regardless of port: worktrees and side-by-side dev clients mint new ports
* constantly, and a port that is not on the list is rejected before WSAuthMiddleware
* ever runs — a bodyless 403 that reads like an auth failure but is not one.
**/
func originAllowed(environment string, allowed []string, origin string) bool {
	for _, candidate := range allowed {
		if candidate == origin {
			return true
		}
	}

	if environment == "production" {
		return false
	}

	return isLoopbackOrigin(origin)
}

func isLoopbackOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}

	host := parsed.Hostname()
	if host == "localhost" {
		return true
	}

	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

/**
* Builds the CORS middleware for the game service's client surface, including the
* headers the WebSocket handshake carries.
**/
func GameCORS(environment string, allowed []string) gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if originAllowed(environment, allowed, origin) {
				return true
			}

			slog.Warn("rejected cross-origin request",
				"origin", origin,
				"environment", environment,
				"allowed_origins", allowed,
			)

			return false
		},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization", "Upgrade", "Connection", "Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Extensions"},
		AllowCredentials: true,
	})
}
