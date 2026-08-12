package interceptor

import (
	"context"
	"errors"
	"log/slog"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// sentinelCodes is the whole mapping, in one place, so a service cannot answer
// one code here and a different one there for the same failure.
//
// Order matters only in that errors.Is is checked per entry; the sentinels are
// mutually exclusive, so the iteration order does not change the outcome.
var sentinelCodes = []struct {
	sentinel error
	code     codes.Code
	message  string
}{
	{commonconstants.ErrUnauthorized, codes.Unauthenticated, "unauthenticated"},
	{commonconstants.ErrForbidden, codes.PermissionDenied, "forbidden"},
	{commonconstants.ErrNotFound, codes.NotFound, "not found"},
	{commonconstants.ErrDuplicateResource, codes.AlreadyExists, "already exists"},
	{commonconstants.ErrInvalidInput, codes.InvalidArgument, "invalid input"},
	{commonconstants.ErrConstraintViolation, codes.InvalidArgument, "invalid input"},
	{commonconstants.ErrUUIDCouldNotBeParsed, codes.InvalidArgument, "invalid input"},
	{commonconstants.ErrTransient, codes.Unavailable, "temporarily unavailable"},
}

// Status is the service-side counterpart of the gateway's error seam: one place
// where a domain error becomes a transport status.
//
// Without it a service returns bare Go errors, gRPC transmits them as
// codes.Unknown, and the gateway's seam maps anything unrecognised to 500. That
// is not a gateway bug — the information needed to answer 401 or 404 was thrown
// away one hop earlier. A wrong password answering "internal server error" is
// what this fixes.
//
// The message on the wire is a fixed string per code, never the wrapped error.
// The wrapped error names repos, operations and sometimes columns; it is logged
// here with the method that produced it and goes no further.
//
// A handler that already returned a gRPC status is left untouched: it made a
// more specific decision than this mapping can.
func Status(logger *slog.Logger) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		resp, err := handler(ctx, req)
		if err == nil {
			return resp, nil
		}

		// Already a status: the handler decided deliberately, so defer to it.
		if _, ok := status.FromError(err); ok && status.Code(err) != codes.Unknown {
			return resp, err
		}

		for _, entry := range sentinelCodes {
			if errors.Is(err, entry.sentinel) {
				logger.InfoContext(ctx, "request failed",
					"method", info.FullMethod,
					"code", entry.code.String(),
					"error", err,
				)
				return resp, status.Error(entry.code, entry.message)
			}
		}

		// Unrecognised: 500-equivalent, and worth an error-level log because
		// nobody classified it.
		logger.ErrorContext(ctx, "unclassified error",
			"method", info.FullMethod,
			"error", err,
		)
		return resp, status.Error(codes.Internal, "internal error")
	}
}
