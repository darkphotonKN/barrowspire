package payment

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/wire"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/payment"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
)

type MemberIDFunc func(ctx context.Context) (string, bool)
type ErrorFunc func(error) error

var toStatusError ErrorFunc = func(err error) error { return err }

func guard[I, O any](fn func(context.Context, *I) (*O, error)) func(context.Context, *I) (*O, error) {
	return func(ctx context.Context, in *I) (*O, error) {
		out, err := fn(ctx, in)
		if err != nil {
			return nil, toStatusError(err)
		}
		return out, nil
	}
}

func unauthenticated() error {
	return apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated")
}

// Transport mirrors.
type CustomerResult struct {
	CustomerID string `json:"customer_id,omitempty" doc:"Stripe customer id"`
}

type SubscriptionProductResult struct {
	ProductID string `json:"product_id,omitempty" doc:"Stripe product id"`
	PriceID   string `json:"price_id,omitempty" doc:"Stripe price id"`
}

type SubscribeResult struct {
	SubscriptionID string `json:"subscription_id,omitempty" doc:"Stripe subscription id"`
	ClientSecret   string `json:"client_secret,omitempty" doc:"Secret for confirming payment client-side"`
	Status         string `json:"status,omitempty" doc:"Subscription status"`
}

type UserSubscriptionInfo struct {
	SubscriptionID   string `json:"subscription_id,omitempty" doc:"Stripe subscription id"`
	ProductID        string `json:"product_id,omitempty" doc:"Stripe product id"`
	PriceID          string `json:"price_id,omitempty" doc:"Stripe price id"`
	Status           string `json:"status,omitempty" doc:"Subscription status"`
	CurrentPeriodEnd int64  `json:"current_period_end,omitempty" doc:"Period end, Unix seconds"`
}

type SubscriptionsResult struct {
	Subscriptions []*UserSubscriptionInfo `json:"subscriptions,omitempty" doc:"The member's subscriptions"`
}

// Request bodies. `required` transcribed from the legacy binding tags.
type CreateCustomerBody struct {
	Email string `json:"email" required:"true" doc:"Email to attach to the Stripe customer"`
}

type SetupSubscriptionBody struct {
	Name        string `json:"name,omitempty" doc:"Product name"`
	Description string `json:"description,omitempty" doc:"Product description"`
	Price       int64  `json:"price,omitempty" doc:"Price in cents"`
}

type SubscribeBody struct {
	ProductID string `json:"product_id" required:"true" doc:"Product to subscribe to"`
	Email     string `json:"email" required:"true" doc:"Email for the Stripe customer"`
}

// Envelopes, transcribed.
type resultEnvelope[T any] struct {
	StatusCode int    `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string `json:"message" doc:"Human-readable summary"`
	Result     T      `json:"result" doc:"The payload"`
}

// CheckPermission puts has_permission at the top level rather than in `result`.
type permissionEnvelope struct {
	StatusCode    int    `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message       string `json:"message" doc:"Human-readable summary"`
	HasPermission bool   `json:"has_permission" doc:"Whether the member holds an active subscription"`
}

var errsAuthed = []int{http.StatusUnauthorized, http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError}

