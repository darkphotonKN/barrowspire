// Package httperr is the gateway's single error seam.
//
// Exactly one function here decides the HTTP status of an error response, and it
// is the only code in api-gateway permitted to write a 4xx or 5xx body. Handlers
// and middleware hand it an error; it decides status, code, and body shape.
//
// It exists because that decision used to live in 24 hand-copied switches across
// six handler files, which disagreed with each other about what a given gRPC code
// meant. See docs/specs/0001-uniform-error-contract.md and ADR-0001 §6.
package httperr

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/render"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// contentType is the media type of every error response. RFC 9457 requires it,
// and it is asserted in tests: the failure mode this guards against is silently
// degrading to application/json, which no client would notice until it relied on
// the distinction.
const contentType = "application/problem+json"

// FieldError is one entry in a Problem's Errors slice.
//
// Exported so the Huma adapter can translate boundary validation failures into
// the same member the seam publishes (FS-0002 §Requirements 8). Exporting the
// SHAPE does not create a second writer: Write is still the only function that
// puts an error on a gin response, and the seam gate still forbids direct
// status writes elsewhere.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// fieldError is retained as the internal alias so existing call sites read
// unchanged.
type fieldError = FieldError

// Problem is an RFC 9457 problem detail. Member semantics are pinned by
// FS-0001 §API surface.
type Problem struct {
	// Type identifies the problem class. about:blank until real type URIs are
	// minted; Code is the switch key in the meantime.
	Type string `json:"type"`
	// Title is a short, stable summary — defaults from the status text.
	Title string `json:"title"`
	// Status mirrors the HTTP status.
	Status int `json:"status"`
	// Detail is client-safe, occurrence-specific prose. NOT contract: clients
	// display it, never branch on it.
	Detail string `json:"detail"`
	// Code is the stable domain code. This is what clients switch on.
	Code errcode.Code `json:"code"`
	// Errors carries field-level detail. Always present — empty rather than
	// absent, so clients never null-check before iterating.
	Errors []fieldError `json:"errors"`
}

// Write maps err to a problem+json response and writes it to c.
//
// op names the operation for server-side logging only; it never reaches the
// client. The raw error is logged with it, so generalising the client-facing
// message costs no diagnostic detail.
//
// Safe to call from middleware as well as handlers: it aborts the chain, so a
// middleware that rejects a request does not fall through to the handler.
func Write(c *gin.Context, op string, err error) {
	if err == nil {
		// Always a programming fault: something decided to report a failure and
		// had none to report. It still gets a safe 500, but the log must not
		// describe a failure that never happened.
		slog.Error("httperr.Write called with a nil error", "op", op)
		err = errors.New("nil error passed to httperr.Write")
	}

	p := mapError(err)

	// An authored detail (apperr.WithDetail) is the one occurrence-specific
	// message safe to publish: the caller wrote it about a failure it decided
	// itself. Title is deliberately left alone — it is the stable status
	// summary, and collapsing the two would make detail redundant again.
	if detail, ok := apperr.DetailOf(err); ok {
		p.Detail = detail
	}

	// 5xx is ours to fix and pages someone; 4xx is the caller's mistake and
	// must not. Same event, different audience.
	if p.Status >= http.StatusInternalServerError {
		slog.Error("request failed", "op", op, "status", p.Status, "code", p.Code, "error", err)
	} else {
		slog.Info("request rejected", "op", op, "status", p.Status, "code", p.Code, "error", err)
	}

	emit(c, p, op)
}

