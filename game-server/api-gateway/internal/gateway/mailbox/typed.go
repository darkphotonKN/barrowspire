package mailbox

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/danielgtaylor/huma/v2"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
	"google.golang.org/grpc/metadata"
)

// Serialized mailbox operations (FS-1GZGD §API surface). All are protected.

// ErrorFunc converts a handler's returned error into one the transport renders
// through the seam. Injected rather than imported so this package stays free of
// internal/contract.
type ErrorFunc func(error) error

// securedOp marks an operation as requiring the bearer scheme the contract
// package declares. Set by RegisterOperations.
var securedOp []map[string][]string

// toStatusError is set once by RegisterOperations and applied by guard to
// every handler, so no return path can forget it.
var toStatusError ErrorFunc = func(err error) error { return err }

const tag = "mailbox"

func RegisterOperations(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
	errFor ErrorFunc, secured []map[string][]string,
) {
	toStatusError = errFor
	securedOp = secured

	registerMailboxSummary(api, h, protect)
	registerListLetters(api, h, protect)
	registerMarkLetterRead(api, h, protect)
	registerSendLetter(api, h, protect)
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

// bearerInput reads the caller's Authorization header only to forward it.
// Hidden because the bearer scheme on the operation already documents it.
type bearerInput struct {
	Authorization string `header:"Authorization" hidden:"true"`
}

// forward hands notification-service the caller's token: it re-validates it
// and reads the member (and, for the send, the role) from it.
func forward(ctx context.Context, authorization string) context.Context {
	if authorization == "" {
		return ctx
	}
	return metadata.AppendToOutgoingContext(ctx, "authorization", authorization)
}

var errNoAnswer = errors.New("notification service returned no answer")

func registerMailboxSummary(api huma.API, h *Handler, protect func(huma.Context, func(huma.Context))) {
	type output struct{ Body MailboxSummary }

	huma.Register(api, huma.Operation{
		OperationID: "get-mailbox-summary",
		Description: "Counts the signed-in member's non-expired letters: unread, holding untaken enclosures, " +
			"and waiting (either), with when the newest was sent. The member is taken from the token.",
		Errors:      []int{http.StatusUnauthorized, http.StatusInternalServerError, http.StatusServiceUnavailable},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/mail/summary",
		Summary:     "Get my mailbox summary",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, in *bearerInput) (*output, error) {
		res, err := h.client.GetMailboxSummary(forward(ctx, in.Authorization), &pb.GetMailboxSummaryRequest{})
		if err != nil {
			return nil, err
		}
		if res == nil {
			return nil, errNoAnswer
		}
		return &output{Body: summaryFromProto(res)}, nil
	}))
}

func registerListLetters(api huma.API, h *Handler, protect func(huma.Context, func(huma.Context))) {
	type output struct{ Body LetterList }

	huma.Register(api, huma.Operation{
		OperationID: "list-my-letters",
		Description: "Lists the signed-in member's mailbox: at most 50 non-expired letters addressed to them or to " +
			"every member, newest first, each with its read and claim state. Each item enclosure is the item as it " +
			"was when the letter was sent. The member is taken from the token.",
		Errors:      []int{http.StatusUnauthorized, http.StatusInternalServerError, http.StatusServiceUnavailable},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/mail/letters",
		Summary:     "List my letters",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, in *bearerInput) (*output, error) {
		res, err := h.client.ListLetters(forward(ctx, in.Authorization), &pb.ListLettersRequest{})
		if err != nil {
			return nil, err
		}
		if res == nil {
			return nil, errNoAnswer
		}
		return &output{Body: letterListFromProto(res)}, nil
	}))
}

