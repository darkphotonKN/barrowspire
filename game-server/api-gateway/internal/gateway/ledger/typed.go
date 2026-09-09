package ledger

import (
	"context"
	"fmt"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/ledger"
)

type Claims struct {
	MemberID  string
	AccountID string
	Role      string
}

// MemberIDFunc reads the authenticated caller's id out of a typed handler's
// context.

// Passed in rather than imported so this package does not depend on
// internal/contract. The gateway wires contract.MemberID here.
type MemberIDFunc func(ctx context.Context) (string, bool)
type ClaimsFunc func(ctx context.Context) (Claims, bool)

// ErrorFunc converts a handler's returned error into one the transport renders
// through the seam. Injected rather than imported so this package stays free of
// internal/contract.
type ErrorFunc func(error) error

// securedOp marks an operation as requiring the bearer scheme the contract
// package declares. Set by RegisterOperations.
var securedOp []map[string][]string

// toStatusError is set once by RegisterOperations. It is applied by guard to
// EVERY handler, so no individual return path can forget it, a forgotten one
// would be a silent 500 carrying no code.
var toStatusError ErrorFunc = func(err error) error { return err }

// Error sets, per operation, from FS-0003 §API surface's error-semantics table.
//
// getTransaction carries no 403 deliberately: its only authorization failure is
// §Req 26's, which is masked as a 404. listEntries carries one, because §Req 25
// refuses a member's account_id loudly, there the secret is nothing.
var (
	errsGetTransaction = []int{
		http.StatusUnauthorized,
		http.StatusNotFound,
		http.StatusUnprocessableEntity,
		http.StatusServiceUnavailable,
		http.StatusInternalServerError,
	}
	errsListEntries = []int{
		http.StatusUnauthorized,
		http.StatusForbidden,
		http.StatusUnprocessableEntity,
		http.StatusServiceUnavailable,
		http.StatusInternalServerError,
	}
)

func RegisterOperations(api huma.API, h *Handler,
	claims ClaimsFunc,
	protect func(huma.Context, func(huma.Context)),
	errFor ErrorFunc, secured []map[string][]string,
) {
	toStatusError = errFor
	securedOp = secured

	registerGetTransaction(api, h, claims, protect)
	registerListEntries(api, h, claims, protect)
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

// unauthenticated is the error a protected typed operation returns when the
// context carries no caller, or when a required claim is absent.
//
// Fail closed: a token missing the account_id claim is not a member with no
// history, it is a token this service cannot authorize (§Req 27). Never
// degrade to an empty listing.
func unauthenticated() error {
	return apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated")
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

// TODO: GET /api/ledger/transactions/{transaction_id}
//
// The masking rule is why this slice is human-authored. §Req 26: a member
// requesting a transaction they have no leg in gets 404, byte-identical to the
// response for an id that does not exist — same status, same code, same detail.
//
// The trap: `if !found {404} else if !authorized {403}` and then "fixing" the
// 403 to a 404 leaves a code-path and detail difference. Decide the shape so
// not-found and not-yours converge BEFORE a response is constructed.
func registerGetTransaction(api huma.API, h *Handler, claims ClaimsFunc,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		TransactionID string `path:"transaction_id" format:"uuid"`
	}

	type output struct{ Body Transaction }

	huma.Register(api, huma.Operation{
		OperationID: "get-transaction",
		Description: "Get details of a specific transaction by its transaction id.",
		// 403 forbidden omitted on purpose, masked as 404 to hide server details. We dont
		// want the user to know they cant access which transactionID etc to leak information
		// that that transaction exists.
		Errors:      errsGetTransaction,
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/ledger/transactions/{transaction_id}",
		Summary:     "Get a member's transaction.",
		Tags:        []string{"ledger"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.GetTransaction(ctx, &pb.GetTransactionRequest{
			TransactionId: in.TransactionID,
		})

		if err != nil {
			return nil, err
		}

		if res == nil {
			return nil, fmt.Errorf("ledger service returned no transaction")
		}

		resBody := transactionFromProto(res)

		return &output{Body: *resBody}, nil
	}))
}

func registerListEntries(api huma.API, h *Handler, claims ClaimsFunc,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		Cursor    string  `query:"cursor" doc:"opaque position, do not construct."`
		Limit     int     `query:"limit" default:"50" minimum:"1" maximum:"100"`
		AccountID *string `query:"account_id" format:"uuid" doc:"admin only"`
	}

}