// emit writes an already-resolved problem detail. Split out from Write so a
// caller that has ALREADY logged the event (recovery, which logs the stack too)
// can emit the response without producing a second record of one failure.
func emit(c *gin.Context, p Problem, op string) {
	body, marshalErr := json.Marshal(p)
	if marshalErr != nil {
		// Problem is a fixed struct of JSON-safe types, so this is unreachable
		// short of a stdlib bug — but falling through would emit a 200 with an
		// empty body, which is the worst possible outcome for an error path.
		slog.Error("failed to marshal problem detail", "op", op, "error", marshalErr)
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	// Rendered as raw data rather than via c.JSON, which hardcodes
	// application/json and would defeat the media type above.
	c.Render(p.Status, render.Data{ContentType: contentType, Data: body})
	c.Abort()
}

// mapError resolves an error to a Problem without writing anything.
//
// Precedence: a gRPC status from downstream, then a local sentinel, then the
// catch-all. The catch-all must exist so that a downstream code nobody has seen
// yet degrades to a clean 500 rather than an empty status.
func mapError(err error) Problem {
	// codes.OK means FromError was handed something that is not a gRPC status
	// at all (including nil), so it is not a decision — fall through and let the
	// sentinels answer.
	if st, ok := status.FromError(err); ok && st.Code() != codes.OK {
		switch st.Code() {
		case codes.InvalidArgument:
			return newProblem(http.StatusBadRequest, errcode.ValidationFailed)
		case codes.NotFound:
			return newProblem(http.StatusNotFound, errcode.NotFound)
		case codes.AlreadyExists:
			return newProblem(http.StatusConflict, errcode.AlreadyExists)
		case codes.Unauthenticated:
			return newProblem(http.StatusUnauthorized, errcode.Unauthenticated)
		case codes.PermissionDenied:
			return newProblem(http.StatusForbidden, errcode.Forbidden)
		case codes.Unavailable:
			// 503, not 500. The request was fine and retrying is the correct
			// client behavior; a 500 would tell every caller to give up on a
			// failure that would have succeeded a second later. The dial error
			// itself still never leaves the process.
			return newProblem(http.StatusServiceUnavailable, errcode.ServiceUnavailable)
		default:
			// Everything genuinely unrecognised. The catch-all must exist so a
			// downstream code nobody has seen yet degrades cleanly rather than
			// producing an empty status.
			return newProblem(http.StatusInternalServerError, errcode.Internal)
		}
	}

	switch {
	case errors.Is(err, apperr.ErrNotFound):
		return newProblem(http.StatusNotFound, errcode.NotFound)
	case errors.Is(err, apperr.ErrAlreadyExists):
		return newProblem(http.StatusConflict, errcode.AlreadyExists)
	case errors.Is(err, apperr.ErrUnauthenticated):
		return newProblem(http.StatusUnauthorized, errcode.Unauthenticated)
	case errors.Is(err, apperr.ErrForbidden):
		return newProblem(http.StatusForbidden, errcode.Forbidden)
	case errors.Is(err, apperr.ErrValidation):
		return newProblem(http.StatusBadRequest, errcode.ValidationFailed)
	case errors.Is(err, apperr.ErrUnavailable):
		return newProblem(http.StatusServiceUnavailable, errcode.ServiceUnavailable)
	}

	return newProblem(http.StatusInternalServerError, errcode.Internal)
}

// newProblem builds a Problem with the members that follow mechanically from a
// status and a code. Detail defaults to the status text: downstream error
// prose is never client-safe (FS-0001 §Requirements 9), so the default has to
// be something that carries no information about internals.
func newProblem(httpStatus int, code errcode.Code) Problem {
	return Problem{
		Type:   "about:blank",
		Title:  http.StatusText(httpStatus),
		Status: httpStatus,
		Detail: http.StatusText(httpStatus),
		Code:   code,
		Errors: []fieldError{},
	}
}

// CodeForStatus is the inverse of the seam's mapping: given an HTTP status
// decided somewhere that has no error to map — Huma's typed boundary, which
// rejects a request before any handler runs — it names the code that status
// carries.
//
// It lives here, next to mapError, so the correspondence between status and
// code has exactly one definition. Two tables would disagree eventually, and
// the disagreement would be invisible until a client switched on the wrong one.
func CodeForStatus(httpStatus int) errcode.Code {
	switch httpStatus {
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		// 422 is shape (decided at the boundary from a type), 400 is domain
		// (decided downstream). Both are "the request was not acceptable", and
		// the status already distinguishes them — ADR-0001 §7.
		return errcode.ValidationFailed
	case http.StatusUnauthorized:
		return errcode.Unauthenticated
	case http.StatusForbidden:
		return errcode.Forbidden
	case http.StatusNotFound:
		return errcode.NotFound
	case http.StatusConflict:
		return errcode.AlreadyExists
	case http.StatusServiceUnavailable:
		return errcode.ServiceUnavailable
	default:
		return errcode.Internal
	}
}

// NewProblem builds the seam's problem body for a status decided outside it.
//
// The ONLY intended caller is the Huma adapter (internal/contract): Huma
// rejects malformed requests before a handler runs, so there is no error for
// Write to map, but the body must still be the one clients already parse.
//
// detail is published verbatim, so callers pass authored text only — the same
// rule apperr.WithDetail carries. Empty detail falls back to the status text.
func NewProblem(httpStatus int, detail string, fields []FieldError) Problem {
	p := newProblem(httpStatus, CodeForStatus(httpStatus))
	if detail != "" {
		p.Detail = detail
	}
	if len(fields) > 0 {
		p.Errors = fields
	}
	return p
}

// AsProblem maps err through the seam's mapping and returns the resulting
// Problem, including any authored detail.
//
// It exists for transports that decide status from a returned VALUE rather than
// by writing the response themselves — Huma being the case in hand. Without it,
// a typed handler returning a domain error gets Huma's default (500), and every
// mapping FS-0001 established silently stops applying to serialized routes: a
// not-found becomes 500, an outage becomes 500, a validation failure becomes
// 500. Found by probing a running gateway; nothing in the type system says a
// returned error is meant to carry a status.
func AsProblem(err error) Problem {
	p := mapError(err)
	if detail, ok := apperr.DetailOf(err); ok {
		p.Detail = detail
	}
	return p
}
