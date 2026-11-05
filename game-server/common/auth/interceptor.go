package auth

import (
	"context"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// publicMethods skip the token check. Fully qualified, so an entry only ever
// matches the one service that declares that method.
//
// The wallet entries are not "public" in the sense the name suggests — they are
// methods with no user identity to check. Their caller is a service compensating
// for its own failed write, or a background reconciler with no request behind it at
// all, so there is no member token to forward and no member whose account the call
// belongs to. Both act on a bid id the caller already holds.
//
// What protects them today is the network: wallet's gRPC listener binds to
// localhost, so reaching them means already being inside the host. REMOVE THESE
// ENTRIES once Identity can express a service caller and services can present their
// own credential — that is the check these two actually want.
//
// items' ApplySettlement is the same kind of call: game-service settles a run's
// players with it the moment they resolve (FS-GV8WN R11), often after the player
// has left, so there is no member token to forward, and a settlement may carry
// several members. The same caveat applies, and harder: items-service's gRPC
// listener is not bound to localhost, and this method writes items for whichever
// members the event names. Remove it with the wallet entries once a service
// credential exists.
//
// items' reservation methods are the same kind of call too: marketplace's
// ReconcileWorker sweeps on a background ticker, and its item.reserved consumer
// confirms (and, when the listing cannot be created, releases) a reservation from
// a broker event; neither has a request behind it and so no member token
// (FS-04ZB6 Req 6). Every write is fenced on the item id and the listing id
// together. Cancel acts only while the reservation still waits for its listing
// (reserved_at set, the first 10-15 minutes of a listing); confirm also repeats on
// a confirmed one; release acts only on a confirmed one, which is every LISTED
// item behind an ACTIVE listing. Both ids are on the public Bazaar pages, though,
// and ListStaleReserved and ListConfirmedReservations hand out ids too, so until a
// service credential exists anyone inside the cluster could cancel a fresh
// listing, confirm an orphan so it is never cancelled, or release the item under
// an ACTIVE listing back to its seller. Remove these with the others once a
// service credential exists.
//
// items' ResolveItemSnapshots is a service call too: notification-service resolves
// a letter's item enclosures into snapshots when the letter is sent (FS-1GZGD R21),
// and a letter request from the broker has no member behind it, so there is no
// token to forward. It writes nothing and answers what GetItemSummaries already
// answers publicly (an item's facts, never its owner, status, location or
// listing), plus catalogue facts of templates, which ListItemTemplates already
// serves. So it exposes nothing new; it is listed with the service calls because a
// service credential is still the check it should have. Its sibling GrantItems is
// not here: a grant mints into the forwarded token's member's stash.
//
// items' GetItemSummaries is the opposite case: genuinely public, and meant to
// stay that way. It backs the Bazaar page a signed-out visitor browses (FS-8EGFA
// §Requirements 6, 10), so there is no token to ask for, and its item summaries
// carry no owner, no source and no price. It takes no caller and reads nothing by
// caller, so no check is being skipped. Not a stopgap: do not "fix" it with a
// service credential. The Bazaar's own listing reads are not here: they read an
// optional caller, so they live in optionalAuthMethods (ADR-0053).
//
// The item catalogue reads are public for the same reason: ListItemTemplates and
// ListItemRarities return base types and rarity weights — catalogue data, owned by
// no member. game-service reads them once per game session to seed its loot pool,
// with no player behind the call and so no token to forward. They take no caller
// and read nothing by caller. ListItemRarities is also served by the gateway as
// GET /api/items/rarities, which the gateway keeps behind sign-in itself, so
// being public here exposes nothing new. The player's worn gear is the opposite:
// GetLoadoutWithItems stays guarded, and game-service calls it with the player's
// own forwarded token so items-service still checks the caller owns that loadout.
//
// Every other marketplace and items method still needs a token, apart from the
// optional-auth reads below (auth_test pins that).
var publicMethods = map[string]bool{
	"/grpc.health.v1.Health/Check": true,

	"/wallet.WalletService/ReleaseHold":               true,
	"/wallet.WalletService/ListStaleReservedHolds":    true,
	"/items.ItemsService/ApplySettlement":             true,
	"/items.ItemsService/ListStaleReserved":           true,
	"/items.ItemsService/CancelReservation":           true,
	"/items.ItemsService/ConfirmReservation":          true,
	"/items.ItemsService/ReleaseConfirmedReservation": true,
	"/items.ItemsService/ListConfirmedReservations":   true,
	"/items.ItemsService/ResolveItemSnapshots":        true,

	"/items.ItemsService/GetItemSummaries":  true,
	"/items.ItemsService/ListItemTemplates": true,
	"/items.ItemsService/ListItemRarities":  true,
}

// optionalAuthMethods are genuinely public, like the reads above, but answer a
// fact about the viewer when one is signed in (ADR-0053): the Bazaar's browse
// and detail tell a seller which listings are their own (FS-GKHYD). A valid
// bearer embeds the identity exactly as for a protected method. Anything else
// (no token, a malformed header, an invalid or expired token) reaches the handler
// with no identity and is never Unauthenticated, so a stale token cannot break a
// public page. The handler must treat a missing identity as an anonymous viewer.
//
// Disjoint from publicMethods (interceptor_internal_test pins that): a method on
// both would be skipped and its caller never read.
var optionalAuthMethods = map[string]bool{
	"/marketplace.MarketplaceService/BrowseListings": true,
	"/marketplace.MarketplaceService/GetListing":     true,
}

func Auth(validate func(token string) (Identity, error)) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {

		if publicMethods[info.FullMethod] {
			return handler(ctx, req)
		}

		id, failure := authenticate(ctx, validate)
		if failure != nil {
			if optionalAuthMethods[info.FullMethod] {
				// anonymous viewer: the handler runs with no identity. A token
				// that was sent and dropped is logged, or a misconfigured secret
				// would silently sign out every viewer.
				if failure.presented {
					slog.DebugContext(ctx, "optional auth: serving anonymously",
						"method", info.FullMethod, "reason", failure.reason())
				}
				return handler(ctx, req)
			}
			return nil, status.Error(codes.Unauthenticated, failure.msg)
		}

		// member id, account id and role all ride the context into the handler
		return handler(EmbedIdentity(ctx, id), req)
	}
}

