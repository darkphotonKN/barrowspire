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
	registerWithdrawListing(api, h, protect)
	registerBuyout(api, h, protect)
	registerListMyListings(api, h, protect)
	registerListMyBids(api, h, protect)
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
// own interceptor re-validates it and reads the caller from it. On a protected
// operation the gateway's middleware has already validated the same token; on
// a public read it has not, and marketplace serves a token it cannot validate
// anonymously (ADR-0053). No header forwards nothing.
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
			"reservation is confirmed. The seller is taken from the token, never the request. " +
			"endsAt must be between 1 hour and 7 days from now, with 5 minutes of slack either way. " +
			"Refusals: ITEM_WORN (the item is worn), ITEM_NOT_AVAILABLE (listed, in escrow, pending " +
			"settlement or in a delve), EMAIL_UNVERIFIED (email not verified), " +
			"LISTING_DURATION_OUT_OF_RANGE (endsAt is less than 1 hour − 5 minutes or more than " +
			"7 days + 5 minutes away), LISTING_LIMIT_REACHED (the seller already has 20 items listed " +
			"or settling). " +
			"An item that is not the member's answers 404.",
		DefaultStatus: http.StatusAccepted,
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
		OperationID: "place-bid",
		Description: "Places a bid on an active listing as the signed-in member. The bidder is taken from the token, never the request. " +
			"Resending with the same Idempotency-Key is safe and holds no further gold. 403 means the caller is the listing's " +
			"own seller, who may not bid on it. 409 CONFLICT means the listing is busy " +
			"and may be retried; 409 ALREADY_EXISTS means the attempt under this Idempotency-Key was refused or abandoned and " +
			"its gold returned: bid again with a new key. " +
			"Refusals: BID_WITHDRAW_LIMIT_REACHED (the member has made 3 or more withdrawals of a leading bid on this listing, so no gold is held and they can no longer bid on it; withdrawing an outbid bid never counts; withdrawing and buyout are not limited), " +
			"BID_TOO_LOW (the amount is below the start price with no contending bid, or not above the contending bid; re-read the listing for the current minimum), " +
			"BID_AT_OR_ABOVE_BUYOUT (the amount is at or above the listing's buyout price; buy it out instead), " +
			"ALREADY_LEADING (the member's own bid is already the listing's leading bid, so no gold is held; buyout is still allowed). " +
			"No gold stays held after either price refusal.",
		DefaultStatus: http.StatusCreated,
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
			"belonging to another member is refused, never silently ignored. " +
			"A leading bid cannot be withdrawn in the auction's final 30 minutes (400 FAILED_PRECONDITION); " +
			"an outbid bid can be withdrawn until the auction ends. " +
			"Withdrawing a leading bid counts toward the bid withdrawal cap (after 3 on one listing, place-bid answers 400 BID_WITHDRAW_LIMIT_REACHED); " +
			"withdrawing an outbid bid doesn't.",
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

		Body AcceptBidBody
	}

	type output struct{}

	huma.Register(api, huma.Operation{
		OperationID: "accept-bid",
		Description: "Ends the signed-in seller's auction early at its current leading bid. " +
			"There is no bid to choose: whichever bid leads is the one accepted, as long as it is at least " +
			"minAmount, the leading bid the seller was shown; a higher bid landing first still wins. " +
			"Answers once settlement has started; the sale completes asynchronously. " +
			"Refused when the caller is not the seller, the auction is closed, or nobody leads. " +
			"Refusals: LEADING_BID_LOWERED (the leading bid is now below minAmount; nothing is sold, " +
			"re-read the listing). A body whose minAmount is missing, not an integer or below 1 answers " +
			"422 VALIDATION_FAILED; a request with no body at all answers 400 VALIDATION_FAILED.",
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
			MinAmount: in.Body.MinAmount,
		})
		if err != nil {
			return nil, err
		}

		return &output{}, nil
	}))
}

// FS-V7A5S Req 13. Not email-gated: a withdrawal only exits a commitment
// (FS-V7A5S Req 11 as amended 2026-11-05).
func registerWithdrawListing(api huma.API, h *Handler,
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
		OperationID: "withdraw-listing",
		Description: "Withdraws the signed-in seller's own listing. The listing is withdrawn (CANCELLED) when " +
			"this answers; the item returns to the seller and every bidder's gold is given back asynchronously. " +
			"Withdrawing a listing already withdrawn is success. A listing of another member answers 403. " +
			"Refusals: LISTING_WITHDRAW_LOCKED (the listing has bids and ends within 30 minutes), " +
			"FAILED_PRECONDITION (the auction has ended, was bought out, or is no longer active). " +
			"409 CONFLICT means the listing is busy and may be retried. 503 SERVICE_UNAVAILABLE can mean the listing " +
			"was withdrawn but its follow-up (item return, bid refunds) has not yet started; retrying is safe and starts it.",
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
		Path:        "/api/marketplace/listings/{listing_id}",
		Summary:     "Withdraw a listing",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		_, err := h.client.WithdrawListing(withBearer(ctx, in.Authorization), &pb.WithdrawListingRequest{
			ListingId: in.ListingID,
		})
		if err != nil {
			return nil, err
		}

		return &output{}, nil
	}))
}

