package game

import (
	"context"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"google.golang.org/grpc/metadata"
)

/**
* asMember makes an outgoing call act as the member: it carries their own
* bearer token, so the service called checks the member owns what is asked for.
*
* Only the loadout fetch uses it. Worn gear is the one member-owned thing a
* world reads; the catalogue (item templates and rarities) is no member's and
* goes out with no token at all.
*
* The token is the one held on the member's record, from their last connect.
* It is not renewed: a member who stays in the hub past its expiry is refused
* by items-service on their next seat and arrives without gear until they
* reconnect. With no token, nothing is attached, and items-service refuses the
* call the same way.
**/
func asMember(ctx context.Context, token types.BearerToken) context.Context {
	if token == "" {
		return ctx
	}
	return metadata.AppendToOutgoingContext(ctx, "authorization", "Bearer "+string(token))
}
