package config

import (
	"fmt"
	"io"
	"net/url"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	"github.com/gin-gonic/gin"
)

/**
* AccessLogger is gin's access log, with the bearer token kept out of it.
*
* gin's default logger writes the raw query, and the client connects with
* /game/ws?token=<jwt>, so every connect would put a usable credential on
* stdout. This logs the same line with the token's value redacted; every other
* parameter is kept for debugging.
**/
func AccessLogger(out io.Writer) gin.HandlerFunc {
	return gin.LoggerWithConfig(gin.LoggerConfig{
		Output:    out,
		Formatter: accessLogLine,
	})
}

func accessLogLine(param gin.LogFormatterParams) string {
	if param.Latency > time.Minute {
		param.Latency = param.Latency.Truncate(time.Second)
	}

	return fmt.Sprintf("[GIN] %v | %3d | %13v | %15s | %-7s %#v\n%s",
		param.TimeStamp.Format("2006/01/02 - 15:04:05"),
		param.StatusCode,
		param.Latency,
		param.ClientIP,
		param.Method,
		redactedTarget(param.Request.URL),
		param.ErrorMessage,
	)
}

// redactedTarget is the request's path and query with the token's value hidden.
func redactedTarget(u *url.URL) string {
	if u.RawQuery == "" {
		return u.Path
	}

	query := u.Query()
	if query.Has(auth.TokenParam) {
		query.Set(auth.TokenParam, "REDACTED")
	}

	return u.Path + "?" + query.Encode()
}
