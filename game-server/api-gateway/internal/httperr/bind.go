package httperr

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/go-playground/validator/v10"
)

// BindError converts a gin binding failure into an error the seam can report
// honestly.
//
// It exists because c.ShouldBindJSON does two different jobs and reports both
// through one return value: it parses bytes into a struct, and it checks the
// struct's field rules. "The body was not JSON" and "the body was JSON but
// omitted five required fields" are different failures, and a client told the
// wrong one goes looking for a malformed payload that does not exist.
//
// It also keeps the CAUSE in the chain. The parser's own message names the
// offending character or the missing fields; that detail is not client-safe, but
// it is exactly what an operator needs, and FS-0001 §Requirements 9 puts it in
// the log rather than nowhere. Passing only an authored sentence would make the
// seam log a tautology: "the error is the message I chose to display".
func BindError(err error) error {
	if err == nil {
		return nil
	}

	// Wrapped with two %w so both the sentinel (for status mapping) and the real
	// cause (for the log) stay reachable through errors.Is / errors.As.
	wrapped := fmt.Errorf("%w: %w", apperr.ErrValidation, err)

	var validationErrs validator.ValidationErrors
	if errors.As(err, &validationErrs) {
		return apperr.WithDetail(wrapped, "Required fields are missing or invalid")
	}

	var syntaxErr *json.SyntaxError
	var typeErr *json.UnmarshalTypeError
	// io.ErrUnexpectedEOF is what a TRUNCATED body produces, and it is the most
	// common malformed-JSON case of all — a request cut off mid-flight. It is a
	// distinct sentinel from io.EOF (an empty body), so matching only the latter
	// silently misclassifies the common case.
	if errors.As(err, &syntaxErr) || errors.As(err, &typeErr) ||
		errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return apperr.WithDetail(wrapped, "Request body is not valid JSON")
	}

	// Neither a parse failure nor a field-rule failure. Rather than guess, say
	// only what is certainly true; the cause is in the log either way.
	return apperr.WithDetail(wrapped, "Request body could not be processed")
}
