package listing

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"google.golang.org/grpc/metadata"
)

// Serialized marketplace operations. The legacy gin CreateListingHandler in
// handler.go predates the contract layer; everything added since is typed here
// (ADR-0002 §5).

// ErrorFunc converts a handler's returned error into one the transport renders
// through the seam. Injected rather than imported so this package stays free of
// internal/contract.
type ErrorFunc func(error) error

// securedOp marks an operation as requiring the bearer scheme the contract
// package declares. Set by RegisterOperations.
var securedOp []map[string][]string

// toStatusError is set once by RegisterOperations. It is applied by guard to
// EVERY handler, so no individual return path can forget it.
var toStatusError ErrorFunc = func(err error) error { return err }

func RegisterOperations(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
	errFor ErrorFunc, secured []map[string][]string,
) {
	toStatusError = errFor
	securedOp = secured

	registerPlaceBid(api, h, protect)
}

// guard wraps a typed handler so its error goes through the seam.
func guard[I, O any](fn func(context.Context, *I) (*O, error)) func(context.Context, *I) (*O, error) {
	return func(ctx context.Context, in *I) (*O, error) {
		out, err := fn(ctx, in)
		if err != nil {
			return nil, toStatusError(err)
		}
		return out, nil
	}
}

// withBearer forwards the caller's Authorization header to marketplace, whose
// own interceptor re-validates it and reads the bidder from it. The gateway's
// middleware has already validated the same token by this point.
func withBearer(ctx context.Context, authorization string) context.Context {
	if authorization == "" {
		return ctx
	}
	return metadata.AppendToOutgoingContext(ctx, "authorization", authorization)
}

func registerPlaceBid(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		ListingID string `path:"listing_id" format:"uuid"`

		// Minted by the client once per bid and resent unchanged on every retry
		// of it. Optional, matching marketplace: without one a retry is simply
		// not recognised as a replay.
		IdempotencyKey string `header:"Idempotency-Key" format:"uuid" doc:"Client-generated per bid and reused on every retry of it, so a retried bid is recognised instead of placed twice. Optional."`

		// Read only to forward downstream. Hidden because the bearer scheme on
		// the operation already documents it; listing it twice would be noise.
		Authorization string `header:"Authorization" hidden:"true"`

		Body PlaceBidBody
	}

	type output struct{}

	huma.Register(api, huma.Operation{
		OperationID:   "place-bid",
		Description:   "Places a bid on an active listing as the signed-in member. The bidder is taken from the token, never the request.",
		DefaultStatus: http.StatusCreated,
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPost,
		Path:        "/api/marketplace/listings/{listing_id}/bids",
		Summary:     "Place a bid on a listing",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		_, err := h.client.PlaceBid(withBearer(ctx, in.Authorization), &pb.PlaceBidRequest{
			ListingId:      in.ListingID,
			Amount:         in.Body.Amount,
			IdempotencyKey: in.IdempotencyKey,
		})
		if err != nil {
			return nil, err
		}

		return &output{}, nil
	}))
}
