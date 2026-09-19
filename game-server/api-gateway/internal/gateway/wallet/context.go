package wallet

import "context"

// bearerKey is unexported so nothing outside this package can plant a token on
// a context; the only way in is WithBearer, from a handler that has already
// passed AuthMiddleware.
type bearerKey struct{}

// WithBearer carries the caller's raw Authorization header value down to the
// gRPC client, which forwards it to wallet-service as request metadata.
//
// Gin's own context is not the request context, so the header cannot simply be
// read again further down — it has to be threaded explicitly.
func WithBearer(ctx context.Context, authorizationHeader string) context.Context {
	if authorizationHeader == "" {
		return ctx
	}
	return context.WithValue(ctx, bearerKey{}, authorizationHeader)
}

// BearerFromCtx returns the forwarded Authorization header, if one was set.
func BearerFromCtx(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(bearerKey{}).(string)
	return token, ok && token != ""
}