func registerMarkLetterRead(api huma.API, h *Handler, protect func(huma.Context, func(huma.Context))) {
	type input struct {
		Authorization string `header:"Authorization" hidden:"true"`
		LetterID      string `path:"letterId" format:"uuid" doc:"Letter id."`
	}

	huma.Register(api, huma.Operation{
		OperationID: "mark-letter-read",
		Description: "Marks one of the signed-in member's letters read. Repeating it changes nothing and succeeds. " +
			"A letter not addressed to the member is 404; an expired one is refused LETTER_EXPIRED.",
		DefaultStatus: http.StatusNoContent,
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
		Path:        "/api/mail/letters/{letterId}/read",
		Summary:     "Mark a letter read",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, in *input) (*struct{}, error) {
		if _, err := h.client.MarkLetterRead(forward(ctx, in.Authorization), &pb.MarkLetterReadRequest{LetterId: in.LetterID}); err != nil {
			return nil, err
		}
		return &struct{}{}, nil
	}))
}

// sendLetterInput is named so it can carry Resolve, the recipient and
// enclosure shape checks a schema cannot express.
type sendLetterInput struct {
	Authorization string `header:"Authorization" hidden:"true"`
	Body          SendLetterBody
}

// Resolve answers 422 for a body whose shape the schema admits but the
// operation does not: not exactly one recipient form, or an enclosure missing
// the fields its kind needs (FS-1GZGD R46). A non-uuid list entry is the
// schema's (format uuid on the items). Bounds are not shape;
// notification-service decides them.
func (in *sendLetterInput) Resolve(huma.Context) []error {
	var errs []error
	r := in.Body.Recipient

	forms := 0
	if r.MemberID != nil {
		forms++
	}
	if r.MemberIDs != nil {
		forms++
	}
	if r.AllMembers != nil {
		forms++
		if !*r.AllMembers {
			errs = append(errs, &huma.ErrorDetail{Location: "body.recipient.allMembers", Message: "must be true when given", Value: false})
		}
	}
	if forms != 1 {
		errs = append(errs, &huma.ErrorDetail{Location: "body.recipient", Message: "name exactly one of memberId, memberIds and allMembers"})
	}

	for i, e := range in.Body.Enclosures {
		at := "body.enclosures[" + strconv.Itoa(i) + "]"
		missing := func(field string) {
			errs = append(errs, &huma.ErrorDetail{Location: at + "." + field, Message: "required for kind " + e.Kind})
		}
		switch e.Kind {
		case "template":
			if e.TemplateID == nil {
				missing("templateId")
			}
			if e.Quantity == nil {
				missing("quantity")
			}
		case "copy":
			if e.CopyOf == nil {
				missing("copyOf")
			}
			if e.Quantity == nil {
				missing("quantity")
			}
		case "gold":
			if e.Gold == nil {
				missing("gold")
			}
		}
	}
	return errs
}

func registerSendLetter(api huma.API, h *Handler, protect func(huma.Context, func(huma.Context))) {
	type output struct{ Body SentLetters }

	huma.Register(api, huma.Operation{
		OperationID: "send-official-letter",
		Description: "An admin sends an official letter to one member, to a list of members (one letter per distinct " +
			"member, all stored or none) or to every member (one broadcast letter). Item enclosures are resolved " +
			"into snapshots now; the letter shows and gives exactly those. Admins only (403 otherwise). The letter " +
			"rules — lengths, enclosure bounds, expiry, the list's size — are notification-service's and come back " +
			"as 400 with their code.",
		DefaultStatus: http.StatusCreated,
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPost,
		Path:        "/api/admin/mail",
		Summary:     "Send an official letter",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, in *sendLetterInput) (*output, error) {
		caller, ok := commonauth.IdentityFromCtx(ctx)
		if !ok {
			return nil, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated")
		}
		if caller.Role != commonauth.RoleAdmin {
			return nil, apperr.WithDetail(apperr.ErrForbidden, "Only an admin may send official letters")
		}

		res, err := h.client.SendLetter(forward(ctx, in.Authorization), in.Body.sendRequest())
		if err != nil {
			return nil, err
		}
		if res == nil {
			return nil, errNoAnswer
		}
		return &output{Body: sentLettersFromProto(res)}, nil
	}))
}