// Idempotency-Key works as for place-bid, and a resend that lost its key is still
// recognised by the buyer's own buyout (ADR-0026). The amount is the buyer's
// agreement only; marketplace charges the listing's own buyout price.
func registerBuyout(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		ListingID string `path:"listing_id" format:"uuid"`

		// Minted by the client once per buyout and resent unchanged on every retry
		// of it. Optional, matching marketplace: without one a retry is still
		// recognised by the buyer's own buyout, but holds gold again first.
		IdempotencyKey string `header:"Idempotency-Key" format:"uuid" doc:"Client-generated per buyout and reused on every retry of it, so a retried buyout is recognised instead of holding gold again. Optional."`

		// Read only to forward downstream: marketplace takes the buyer from this
		// token. Hidden because the bearer scheme documents it.
		Authorization string `header:"Authorization" hidden:"true"`

		Body BuyoutBody
	}

	type output struct{}

	huma.Register(api, huma.Operation{
		OperationID: "buyout",
		Description: "Buys the listing outright at its buyout price as the signed-in member, ending the auction. " +
			"The amount sent must equal the listing's buyoutPrice, and that price is what is charged. " +
			"Answers once settlement has started; the sale completes asynchronously. Repeating it is safe: a " +
			"buyout already made is not made twice. Refused for an amount that is not the buyout price, the " +
			"seller, a closed auction, a listing with no buyout price, or a buyer short of gold. " +
			"409 CONFLICT means the listing is busy and may be retried; 409 ALREADY_EXISTS means the attempt " +
			"under this Idempotency-Key was abandoned and its gold returned: buy again with a new key.",
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
		Path:        "/api/marketplace/listings/{listing_id}/buyout",
		Summary:     "Buy out a listing",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		_, err := h.client.Buyout(withBearer(ctx, in.Authorization), &pb.BuyoutRequest{
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

		if err := embedItems(ctx, h.items, page.Listings); err != nil {
			return nil, err
		}

		return &output{Body: page}, nil
	}))
}

func registerListMyBids(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		// Opaque to the gateway: only marketplace can tell a malformed one, and
		// its refusal comes back through the seam.
		Cursor string `query:"cursor" doc:"Opaque position from a previous page's nextCursor. Do not construct."`
		Limit  int    `query:"limit" default:"50" minimum:"1" maximum:"100"`

		// Read only to forward downstream: marketplace takes the bidder from this
		// token. Hidden because the bearer scheme documents it.
		Authorization string `header:"Authorization" hidden:"true"`
	}

	type output struct{ Body MyBidPage }

	huma.Register(api, huma.Operation{
		OperationID: "list-my-bids",
		Description: "Pages the signed-in member's own bids, newest placed first, one row per bid, each with where its " +
			"listing stands now and the listed item embedded. Withdrawn and failed bids are not listed. The bidder is " +
			"taken from the token; there is no parameter for reading another member's bids. If the items lookup fails " +
			"the whole request fails.",
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
		Path:        "/api/marketplace/bids/mine",
		Summary:     "Page my bids",
		Tags:        []string{"marketplace"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.ListMyBids(withBearer(ctx, in.Authorization), &pb.ListMyBidsRequest{
			Cursor: in.Cursor,
			Limit:  int32(in.Limit),
		})
		if err != nil {
			return nil, err
		}

		page, err := myBidPageFromProto(res.GetBids(), res.GetPagination())
		if err != nil {
			return nil, err
		}

		if err := embedItems(ctx, h.items, page.Bids); err != nil {
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

		// Optional and read only to forward downstream, where marketplace sets
		// own from it. Hidden: the operation declares no security, and a
		// documented header would read as a requirement.
		Authorization string `header:"Authorization" hidden:"true"`
	}

	type output struct {
		ViewerRelative
		Body PublicListingPage
	}

	// Public: no protect middleware and no Security. The page is for visitors
	// who are not signed in, and it names no member (FS-GKHYD). A signed-in
	// caller's token only lets marketplace answer own.
	huma.Register(api, huma.Operation{
		OperationID: "browse-listings",
		Description: "Pages every seller's live auctions — active and not yet ended — soonest-ending first, each with " +
			"its item embedded. Public: no token is needed. No listing carries a member id or a sold price. " +
			"Sent with a bearer token, own marks the caller's own listings; without one, or with a token that " +
			"is invalid or expired, the caller reads as signed out and own is false on every listing, never 401. " +
			"If the items lookup fails the whole request fails; a page is never returned without its items.",
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
		res, err := h.client.BrowseListings(withBearer(ctx, in.Authorization), &pb.BrowseListingsRequest{
			Cursor: in.Cursor,
			Limit:  int32(in.Limit),
		})
		if err != nil {
			return nil, err
		}

		page, err := publicListingPageFromProto(res.GetListings(), res.GetPagination())
		if err != nil {
			return nil, err
		}

		if err := embedItems(ctx, h.items, page.Listings); err != nil {
			return nil, err
		}

		return &output{ViewerRelative: viewerRelativeTo(in.Authorization), Body: page}, nil
	}))
}

func registerGetListing(api huma.API, h *Handler) {
	type input struct {
		ListingID string `path:"listing_id" format:"uuid"`

		// Optional, forwarded and hidden exactly as for browse-listings.
		Authorization string `header:"Authorization" hidden:"true"`
	}

	type output struct {
		ViewerRelative
		Body PublicListing
	}

	// Public, like browse-listings: no protect middleware and no Security.
	huma.Register(api, huma.Operation{
		OperationID: "get-listing",
		Description: "Reads one listing in any status, with its item embedded. An active listing past endsAt answers " +
			"ended: true. Public: no token is needed. The listing carries no member id and no sold price, in any " +
			"status. Sent with a bearer token, own is true when the caller is the seller; without one, or with a " +
			"token that is invalid or expired, the caller reads as signed out and own is false, never 401. If the " +
			"items lookup fails the request fails.",
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
		res, err := h.client.GetListing(withBearer(ctx, in.Authorization), &pb.GetListingRequest{ListingId: in.ListingID})
		if err != nil {
			return nil, err
		}

		listing, err := publicListingFromProto(res.GetListing())
		if err != nil {
			return nil, err
		}

		// one listing is a page of one to the join
		one := []PublicListing{listing}
		if err := embedItems(ctx, h.items, one); err != nil {
			return nil, err
		}

		return &output{ViewerRelative: viewerRelativeTo(in.Authorization), Body: one[0]}, nil
	}))
}

