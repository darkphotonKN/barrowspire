package errcode_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// FS-VPD8Y R13: a domain refusal crosses gRPC as FailedPrecondition with an
// ErrorInfo whose reason is the code, so the gateway can pass it through.
func TestRefuse_CrossesGRPCAsFailedPreconditionWithTheReason(t *testing.T) {
	codesUnderTest := []errcode.Code{errcode.BagFull, errcode.StashFull, errcode.ItemNotAvailable, errcode.ItemWorn}
	for _, code := range codesUnderTest {
		t.Run(string(code), func(t *testing.T) {
			// wrapped with context, as a service layer returns it
			err := fmt.Errorf("move item: %w", errcode.Refuse(code))

			st, ok := status.FromError(err)
			if !ok || st.Code() != codes.FailedPrecondition {
				t.Fatalf("status = %v (ok %v), want FailedPrecondition", st.Code(), ok)
			}
			got, ok := errcode.RefusalReason(st)
			if !ok || got != code {
				t.Errorf("RefusalReason = %q, %v; want %q, true", got, ok, code)
			}
		})
	}
}

// The refusal survives the trip through the wire encoding: a status rebuilt
// from its proto (what a gRPC client receives) still carries the reason.
func TestRefusalReason_ReadsTheDecodedStatus(t *testing.T) {
	st, _ := status.FromError(errcode.Refuse(errcode.BagFull))
	received := status.FromProto(st.Proto())

	got, ok := errcode.RefusalReason(received)
	if !ok || got != errcode.BagFull {
		t.Errorf("RefusalReason = %q, %v; want BAG_FULL, true", got, ok)
	}
}

// R25: only a registered domain code passes through; anything else reads as
// no reason, so the caller keeps its generic mapping.
func TestRefusalReason_OnlyRegisteredReasons(t *testing.T) {
	withInfo := func(c codes.Code, reason string) *status.Status {
		st, err := status.New(c, "refused").WithDetails(&errdetails.ErrorInfo{Reason: reason, Domain: errcode.Domain})
		if err != nil {
			t.Fatalf("with details: %v", err)
		}
		return st
	}
	// a reason is only ours when the domain is: another platform's ErrorInfo
	// (a library, an upstream API) may reuse the same reason string
	foreign := func(reason string) *status.Status {
		st, err := status.New(codes.FailedPrecondition, "refused").WithDetails(&errdetails.ErrorInfo{Reason: reason, Domain: "googleapis.com"})
		if err != nil {
			t.Fatalf("with details: %v", err)
		}
		return st
	}

	tests := []struct {
		name string
		st   *status.Status
	}{
		{"no detail", status.New(codes.FailedPrecondition, "listing expired")},
		{"unknown reason", withInfo(codes.FailedPrecondition, "SOMETHING_ELSE")},
		{"a generic code is not a domain reason", withInfo(codes.FailedPrecondition, string(errcode.NotFound))},
		{"registered reason on another status code", withInfo(codes.InvalidArgument, string(errcode.BagFull))},
		{"registered reason from a foreign domain", foreign(string(errcode.BagFull))},
		{"nil status", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got, ok := errcode.RefusalReason(tt.st); ok {
				t.Errorf("RefusalReason = %q, true; want no reason", got)
			}
		})
	}
}

// Refuse takes a domain-specific code only. A generic or unregistered one is a
// programming error: it answers Internal, loudly, rather than crossing as a
// FailedPrecondition the gateway would silently degrade to FAILED_PRECONDITION.
func TestRefuse_AGenericOrUnregisteredCodeIsInternal(t *testing.T) {
	for _, code := range []errcode.Code{errcode.NotFound, errcode.FailedPrecondition, errcode.Conflict, "SOMETHING_ELSE"} {
		t.Run(string(code), func(t *testing.T) {
			err := fmt.Errorf("move item: %w", errcode.Refuse(code))

			st, ok := status.FromError(err)
			if !ok || st.Code() != codes.Internal {
				t.Fatalf("status = %v (ok %v), want Internal", st.Code(), ok)
			}
			var refusal *errcode.Refusal
			if errors.As(err, &refusal) {
				t.Errorf("errors.As found a Refusal carrying %q; a misuse must not read as a refusal", refusal.Code)
			}
		})
	}
}

// A refusal is matchable in Go too, so a service can tell its own refusal from
// an infrastructure failure without going through gRPC.
func TestRefusal_IsMatchableWithErrorsAs(t *testing.T) {
	err := fmt.Errorf("move: %w", errcode.Refuse(errcode.ItemWorn))

	var refusal *errcode.Refusal
	if !errors.As(err, &refusal) || refusal.Code != errcode.ItemWorn {
		t.Fatalf("errors.As = %v, want a Refusal carrying ITEM_WORN", refusal)
	}
}
