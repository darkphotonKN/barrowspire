package listing

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	itempb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
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
	registerAcceptBid(api, h, protect)
	registerListMyListings(api, h, protect)
	registerBrowseListings(api, h)
	registerGetListing(api, h)
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
			ItemId:      in.Body.ItemID,
			StartPrice:  in.Body.StartPrice,
			BuyoutPrice: in.Body.BuyoutPrice,
			EndsAt:      timestamppb.New(in.Body.EndsAt),
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

func registerAcceptBid(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		ListingID string `path:"listing_id" format:"uuid"`

		// Read only to forward downstream: marketplace checks the listing is the
		// seller's in this token. Hidden because the bearer scheme documents it.
		Authorization string `header:"Authorization" hidden:"true"`
	}

	type output struct{}

	huma.Register(api, huma.Operation{
		OperationID: "accept-bid",
		Description: "Ends the signed-in seller's auction early at its current leading bid. " +
			"There is no bid to choose: whichever bid leads is the one accepted. " +
			"Answers once settlement has started; the sale completes asynchronously. " +
			"Refused when the caller is not the seller, the auction is closed, or nobody leads.",
		DefaultStatus: http.StatusAccepted,
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
		Method:      http.MethodPost,
		Path:        "/api/marketplace/listings/{listing_id}/accept",
		Summary:     "Accept the leading bid",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		_, err := h.client.AcceptBid(withBearer(ctx, in.Authorization), &pb.AcceptBidRequest{
			ListingId: in.ListingID,
		})
		if err != nil {
			return nil, err
		}

		return &output{}, nil
	}))
}

func registerListMyListings(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		// Opaque to the gateway: only marketplace can tell a malformed one, and
		// its refusal comes back through the seam.
		Cursor string `query:"cursor" doc:"Opaque position from a previous page's nextCursor. Do not construct."`
		Limit  int    `query:"limit" default:"50" minimum:"1" maximum:"100"`

		// Read only to forward downstream: marketplace takes the seller from this
		// token. Hidden because the bearer scheme documents it.
		Authorization string `header:"Authorization" hidden:"true"`
	}

	type output struct{ Body ListingPage }

	huma.Register(api, huma.Operation{
		OperationID: "list-my-listings",
		Description: "Pages the signed-in member's own listings in any status, newest first, each with its item embedded. " +
			"Every listing's sellerId is the caller: the seller is taken from the token; there is no parameter for reading " +
			"another member's listings. If the items lookup fails the whole request fails.",
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/marketplace/listings/mine",
		Summary:     "Page my listings",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.ListMyListings(withBearer(ctx, in.Authorization), &pb.ListMyListingsRequest{
			Cursor: in.Cursor,
			Limit:  int32(in.Limit),
		})
		if err != nil {
			return nil, err
		}

		page, err := listingPageFromProto(res.GetListings(), res.GetPagination())
		if err != nil {
			return nil, err
		}

		if err := h.embedItems(ctx, page.Listings); err != nil {
			return nil, err
		}

		return &output{Body: page}, nil
	}))
}

func registerBrowseListings(api huma.API, h *Handler) {
	type input struct {
		// Opaque to the gateway: only marketplace can tell a malformed one, and
		// its refusal comes back through the seam.
		Cursor string `query:"cursor" doc:"Opaque position from a previous page's nextCursor. Do not construct."`
		Limit  int    `query:"limit" default:"50" minimum:"1" maximum:"100"`
	}

	type output struct{ Body ListingPage }

	// Public: no protect middleware and no Security. The page is for visitors
	// who are not signed in, and it carries nothing that belongs to a member.
	huma.Register(api, huma.Operation{
		OperationID: "browse-listings",
		Description: "Pages every seller's live auctions — active and not yet ended — soonest-ending first, each with " +
			"its item embedded. Public: no token is needed. If the items lookup fails the whole request fails; a " +
			"page is never returned without its items.",
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Method:  http.MethodGet,
		Path:    "/api/marketplace/listings",
		Summary: "Browse live auctions",
		Tags:    []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.BrowseListings(ctx, &pb.BrowseListingsRequest{
			Cursor: in.Cursor,
			Limit:  int32(in.Limit),
		})
		if err != nil {
			return nil, err
		}

		page, err := listingPageFromProto(res.GetListings(), res.GetPagination())
		if err != nil {
			return nil, err
		}

		if err := h.embedItems(ctx, page.Listings); err != nil {
			return nil, err
		}

		return &output{Body: page}, nil
	}))
}

