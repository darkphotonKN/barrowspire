// Package contract mounts the OpenAPI layer on the gateway's existing router.
//
// It is deliberately thin. It owns three things and nothing else:
//
//   - the Huma API handle that typed handlers register against,
//   - the adapter that makes Huma's errors come out of the existing seam
//     instead of Huma's own dialect,
//   - the identity bridge, so a typed handler reads the same caller id that
//     AuthMiddleware put on the gin context.
//
// Huma is ADDED to the gateway, not substituted for it (FS-0002 §Requirements
// 1-2). The gin engine, its middleware order, and every unserialized route
// continue to work; Huma owns only the paths it registers.
package contract

import (
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/gin-gonic/gin"
)

const (
	// OpenAPIPath serves the derived document. Extension-less: Huma exposes
	// both .json and .yaml from it.
	OpenAPIPath = "/api/openapi"

	// DocsPath serves the interactive UI. Public by decision — ADR-0002 §6
	// records why, and the revisit trigger.
	DocsPath = "/api/docs"

	title   = "barrowspire gateway"
	version = "1.0.0"
)

// New mounts Huma on an existing gin engine and returns the API handle that
// typed handlers register against.
//
// Safe to call on a router that already has routes and middleware; safe to add
// legacy gin routes afterwards.
func New(router *gin.Engine) huma.API {
	config := huma.DefaultConfig(title, version)
	config.OpenAPIPath = OpenAPIPath
	config.DocsPath = DocsPath

	// Spectral requires every operation tag to be declared globally.
	config.Info.Description = "HTTP surface of the barrowspire gateway. Errors are RFC 9457 problem+json carrying a stable `code`; clients switch on `code`, never on `detail`."
	config.Tags = append(config.Tags,
		&huma.Tag{Name: "member", Description: "Member accounts, authentication, and profile"},
		&huma.Tag{Name: "items", Description: "Item templates, instances, and loadouts"},
	)

	// Drop Huma's schema-link transformer.
	//
	// It injects a "$schema" member into every serialized response body. That is
	// a useful convenience in a greenfield API and a defect in a retrofit: this
	// feature promises byte-compatible responses (FS-0002 §Requirements 16), and
	// a transformer that adds a member to EVERY body — success responses
	// included, not just errors — breaks that promise on all 29 routes at once.
	//
	// Found by the error-shape test, which compared member sets against the
	// seam's. Nothing else would have caught it until a client parsed strictly.
	//
	// Clearing config.Transformers here does not work: DefaultConfig registers
	// the transformer through a CreateHook that runs at construction time and
	// puts it back. Clearing CreateHooks instead is worse — they carry the rest
	// of Huma's setup, and without them errors serialize as Huma's native model.
	// So: append a hook that runs after the defaults and wins.
	config.CreateHooks = append(config.CreateHooks, func(c huma.Config) huma.Config {
		c.Transformers = nil
		return c
	})

	installSeamErrors()

	return humagin.New(router, config)
}

// seamError is a Huma error whose JSON body IS the seam's problem body.
//
// Embedding httperr.Problem rather than copying its fields is the point: the
// wire shape has one definition, so it cannot drift between the two paths that
// produce it.
type seamError struct {
	httperr.Problem
}

func (e seamError) GetStatus() int { return e.Status }
func (e seamError) Error() string  { return e.Detail }

// ContentType is Huma's negotiation hook. Without it Huma serves the error as
// application/json and the media type silently degrades — the exact failure
// FS-0001 §Requirements 7 calls out, and one that no client notices until it
// relies on the distinction.
func (e seamError) ContentType(ct string) string {
	if ct == "application/json" {
		return "application/problem+json"
	}
	return ct
}

// installSeamErrors replaces Huma's error constructor with one that emits the
// seam's body.
//
// Huma ships its own RFC 9457 implementation. Left alone, the gateway would
// publish two problem+json dialects that differ in `code` — the member clients
// switch on — and the difference would only appear on the error path, which is
// the path nobody exercises before shipping (FS-0002 §Requirements 8).
//
// huma.NewError is a package-level var by design; this is the documented
// extension point, not a workaround.
func installSeamErrors() {
	huma.NewError = func(status int, msg string, errs ...error) huma.StatusError {
		return seamError{Problem: httperr.NewProblem(status, detailFor(status, msg), fieldsFrom(errs))}
	}
}

// detailFor decides what prose reaches the client.
//
// 5xx never carries the message. A 5xx message originates from something that
// broke — a dial failure naming an internal host and port, a driver error
// naming a column — and FS-0001 §Requirements 9 closed exactly that leak. The
// status text is used instead, and the real message is already logged by the
// seam or the recovery middleware.
//
// 4xx does carry it: at a typed boundary a 4xx message is generated by Huma's
// validator from the request's own shape ("expected string, got number" against
// a named field), which is information the caller supplied and needs back.
func detailFor(status int, msg string) string {
	if status >= http.StatusInternalServerError {
		return ""
	}
	return msg
}

// fieldsFrom translates Huma's validation details into the seam's errors[].
//
// Huma reports Location as a JSON-pointer-ish path ("body.email"), which is
// what the client needs to attach a message to an input. Returns nil rather
// than an empty slice; NewProblem supplies the always-present empty array so
// the "never null-check errors[]" guarantee has one owner.
func fieldsFrom(errs []error) []httperr.FieldError {
	var fields []httperr.FieldError
	for _, err := range errs {
		detailer, ok := err.(huma.ErrorDetailer)
		if !ok {
			continue
		}
		detail := detailer.ErrorDetail()
		if detail == nil {
			continue
		}
		fields = append(fields, httperr.FieldError{
			Field:   detail.Location,
			Message: detail.Message,
		})
	}
	return fields
}

// SeamError converts an error returned by a typed handler into one Huma renders
// through the seam.
//
// Huma decides a handler error's status from the VALUE: anything not
// implementing huma.StatusError becomes a flat 500. So without this, every
// mapping FS-0001 established stops applying the moment a route is serialized —
// a not-found, an outage, and a validation failure all collapse into 500 with
// no code. Nothing in the type system warns about it; a running gateway does.
//
// An error that already carries a status is left alone: Huma's own boundary
// failures (422, and the 4xx it raises before a handler runs) have already been
// through installSeamErrors.
func SeamError(err error) error {
	if err == nil {
		return nil
	}
	if _, ok := err.(huma.StatusError); ok {
		return err
	}
	return seamError{Problem: httperr.AsProblem(err)}
}
