package httperr

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"runtime/debug"
	"strings"

	"github.com/gin-gonic/gin"
)

// Recovery converts a panic into a problem+json 500.
//
// It replaces gin.Default()'s stock Recovery, which writes a 500 with an EMPTY
// BODY — meaning panics were the one failure class that bypassed the error
// contract entirely, handing the client a status and nothing to switch on.
//
// Mount it first. Middleware registered before it panics outside its scope, and
// a panic in CORS or tracing produces the same empty 500 this exists to remove.
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			r := recover()
			if r == nil {
				return
			}

			// A broken pipe means the client is already gone: there is nobody to
			// write a response to, and it is not our failure. gin's own Recovery
			// makes the same distinction; losing it would turn every cancelled
			// download into a 500-level page.
			if isBrokenPipe(r) {
				slog.Warn("connection closed by client", "path", c.Request.URL.Path, "error", r)
				c.Abort()
				return
			}

			// Stack goes to the log and nowhere else. A panic value names
			// internals by construction — nil handles, table names, DSNs — so the
			// client gets the generic catch-all detail.
			slog.Error("panic recovered",
				"op", "Recovery",
				"path", c.Request.URL.Path,
				"method", c.Request.Method,
				"panic", r,
				"stack", string(debug.Stack()),
			)

			Write(c, "Recovery", fmt.Errorf("panic: %v", r))
		}()

		c.Next()
	}
}

// isBrokenPipe reports whether a recovered value is the client having hung up
// rather than a genuine fault.
func isBrokenPipe(r any) bool {
	err, ok := r.(error)
	if !ok {
		return false
	}

	var ne *net.OpError
	if !errors.As(err, &ne) {
		return false
	}

	var se *os.SyscallError
	if !errors.As(ne, &se) {
		return false
	}

	msg := strings.ToLower(se.Error())
	return strings.Contains(msg, "broken pipe") || strings.Contains(msg, "connection reset by peer")
}
