package config

import (
	"context"
	"reflect"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/require"
)

// TestNewServicesPopulatesEveryHandlerDependency guards the wiring itself, which
// is where the CommitHold defect actually lived: the use case was constructed
// nowhere, so the handler held a nil pointer and every authenticated CommitHold
// call nil-dereferenced in production.
//
// Nothing caught it. go build and go vet pass — a nil struct pointer is a legal
// value, and only the dereference fails — and the handler tests all built their
// own dependencies rather than going through NewServices.
//
// So this reflects over the constructed Handler and fails on any nil field. It
// deliberately does not enumerate field names: a use case added to Handler but
// forgotten here is exactly the bug being guarded against, and a hardcoded list
// would have to be remembered too.
func TestNewServicesPopulatesEveryHandlerDependency(t *testing.T) {
	// NewServices only stores the handle; nothing here dials the database.
	db := &sqlx.DB{}

	services := NewServices(context.Background(), db)

	require.NotNil(t, services)
	require.NotNil(t, services.AccHandler)

	handler := reflect.ValueOf(services.AccHandler).Elem()

	for i := range handler.NumField() {
		field := handler.Type().Field(i)

		// the embedded pb.UnimplementedWalletServiceServer is a value, not a
		// dependency, and has no zero-ness worth asserting on
		if field.Anonymous {
			continue
		}

		switch handler.Field(i).Kind() {
		case reflect.Ptr, reflect.Interface:
			require.Falsef(t, handler.Field(i).IsNil(),
				"handler dependency %q was never assigned — NewServices must construct and pass it",
				field.Name)
		}
	}
}
