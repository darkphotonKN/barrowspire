package httperr

import (
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/gin-gonic/gin"
)

// NotFoundHandler answers a request gin has no route for.
//
// Every other error in the gateway reaches the seam because a handler put it
// there. An unrouted path has no handler by definition, so gin answers it
// itself — with a bare `text/plain` 404 carrying no `code`. That left the one
// hole in FS-0001's claim that every 4xx/5xx is problem+json, and it sat on the
// single most common client mistake there is: a typo'd URL.
//
// Wire it with router.NoRoute(httperr.NotFoundHandler()).
//
// The status does not change — it was 404 before and is 404 now. Only the body
// and media type do.
func NotFoundHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		Write(c, "NoRoute", apperr.WithDetail(
			apperr.ErrNotFound,
			"No route matches this path.",
		))
	}
}
