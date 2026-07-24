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

type memberIDKey struct{}

var publicMethods = map[string]bool{
	"/grpc.health.v1.Health/Check": true,
}

func Auth(validate func(token string) (uuid.UUID, error)) grpc.UnaryServerInterceptor {
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

		memberID, err := validate(token)
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, "invalid token")
		}

		// context.WithValue injects context into the flow
		return handler(context.WithValue(ctx, memberIDKey{}, memberID), req)
	}
}

// extract member id from context
// we use a struct here to prevent clashes from strings from other packages,
// incase an interceptor used something like "memberID"
func MemberIDFromCtx(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(memberIDKey{}).(uuid.UUID)
	return id, ok
}
