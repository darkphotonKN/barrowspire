package auth

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	grpcauth "github.com/darkphotonKN/barrowspire-server/game-service/grpc/auth"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// TokenParam is the query parameter the client sends its bearer token in on the
// WebSocket connect: a browser WebSocket cannot set an Authorization header.
// Anything that logs a request URL must redact it.
const TokenParam = "token"

// TokenKey is the gin context key the validated bearer token is passed to the
// connection handler under. The token is kept so the game can load the member's
// worn gear as them; it is never logged.
const TokenKey = "token"

// Custom close code for auth errors (4000-4999 range is for application use)
const CloseCodeAuthError = 4001

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// rejectWebSocket upgrades the connection to WebSocket, sends an auth error message,
// then closes with custom close code 4001 so the client can identify auth failures.
func rejectWebSocket(c *gin.Context, reason string) {
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Printf("Failed to upgrade WebSocket for auth rejection: %v\n", err)
		c.Abort()
		return
	}
	defer conn.Close()

	// Send auth_error message so client knows the reason
	authErrMsg, _ := json.Marshal(map[string]interface{}{
		"action": "auth_error",
		"payload": map[string]string{
			"message": reason,
		},
	})
	conn.WriteMessage(websocket.TextMessage, authErrMsg)

	// Close with custom code 4001
	conn.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(CloseCodeAuthError, reason),
	)

	c.Abort()
}

func WSAuthMiddleware(authClient grpcauth.AuthClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		slog.Debug("incoming request to connect to game")
		token := c.Query(TokenParam)
		if token == "" {
			slog.Debug("token missing")
			rejectWebSocket(c, "missing token")
			return
		}

		resp, err := authClient.ValidateToken(c.Request.Context(), &pb.ValidateTokenRequest{
			Token: token,
		})
		if err != nil {
			slog.Debug("failed to validate token")
			rejectWebSocket(c, "failed to validate token")
			return
		}

		if !resp.Valid {
			slog.Debug("invalid or expired token")
			rejectWebSocket(c, "invalid or expired token")
			return
		}

		userID, err := uuid.Parse(resp.MemberId)
		if err != nil {
			slog.Debug("invalid member id")
			rejectWebSocket(c, "invalid member id")
			return
		}

		// store in context
		c.Set("userId", userID)
		c.Set("userIdStr", resp.MemberId)
		c.Set(TokenKey, token)

		slog.Debug("stored userId in gin context")

		c.Next()
	}
}
