package auth

import (
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/darkphotonKN/barrowspire-server/auth-service/internal/models"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

/**
* Generates and signs a JWT token with claims of either the "access" or "refresh" types.
**/
func GenerateJWT(user models.Member, tokenType commonconstants.TokenType, expiration time.Duration) (string, error) {
	JWTSecret, err := jwtSecret()
	if err != nil {
		return "", err
	}

	now := time.Now()

	claims := commonauth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID.String(),
			ExpiresAt: jwt.NewNumericDate(now.Add(expiration)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
		TokenType: string(tokenType),
	}

	// Authorization claims ride the ACCESS token only. A refresh token is a
	// credential for re-minting, not for authorization: keeping role and
	// account off it forces any future redemption endpoint to re-read the
	// member rather than copying a week-old copy forward.
	if tokenType == commonconstants.Access {
		// Verbatim. The minter does not validate, normalise, or default the
		// role — a value outside {player, admin} is minted as-is and the
		// boundary decides what to do with it.
		claims.Role = user.Role

		// Nil omits the key entirely rather than emitting "". The member may
		// simply not have a wallet account yet; consumers fail closed on an
		// absent claim, and an empty string is not absent.
		claims.AccountID = user.AccountID

		// Read off the member row at mint time, so it is as fresh as the
		// mint: a token minted before verification stays unverified until
		// verify hands back a fresh pair or the member logs in again.
		claims.EmailVerified = user.EmailVerifiedAt != nil
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(JWTSecret)
}

// errNoSecret: JWT_SECRET is unset or blank. Nothing is minted or accepted
// then, rather than every token being signed and checked with the empty key
// (FS-ZPX58 L7).
var errNoSecret = errors.New("JWT_SECRET is not set")

func jwtSecret() ([]byte, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, errNoSecret
	}
	return []byte(secret), nil
}

// AccessTokenTTL and RefreshTokenTTL are the platform's two token lifetimes
// (ADR-0066 §1). Sign-in, verification and renewal all mint from these; there
// is no third lifetime.
const (
	AccessTokenTTL  = 60 * time.Minute
	RefreshTokenTTL = 7 * 24 * time.Hour
)

// ParseRefreshToken answers the member a refresh token names, or an error when
// it is not redeemable (FS-ZPX58 §Requirements 2): it must be HS256 with the
// platform secret, carry an expiry that has not passed, be typed refresh, and
// name the member by UUID. The error says which check failed, for the log only;
// the caller turns every one of them into the same refusal.
func ParseRefreshToken(tokenString string) (uuid.UUID, error) {
	secret, err := jwtSecret()
	if err != nil {
		return uuid.Nil, err
	}

	var claims commonauth.Claims
	_, err = jwt.ParseWithClaims(tokenString, &claims, func(*jwt.Token) (any, error) {
		return secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse refresh token: %w", err)
	}

	if claims.TokenType != string(commonconstants.Refresh) {
		return uuid.Nil, fmt.Errorf("token type %q is not refresh", claims.TokenType)
	}

	memberID, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse refresh token sub: %w", err)
	}

	return memberID, nil
}

// ValidateJWT validates an ACCESS token and returns its subject as the
// claims' ID. A refresh token, or a token with no type, is refused: the
// ValidateToken RPC behind it is how game-service admits a socket, and a 7-day
// refresh token must not open one (FS-ZPX58 L1). Every token auth-service mints
// is typed, so this refuses nothing it ever handed out as access.
func ValidateJWT(tokenString string) (jwt.RegisteredClaims, error) {
	JWTSecret, err := jwtSecret()
	if err != nil {
		return jwt.RegisteredClaims{}, err
	}

	var claims commonauth.Claims
	token, err := jwt.ParseWithClaims(tokenString, &claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return JWTSecret, nil
	})
	if err != nil {
		return jwt.RegisteredClaims{}, err
	}

	if !token.Valid {
		return jwt.RegisteredClaims{}, errors.New("invalid token")
	}

	if claims.TokenType != string(commonconstants.Access) {
		return jwt.RegisteredClaims{}, fmt.Errorf("token type %q is not access", claims.TokenType)
	}

	return jwt.RegisteredClaims{
		ID: claims.Subject,
	}, nil
}
