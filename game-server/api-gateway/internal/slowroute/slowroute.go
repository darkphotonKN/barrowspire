// Package slowroute injects artificial latency into chosen gateway routes, so
// a load test can show a slow route lighting up the RED panels, its exemplars
// and its traces. Off unless DEBUG_SLOW_ROUTE is set.
package slowroute

import (
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Parse reads "route=duration[,route=duration...]", for example
// "/api/marketplace/listings=300ms". Routes are gin route templates, the same
// strings the RED metrics label by. Empty input means no slow routes.
func Parse(raw string) (map[string]time.Duration, error) {
	routes := map[string]time.Duration{}

	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}

		route, delay, ok := strings.Cut(entry, "=")
		if !ok || strings.TrimSpace(route) == "" {
			return nil, fmt.Errorf("slow route %q: want route=duration", entry)
		}

		d, err := time.ParseDuration(strings.TrimSpace(delay))
		if err != nil || d <= 0 {
			return nil, fmt.Errorf("slow route %q: want a positive duration like 300ms", entry)
		}

		routes[strings.TrimSpace(route)] = d
	}

	return routes, nil
}

// Middleware sleeps before the handler on every request whose matched route is
// in routes. The sleep honours the request context, so a client that gives up
// does not hold the goroutine.
func Middleware(routes map[string]time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		if d, ok := routes[c.FullPath()]; ok {
			select {
			case <-time.After(d):
			case <-c.Request.Context().Done():
			}
		}
		c.Next()
	}
}