func registerGetListing(api huma.API, h *Handler) {
	type input struct {
		ListingID string `path:"listing_id" format:"uuid"`
	}

	type output struct{ Body Listing }

	// Public, like browse-listings: no protect middleware and no Security.
	huma.Register(api, huma.Operation{
		OperationID: "get-listing",
		Description: "Reads one listing in any status, with its item embedded. An active listing past endsAt answers " +
			"ended: true. Public: no token is needed. If the items lookup fails the request fails.",
		Errors: []int{
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Method:  http.MethodGet,
		Path:    "/api/marketplace/listings/{listing_id}",
		Summary: "Get a listing",
		Tags:    []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.GetListing(ctx, &pb.GetListingRequest{ListingId: in.ListingID})
		if err != nil {
			return nil, err
		}

		listing, err := listingFromProto(res.GetListing())
		if err != nil {
			return nil, err
		}

		// one listing is a page of one to the join
		one := []Listing{listing}
		if err := h.embedItems(ctx, one); err != nil {
			return nil, err
		}

		return &output{Body: one[0]}, nil
	}))
}

// embedItems joins each listing's item summary onto it, with one items call for
// the whole page. An id items does not know leaves that listing's item absent.
//
// Any failure of the call fails the request (FS-8EGFA §Requirements 16): a page
// of listings without their items must not pass for a good one. The failure is
// re-coded rather than passed through, because items' own code would describe
// the wrong thing to the client — an Unauthenticated from items would read as
// "your session ended" and sign a visitor out. Unreachable is 503, so the client
// retries; anything else is 500. See joinFailure for the exact mapping.
func (h *Handler) embedItems(ctx context.Context, listings []Listing) error {
	if len(listings) == 0 {
		return nil
	}

	ids := make([]string, 0, len(listings))
	for _, l := range listings {
		ids = append(ids, l.ItemID)
	}

	res, err := h.items.GetItemSummaries(ctx, &itempb.GetItemSummariesRequest{Ids: ids})
	if err != nil {
		return joinFailure(ctx, err)
	}

	byID := make(map[string]*itempb.ItemSummary, len(res.GetSummaries()))
	for _, s := range res.GetSummaries() {
		byID[s.GetId()] = s
	}

	for i := range listings {
		if s, ok := byID[listings[i].ItemID]; ok {
			listings[i].Item = itemSummaryFromProto(s)
		}
	}

	return nil
}

// joinFailure re-codes a failed items call for the client (FS-8EGFA
// §Requirements 16).
//
//   - Canceled: the caller went away. Passed through as Canceled and logged at
//     INFO — nobody is listening for the answer and nothing of ours broke, so it
//     must not page anyone.
//   - DeadlineExceeded: items was too slow. 503, like an outage, so the client
//     retries rather than giving up.
//   - Unavailable, or no gRPC status at all (a dial failure): 503.
//   - Everything else, auth codes included: 500. An items Unauthenticated must
//     never reach the client as 401, which would sign a public visitor out.
func joinFailure(ctx context.Context, err error) error {
	if errors.Is(err, context.Canceled) || status.Code(err) == codes.Canceled {
		slog.InfoContext(ctx, "listing item join abandoned: caller canceled", "error", err)
		return status.Error(codes.Canceled, "request canceled")
	}

	slog.ErrorContext(ctx, "listing item join failed", "error", err)

	// not a gRPC status at all is a dial failure (or a bare context deadline):
	// either way items did not answer in time
	st, isStatus := status.FromError(err)
	if !isStatus || st.Code() == codes.Unavailable || st.Code() == codes.DeadlineExceeded {
		return status.Error(codes.Unavailable, "items unavailable")
	}
	return status.Error(codes.Internal, "items lookup failed")
}
