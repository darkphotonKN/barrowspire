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

// fieldError is one entry in a problemDetail's Errors slice.
type fieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// problemDetail is an RFC 9457 problem detail. Member semantics are pinned by
// FS-0001 §API surface.
type problemDetail struct {
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
func mapError(err error) problemDetail {
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
	}

	return newProblem(http.StatusInternalServerError, errcode.Internal)
}

// newProblem builds a problemDetail with the members that follow mechanically from a
// status and a code. Detail defaults to the status text: downstream error
// prose is never client-safe (FS-0001 §Requirements 9), so the default has to
// be something that carries no information about internals.
func newProblem(httpStatus int, code errcode.Code) problemDetail {
	return problemDetail{
		Type:   "about:blank",
		Title:  http.StatusText(httpStatus),
		Status: httpStatus,
		Detail: http.StatusText(httpStatus),
		Code:   code,
		Errors: []fieldError{},
	}
}
