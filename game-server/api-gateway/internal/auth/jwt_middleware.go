package auth

import (
	"fmt"
	"os"
	"strings"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// opAuthMiddleware names this middleware in the seam's server-side logs. Every rejection here
// is a 401 to the client, so the log line is the only place the four causes stay
// distinguishable for an operator.
const opAuthMiddleware = "AuthMiddleware"

/**
* Authenticates JWT from headers for any requests wrapped in this middleware.
*
* Works by simply returning a fucntion that takes a gin context, just like any
* traditional handler.
*
* Every rejection goes through httperr.Write (FS-22WKC §Requirements 11), which
* also aborts the chain — so there is no c.Abort() call here. The detail strings
* are authored constants describing failures this middleware decided itself;
* nothing from the token is ever echoed back.
**/
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// gets token from header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			httperr.Write(c, opAuthMiddleware, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Authorization token not provided"))
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// parse the token and validate its authenticity
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(os.Getenv("JWT_SECRET")), nil
		})

		if err != nil || !token.Valid {
			// err is wrapped, not discarded: it names the actual parse failure
			// (expired, bad signature, malformed) in the log while the client
			// sees only the authored detail.
			httperr.Write(c, opAuthMiddleware, apperr.WithDetail(
				fmt.Errorf("%w: %w", apperr.ErrUnauthenticated, err),
				"Invalid or expired token"))
			return
		}

		// extract userId
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["sub"] == nil {
			httperr.Write(c, opAuthMiddleware, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Invalid token claims"))
			return
		}

		// sub is attacker-influenced and need not be a string. A bare type
		// assertion here panics on a token carrying sub as a number, which is an
		// unauthenticated caller crashing a request; comma-ok routes it to the
		// same 401 as any other unusable claim.
		userIdStr, ok := claims["sub"].(string)
		if !ok {
			httperr.Write(c, opAuthMiddleware, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Invalid token claims"))
			return
		}

		// parse userId as UUID
		userId, err := uuid.Parse(userIdStr)
		if err != nil {
			httperr.Write(c, opAuthMiddleware, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Member ID was not correctly parsed as a uuid."))
			return
		}

		role, ok := claims["role"].(string)
		if !ok || role == "" {
			httperr.Write(c, opAuthMiddleware, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Invalid token claims"))
			return
		}

		// account_id is populated eventually (ADR-0014), so an ABSENT key is a
		// normal token and yields nil. A key that is present but not a uuid is a
		// broken token, and gets the same 401 as any other unusable claim.
		var accountID *uuid.UUID
		if raw, present := claims["account_id"]; present {
			s, _ := raw.(string)
			parsed, err := uuid.Parse(s)
			if err != nil {
				httperr.Write(c, opAuthMiddleware, apperr.WithDetail(apperr.ErrUnauthenticated,
					"Invalid token claims"))
				return
			}
			accountID = &parsed
		}

		// add member_id, account_id and role to context for calls downstream to extract
		ctx := commonauth.EmbedIdentity(c.Request.Context(), commonauth.Identity{
			MemberID:  userId,
			AccountID: accountID,
			Role:      commonauth.Role(role),
		})

		c.Request = c.Request.WithContext(ctx)

		// passdown the flow to next handler
		c.Next()
	}
}
