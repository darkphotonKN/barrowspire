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

var publicMethods = map[string]bool{
	"/grpc.health.v1.Health/Check": true,
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
