package errcode

import (
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Domain is the ErrorInfo domain every refusal carries: the platform, not one
// service, since a code means the same thing whichever service decides it.
const Domain = "barrowspire"

// Refusal is a domain rule refusing a request: the request was well formed,
// the resource's own state says no. The owning service decides it (ADR-0001
// §6); the code says which rule.
//
// It crosses gRPC as FailedPrecondition with a google.rpc.ErrorInfo whose
// reason is the code (FS-VPD8Y R13). It implements GRPCStatus, so the gRPC
// server encodes it however it is returned; a handler should still return
// GRPCStatus().Err() rather than a wrapped chain, since gRPC puts a wrapped
// error's whole text on the wire as the message.
type Refusal struct {
	Code Code
}

// Refuse returns the refusal for code, one of the domain-specific codes.
//
// A generic or unregistered code is a programming error, not a refusal: the
// gateway would not pass it through and the client would see a bare
// FAILED_PRECONDITION. So it answers Internal instead, loud in any test that
// reaches it, and is not a *Refusal, so no caller mistakes it for one.
func Refuse(code Code) error {
	if _, registered := domainCodes[code]; !registered {
		return status.Error(codes.Internal, "refuse: "+string(code)+" is not a registered domain code")
	}
	return &Refusal{Code: code}
}

func (r *Refusal) Error() string {
	return "refused: " + string(r.Code)
}

// GRPCStatus is the refusal on the wire. The message is the code alone, so no
// service context leaks into it.
func (r *Refusal) GRPCStatus() *status.Status {
	st := status.New(codes.FailedPrecondition, string(r.Code))
	withInfo, err := st.WithDetails(&errdetails.ErrorInfo{Reason: string(r.Code), Domain: Domain})
	if err != nil {
		// only a marshal failure of a two-string message; the bare status
		// still answers FailedPrecondition
		return st
	}
	return withInfo
}

// RefusalReason reads the domain code a received status carries: a
// FailedPrecondition with an ErrorInfo in this platform's Domain whose reason
// is a registered domain-specific code. Any other status, detail, domain or
// reason answers false, and the caller keeps its generic mapping (FS-VPD8Y
// R25).
func RefusalReason(st *status.Status) (Code, bool) {
	if st == nil || st.Code() != codes.FailedPrecondition {
		return "", false
	}
	for _, detail := range st.Details() {
		info, ok := detail.(*errdetails.ErrorInfo)
		if !ok || info.GetDomain() != Domain {
			continue
		}
		if _, registered := domainCodes[Code(info.GetReason())]; registered {
			return Code(info.GetReason()), true
		}
	}
	return "", false
}