// RegisterOperations declares the serialized payment surface (FS-0002 slice 4).
//
// POST /webhook/stripe is NOT here and must never be. Three independent reasons,
// any one sufficient:
//   - the caller is Stripe, so there is no consumer for a generated client;
//   - signature verification needs the RAW request body, which a typed decode
//     has already consumed and re-encoded by the time a handler sees it;
//   - it carries no /api prefix and is registered directly on the router.
//
// Serializing it would break signature verification in a way that surfaces only
// as failed live payments. It stays a legacy gin route (FS-0002 §Out of Scope).
func RegisterOperations(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)), errFor ErrorFunc,
) {
	toStatusError = errFor
	mw := huma.Middlewares{protect}

	type custIn struct{ Body CreateCustomerBody }
	type custOut struct {
		Status int
		Body   resultEnvelope[*CustomerResult]
	}
	huma.Register(api, huma.Operation{
		OperationID: "create-payment-customer", Method: http.MethodPost,
		Path: "/api/payment/customer", Summary: "Create a Stripe customer for the signed-in member",
		Description: "Creates a Stripe customer bound to the caller's member id.",
		Tags:        []string{"payment"}, Middlewares: mw, Errors: errsAuthed,
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *custIn) (*custOut, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.CreateCustomer(ctx, &pb.CreateCustomerRequest{UserId: id, Email: in.Body.Email})
		if err != nil {
			return nil, err
		}
		body, err := wire.As[CustomerResult](res)
		if err != nil {
			return nil, err
		}
		return &custOut{Status: http.StatusCreated, Body: resultEnvelope[*CustomerResult]{
			StatusCode: http.StatusCreated, Message: "Successfully created customer", Result: body,
		}}, nil
	}))

	type setupIn struct{ Body SetupSubscriptionBody }
	type setupOut struct {
		Status int
		Body   resultEnvelope[*SubscriptionProductResult]
	}
	huma.Register(api, huma.Operation{
		OperationID: "setup-subscription-product", Method: http.MethodPost,
		Path: "/api/payment/subscription/setup", Summary: "Create a subscription product and price",
		Description: "Sets up the Stripe product and price a subscription is sold against.",
		Tags:        []string{"payment"}, Middlewares: mw, Errors: errsAuthed,
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *setupIn) (*setupOut, error) {
		res, err := h.client.SetupSubscription(ctx, &pb.SetupSubscriptionRequest{
			Name: in.Body.Name, Description: in.Body.Description, Price: in.Body.Price,
		})
		if err != nil {
			return nil, err
		}
		body, err := wire.As[SubscriptionProductResult](res)
		if err != nil {
			return nil, err
		}
		return &setupOut{Status: http.StatusCreated, Body: resultEnvelope[*SubscriptionProductResult]{
			StatusCode: http.StatusCreated, Message: "Successfully setup subscription product", Result: body,
		}}, nil
	}))

	type subIn struct{ Body SubscribeBody }
	type subOut struct {
		Body resultEnvelope[*SubscribeResult]
	}
	huma.Register(api, huma.Operation{
		OperationID: "subscribe", Method: http.MethodPost,
		Path: "/api/payment/subscribe", Summary: "Subscribe the signed-in member to a product",
		Description: "Creates (or reuses) the Stripe customer, then subscribes them to the product.",
		Tags:        []string{"payment"}, Middlewares: mw, Errors: errsAuthed,
	}, guard(func(ctx context.Context, in *subIn) (*subOut, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		// Two downstream calls, transcribed in order: the customer is created
		// first and its id feeds the subscribe call.
		cust, err := h.client.CreateCustomer(ctx, &pb.CreateCustomerRequest{UserId: id, Email: in.Body.Email})
		if err != nil {
			return nil, err
		}
		res, err := h.client.Subscribe(ctx, &pb.SubscribeRequest{
			ProductId: in.Body.ProductID, CustomerId: cust.CustomerId,
		})
		if err != nil {
			return nil, err
		}
		body, err := wire.As[SubscribeResult](res)
		if err != nil {
			return nil, err
		}
		return &subOut{Body: resultEnvelope[*SubscribeResult]{
			StatusCode: http.StatusOK, Message: "Successfully subscribed", Result: body,
		}}, nil
	}))

	type listIn struct {
		CustomerID string `path:"customerId" doc:"Stripe customer id"`
	}
	type listOut struct {
		Body resultEnvelope[*SubscriptionsResult]
	}
	huma.Register(api, huma.Operation{
		OperationID: "get-user-subscriptions", Method: http.MethodGet,
		Path: "/api/payment/subscriptions/{customerId}", Summary: "List a customer's subscriptions",
		Description: "Returns every subscription held by the given Stripe customer.",
		Tags:        []string{"payment"}, Middlewares: mw, Errors: errsAuthed,
	}, guard(func(ctx context.Context, in *listIn) (*listOut, error) {
		res, err := h.client.GetUserSubscriptions(ctx, &pb.GetUserSubscriptionsRequest{CustomerId: in.CustomerID})
		if err != nil {
			return nil, err
		}
		body, err := wire.As[SubscriptionsResult](res)
		if err != nil {
			return nil, err
		}
		return &listOut{Body: resultEnvelope[*SubscriptionsResult]{
			StatusCode: http.StatusOK, Message: "Successfully retrieved subscriptions", Result: body,
		}}, nil
	}))

	type permOut struct{ Body permissionEnvelope }
	huma.Register(api, huma.Operation{
		OperationID: "check-subscription-permission", Method: http.MethodGet,
		Path: "/api/payment/subscription/permission", Summary: "Check the member's subscription entitlement",
		Description: "Polling endpoint: reports whether the signed-in member currently holds an active subscription.",
		Tags:        []string{"payment"}, Middlewares: mw, Errors: errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*permOut, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.CheckPermission(ctx, &pb.CheckPermissionRequest{UserId: id})
		if err != nil {
			return nil, err
		}
		return &permOut{Body: permissionEnvelope{
			StatusCode: http.StatusOK, Message: "Permission check successful", HasPermission: res.HasPermission,
		}}, nil
	}))
}