// ViewerRelative is the cache headers of a public read whose answer depends on
// who asks (own, FS-GKHYD; ADR-0053): it always varies by Authorization, and
// an answer to a bearer is private, so no shared cache hands one viewer's
// answer to another. Exported only because huma reads headers from exported
// embedded fields. Vary is a slice so huma appends it: a string would be set,
// replacing the Vary: Origin the CORS middleware already wrote.
type ViewerRelative struct {
	Vary         []string `header:"Vary" doc:"Includes Authorization: own depends on the caller."`
	CacheControl string   `header:"Cache-Control" doc:"private when the request carried an Authorization; absent otherwise."`
}

func viewerRelativeTo(authorization string) ViewerRelative {
	h := ViewerRelative{Vary: []string{"Authorization"}}
	if authorization != "" {
		h.CacheControl = "private"
	}
	return h
}

// itemRow is a row the item join fills: a listing in either shape, or a bid.
// The pointer constraint lets embedItems set the summary on the row in place.
type itemRow[T any] interface {
	*T
	joinItemID() string
	joinItem(*ItemSummary)
}

// embedItems joins each row's item summary onto it, with one items call for
// the whole page. An id items does not know leaves that row's item absent.
// Seller, public and bid rows all join this way (FS-EYQ8K §Requirements 7).
//
// Any failure of the call fails the request (FS-8EGFA §Requirements 16): a page
// of listings without their items must not pass for a good one. The failure is
// re-coded rather than passed through, because items' own code would describe
// the wrong thing to the client — an Unauthenticated from items would read as
// "your session ended" and sign a visitor out. Unreachable is 503, so the client
// retries; anything else is 500. See joinFailure for the exact mapping.
//
// ctx is the request's own, never the one carrying the caller's bearer: items
// is asked for public facts and is not told who is asking.
func embedItems[T any, P itemRow[T]](ctx context.Context, items ItemSummaries, rows []T) error {
	ids := make([]string, 0, len(rows))
	for i := range rows {
		ids = append(ids, P(&rows[i]).joinItemID())
	}

	byID, err := itemSummaries(ctx, items, ids)
	if err != nil {
		return err
	}

	for i := range rows {
		row := P(&rows[i])
		if s, ok := byID[row.joinItemID()]; ok {
			row.joinItem(itemSummaryFromProto(s))
		}
	}

	return nil
}

// itemSummaries looks up the given items with one items call, keyed by id. No
// ids makes no call. A failed call is already re-coded by joinFailure.
func itemSummaries(ctx context.Context, items ItemSummaries, ids []string) (map[string]*itempb.ItemSummary, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	res, err := items.GetItemSummaries(ctx, &itempb.GetItemSummariesRequest{Ids: ids})
	if err != nil {
		return nil, joinFailure(ctx, err)
	}

	byID := make(map[string]*itempb.ItemSummary, len(res.GetSummaries()))
	for _, s := range res.GetSummaries() {
		byID[s.GetId()] = s
	}

	return byID, nil
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
