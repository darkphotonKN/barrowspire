package wallet

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/wallet"
)

// Serialized wallet operations. Only the balance read is typed (FS-8EGFA
// §Requirements 17); create, deposit and withdraw stay on gin.

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

	registerGetWalletAccount(api, h, protect)
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

func registerGetWalletAccount(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		// Read only to forward downstream: wallet derives the account from this
		// token. Hidden because the bearer scheme on the operation documents it.
		Authorization string `header:"Authorization" hidden:"true"`
	}

	type output struct{ Body WalletAccount }

	huma.Register(api, huma.Operation{
		OperationID: "get-wallet-account",
		Description: "Reads the signed-in member's gold balance. The account is taken from the token, never the request. " +
			"It is created asynchronously after signup, so a 404 just after signing up means it does not exist yet.",
		Errors: []int{
			http.StatusUnauthorized,
			http.StatusNotFound,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/wallet/account",
		Summary:     "Get my wallet balance",
		Tags:        []string{"wallet"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.GetAccount(WithBearer(ctx, in.Authorization), &pb.GetAccountRequest{})
		if err != nil {
			return nil, err
		}
		if res == nil {
			return nil, errors.New("wallet service returned no account")
		}

		return &output{Body: walletAccountFromProto(res)}, nil
	}))
}
