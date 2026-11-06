package gameserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// renew_token (FS-ZPX58 R27-R32, option A of its Follow-up 3).
//
// The token a member connects with is held on their record and forwarded to
// items-service whenever a world seats them (worn gear, run and field checkout,
// the pre-delve loadout check). It is an access token and lives 60 minutes, so
// on one long connection it expires under the member. The client renews it
// over REST and hands the new one over this message, and the record takes it.
//
// Until a service credential exists (I-GV8WN-11, the long-term fix), this is
// what keeps a long session's gear reads authorized.

// Refusals, word for word. A refusal keeps the old token and the connection.
const (
	renewTokenRefused = "The session could not be renewed on this connection."
	renewTokenTooSoon = "Too many token renewals. Try again shortly."
)

// renewTokenTimeout bounds the ValidateToken call; it runs off the loop.
const renewTokenTimeout = 3 * time.Second

// renewTokenInterval is how often one connection may have a renewal handled.
// The client renews at most about once an hour; anything faster is not it.
const renewTokenInterval = time.Second

var (
	errTokenRefused  = errors.New("token refused by auth-service")
	errTokenNotYours = errors.New("token names another member than the connection's")
)

/**
* RenewToken validates token with auth-service and, when it is a valid access
* token for the member this connection authenticated as at its handshake,
* swaps it onto every copy of that member's record (FS-ZPX58 R28, R29).
*
* The member is the connection's, never anything the message says: a valid
* token for someone else is refused. auth-service's ValidateToken accepts only
* access tokens (FS-ZPX58 R25), so a refresh token is refused there. Any
* refusal leaves the held token as it was.
*
* The swap holds the server's lock, the one tokenOf reads under, so a seat
* reading the token at the same moment gets the old one or the new one, whole.
**/
func (s *Server) RenewToken(ctx context.Context, conn *websocket.Conn, token string) error {
	player, ok := s.GetPlayerFromConn(conn)
	if !ok {
		return errPlayerNotFound
	}
	// the record's id never changes, so it is read without the lock
	memberID := player.ID

	if token == "" {
		return fmt.Errorf("%w: no token", errTokenRefused)
	}

	res, err := s.authClient.ValidateToken(ctx, &pb.ValidateTokenRequest{Token: token})
	if err != nil {
		return fmt.Errorf("%w: %w", errTokenRefused, err)
	}
	if !res.GetValid() {
		return errTokenRefused
	}
	subject, err := uuid.Parse(res.GetMemberId())
	if err != nil {
		return fmt.Errorf("%w: subject: %w", errTokenRefused, err)
	}
	if subject != memberID {
		return errTokenNotYours
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	base := player
	if stored, exists := s.players[memberID]; exists {
		base = stored
	}
	for _, record := range s.everyRecordOf(base) {
		record.Token = types.BearerToken(token)
	}
	return nil
}

// renewToken answers one renew_token off the loop: token_renewed, or a refusal
// on renew_token. Never a disconnect. The token is never logged.
func (h *messageHub) renewToken(clientPackage types.ClientPackage) {
	ctx, cancel := context.WithTimeout(context.Background(), renewTokenTimeout)
	defer cancel()

	token, _ := clientPackage.Message.Payload["token"].(string)
	if err := h.sessionManager.RenewToken(ctx, clientPackage.Conn, token); err != nil {
		slog.Warn("Refusing renew_token; the held token is kept", "error", err)
		h.refuse(clientPackage.Conn, clientPackage.Message.Action, renewTokenRefused)
		return
	}

	if err := h.sender.SendMessageToConn(clientPackage.Conn, types.Message{
		Action: string(constants.ActionTokenRenewed),
	}); err != nil {
		slog.Warn("Could not answer renew_token", "error", err)
	}
}

// renewLimiter lets one renewal per interval through per connection. It is
// used on the message hub's loop only, so it needs no lock of its own.
type renewLimiter struct {
	interval time.Duration
	last     map[*websocket.Conn]time.Time
}

func newRenewLimiter(interval time.Duration) *renewLimiter {
	return &renewLimiter{interval: interval, last: make(map[*websocket.Conn]time.Time)}
}

// allow reports whether conn may have a renewal handled at now, and if so
// records it. Entries older than the interval are dropped as it goes, so a
// closed connection does not stay in the map.
func (l *renewLimiter) allow(conn *websocket.Conn, now time.Time) bool {
	if last, seen := l.last[conn]; seen && now.Sub(last) < l.interval {
		return false
	}
	for c, at := range l.last {
		if now.Sub(at) >= l.interval {
			delete(l.last, c)
		}
	}
	l.last[conn] = now
	return true
}
