package auth

import (
	"context"
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
// The marketplace reads below are the opposite case: genuinely public, and meant
// to stay that way. They back the Bazaar page a signed-out visitor browses
// (FS-8EGFA §Requirements 6, 10), so there is no token to ask for, and they reveal
// nothing that belongs to a member — auctions everyone is meant to see, and
// item summaries that carry no owner, no source and no price. They take no caller
// and read nothing by caller, so no check is being skipped. Not a stopgap: do not
// "fix" these with a service credential. Every other marketplace and items method
// still needs a token (auth_test pins that).
var publicMethods = map[string]bool{
	"/grpc.health.v1.Health/Check": true,

	"/wallet.WalletService/ReleaseHold":            true,
	"/wallet.WalletService/ListStaleReservedHolds": true,

	"/marketplace.MarketplaceService/BrowseListings": true,
	"/marketplace.MarketplaceService/GetListing":     true,
	"/items.ItemsService/GetItemSummaries":           true,
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

		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		vals := md.Get("authorization")
		if len(vals) == 0 {
			return nil, status.Error(codes.Unauthenticated, "missing authorization")
		}

		token, found := strings.CutPrefix(vals[0], "Bearer ")
		if !found {
			return nil, status.Error(codes.Unauthenticated, "malformed authorization")
		}

		id, err := validate(token)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, "invalid token")
		}

		// member id, account id and role all ride the context into the handler
		return handler(EmbedIdentity(ctx, id), req)
	}
}

// MemberIDFromCtx is a shorthand for handlers that only need the member.
// It reads the same embedded Identity — there is one context key, not two.
func MemberIDFromCtx(ctx context.Context) (uuid.UUID, bool) {
	id, ok := IdentityFromCtx(ctx)
	return id.MemberID, ok
}
