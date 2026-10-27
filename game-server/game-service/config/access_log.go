package config

import (
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/auth"
	"github.com/gin-gonic/gin"
)

/**
* AccessLogger is gin's access log, with the bearer token kept out of it.
*
* gin's default logger writes the raw query, and the client connects with
* /game/ws?token=<jwt>, so every connect would put a usable credential on
* stdout. This logs a line in gin's default layout (without its colours, so
* the spacing differs slightly) whose target is the raw path and query as the
* client sent them, with only the token's value replaced: every other parameter
* keeps its place and its encoding for debugging.
**/
func AccessLogger(out io.Writer) gin.HandlerFunc {
	return gin.LoggerWithConfig(gin.LoggerConfig{
		Output:    out,
		Formatter: accessLogLine,
		// hit every few seconds by the readiness probe; failures still show as readiness failures in kubectl describe pod
		SkipPaths: []string{"/api/health"},
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

// redactedTarget is the request's raw path and query with every token value
// replaced. Parameters are matched by their decoded name, as the server reads
// them, so an escaped name such as tok%65n is redacted too; one whose name
// cannot be decoded is redacted as well, rather than risk logging a credential.
func redactedTarget(u *url.URL) string {
	if u.RawQuery == "" {
		return u.Path
	}

	params := strings.Split(u.RawQuery, "&")
	for i, param := range params {
		rawName, _, hasValue := strings.Cut(param, "=")
		if !hasValue {
			continue
		}

		name, err := url.QueryUnescape(rawName)
		if err != nil || name == auth.TokenParam {
			params[i] = rawName + "=REDACTED"
		}
	}

	return u.Path + "?" + strings.Join(params, "&")
}