// authFailure is why a request carries no usable identity. msg is all an
// Unauthenticated answer says; cause, when validation ran, says why the token
// failed and is only ever logged. presented is whether an authorization was
// sent at all. Neither field holds any part of the token.
type authFailure struct {
	msg       string
	cause     error
	presented bool
}

func (f *authFailure) reason() string {
	if f.cause == nil {
		return f.msg
	}
	return f.msg + ": " + f.cause.Error()
}

// authenticate reads and validates the request's bearer token. Every failure is
// for the caller to answer as Unauthenticated or, on an optional-auth method,
// to treat as anonymous.
func authenticate(ctx context.Context, validate func(token string) (Identity, error)) (Identity, *authFailure) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return Identity{}, &authFailure{msg: "missing metadata"}
	}

	vals := md.Get("authorization")
	if len(vals) == 0 {
		return Identity{}, &authFailure{msg: "missing authorization"}
	}

	token, found := strings.CutPrefix(vals[0], "Bearer ")
	if !found {
		return Identity{}, &authFailure{msg: "malformed authorization", presented: true}
	}

	id, err := validate(token)
	if err != nil {
		return Identity{}, &authFailure{msg: "invalid token", cause: err, presented: true}
	}

	return id, nil
}

// MemberIDFromCtx is a shorthand for handlers that only need the member.
// It reads the same embedded Identity — there is one context key, not two.
func MemberIDFromCtx(ctx context.Context) (uuid.UUID, bool) {
	id, ok := IdentityFromCtx(ctx)
	return id.MemberID, ok
}
