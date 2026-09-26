package listing

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Serialized marketplace operations. Every marketplace route is typed here
// (ADR-0002 §5); none remains on gin.

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

	registerCreateListing(api, h, protect)
	registerPlaceBid(api, h, protect)
	registerWithdrawBid(api, h, protect)
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

func registerCreateListing(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		// Read only to forward downstream. Hidden because the bearer scheme on
		// the operation already documents it.
		Authorization string `header:"Authorization" hidden:"true"`

		Body CreateListingBody
	}

	type output struct{}

	huma.Register(api, huma.Operation{
		OperationID: "create-listing",
		Description: "Lists an item from the signed-in member's stash for auction. The listing is not " +
			"created by this request: marketplace reserves the item, and the listing appears once the " +
			"reservation is confirmed. The seller is taken from the token, never the request.",
		DefaultStatus: http.StatusAccepted,
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPost,
		Path:        "/api/marketplace/listings",
		Summary:     "List an item for auction",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		_, err := h.client.ListItem(withBearer(ctx, in.Authorization), &pb.ListItemRequest{
			ItemId:     in.Body.ItemID,
			StartPrice: in.Body.StartPrice,
			EndsAt:     timestamppb.New(in.Body.EndsAt),
		})
		if err != nil {
			return nil, err
		}

		return &output{}, nil
	}))
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
			http.StatusConflict,
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

func registerWithdrawBid(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		ListingID string `path:"listing_id" format:"uuid"`
		BidID     string `path:"bid_id" format:"uuid"`

		// Read only to forward downstream: marketplace checks the bid belongs to
		// the member in this token. Hidden because the bearer scheme documents it.
		Authorization string `header:"Authorization" hidden:"true"`
	}

	type output struct{}

	huma.Register(api, huma.Operation{
		OperationID: "withdraw-bid",
		Description: "Withdraws a bid the signed-in member placed. A bid " +
			"belonging to another member is refused, never silently ignored.",
		DefaultStatus: http.StatusNoContent,
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusConflict,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodDelete,
		Path:        "/api/marketplace/listings/{listing_id}/bids/{bid_id}",
		Summary:     "Withdraw a bid",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		_, err := h.client.WithdrawBid(withBearer(ctx, in.Authorization), &pb.WithdrawBidRequest{
			ListingId: in.ListingID,
			BidId:     in.BidID,
		})
		if err != nil {
			return nil, err
		}

		return &output{}, nil
	}))
}
