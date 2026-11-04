package mailbox

import (
	"context"
	"errors"

	"google.golang.org/grpc/metadata"
)

// errNoToken: a claim step was called with no player token to forward. The
// auth interceptor makes every claim carry one, so this is a wiring bug.
var errNoToken = errors.New("no player token to forward")

// forwardToken puts the caller's forwarded authorization on the outgoing
// call. items and wallet read the member from it (D18), the same member the
// auth interceptor read from it for the claim's keys, so the keys and the
// stash and wallet they act on always belong to one member.
func forwardToken(ctx context.Context) (context.Context, error) {
	md, _ := metadata.FromIncomingContext(ctx)
	vals := md.Get("authorization")
	if len(vals) == 0 || vals[0] == "" {
		return nil, errNoToken
	}
	return metadata.AppendToOutgoingContext(ctx, "authorization", vals[0]), nil
}
