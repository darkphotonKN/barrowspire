package auth

import (
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

/**
* Authenticates JWT from headers for any requests wrapped in this middleware.
*
* Works by simply returning a fucntion that takes a gin context, just like any
* traditional handler.
**/
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// gets token from header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization token not provided"})
			c.Abort()
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// parse the token and validate its authenticity
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(os.Getenv("JWT_SECRET")), nil
		})

		if err != nil || !token.Valid {
			slog.Debug("Invalid or expired token.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// extract userId
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["sub"] == nil {
			slog.Debug("Invalid token claim.")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		userIdStr := claims["sub"].(string)

		// parse userId as UUID
		userId, err := uuid.Parse(userIdStr)
		if err != nil {
			slog.Debug("Member ID was not correctly parsed as a uuid.")
			c.JSON(http.StatusUnauthorized, gin.H{"statusCode": http.StatusUnauthorized, "error": "Member ID was not correctly parsed as a uuid."})
			c.Abort()
			return
		}

		slog.Debug("Authorization of token passed. Setting userId and userIdStr")

		// store userId in the context for usage in the actual API handlers
		c.Set("userId", userId)

		// store string version for cleaner transfer to external microservices via grpc
		c.Set("userIdStr", userIdStr)

		// passdown the flow to next handler
		c.Next()
	}
}
