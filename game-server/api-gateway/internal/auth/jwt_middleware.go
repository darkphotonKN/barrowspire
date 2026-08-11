package auth

import (
	"os"
	"strings"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// op names this middleware in the seam's server-side logs. Every rejection here
// is a 401 to the client, so the log line is the only place the four causes stay
// distinguishable for an operator.
const op = "AuthMiddleware"

/**
* Authenticates JWT from headers for any requests wrapped in this middleware.
*
* Works by simply returning a fucntion that takes a gin context, just like any
* traditional handler.
*
* Every rejection goes through httperr.Write (FS-0001 §Requirements 11), which
* also aborts the chain — so there is no c.Abort() call here. The detail strings
* are authored constants describing failures this middleware decided itself;
* nothing from the token is ever echoed back.
**/
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// gets token from header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated,
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
			httperr.Write(c, op, apperr.WithDetail(errUnauthenticated(err),
				"Invalid or expired token"))
			return
		}

		// extract userId
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["sub"] == nil {
			httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Invalid token claims"))
			return
		}

		// sub is attacker-influenced and need not be a string. A bare type
		// assertion here panics on a token carrying sub as a number, which is an
		// unauthenticated caller crashing a request; comma-ok routes it to the
		// same 401 as any other unusable claim.
		userIdStr, ok := claims["sub"].(string)
		if !ok {
			httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Invalid token claims"))
			return
		}

		// parse userId as UUID
		userId, err := uuid.Parse(userIdStr)
		if err != nil {
			httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated,
				"Member ID was not correctly parsed as a uuid."))
			return
		}

		// store userId in the context for usage in the actual API handlers
		c.Set("userId", userId)

		// store string version for cleaner transfer to external microservices via grpc
		c.Set("userIdStr", userIdStr)

		// passdown the flow to next handler
		c.Next()
	}
}

// errUnauthenticated keeps the underlying parse failure in the error chain for
// logging while still matching apperr.ErrUnauthenticated for the status mapping.
func errUnauthenticated(cause error) error {
	if cause == nil {
		return apperr.ErrUnauthenticated
	}
	return &authFailure{cause: cause}
}

type authFailure struct{ cause error }

func (a *authFailure) Error() string { return "unauthenticated: " + a.cause.Error() }

// Is reports a match against apperr.ErrUnauthenticated so the seam maps this to
// 401 while Unwrap keeps the real cause reachable for logs and tests.
func (a *authFailure) Is(target error) bool { return target == apperr.ErrUnauthenticated }

func (a *authFailure) Unwrap() error { return a.cause }
