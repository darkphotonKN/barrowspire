package auth

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/wire"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/auth"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// MemberIDFunc reads the authenticated caller's id out of a typed handler's
// context.
//
// Passed in rather than imported so this package does not depend on
// internal/contract, which already depends on internal/httperr alongside this
// package's own use of it. The gateway wires contract.MemberID here.
type MemberIDFunc func(ctx context.Context) (string, bool)

// RegisterOperations declares the serialized member surface (FS-0002 slice 1).
//
// Every operation below is a TRANSCRIPTION of the gin handler it replaces:
// same path, same method, same status, same response members. Where the legacy
// handler and this one differ, the difference is one of the two changes
// FS-0002 §Requirements 10-11 permits, and nothing else.
//
// h and amqpClient may hold nil clients: registration records types and
// metadata, so cmd/openapi can build the document without dialing anything.
func RegisterOperations(api huma.API, h *Handler,
	memberID MemberIDFunc, protect func(huma.Context, func(huma.Context)),
	errFor ErrorFunc, secured []map[string][]string,
) {
	toStatusError = errFor
	securedOp = secured

	registerSignup(api, h)
	registerSignin(api, h)
	registerCheckEmail(api, h)
	registerGetMember(api, h, memberID, protect)
	registerUpdatePassword(api, h, memberID, protect)
	registerUpdateInfo(api, h, memberID, protect)
	registerRequestAvatarUpload(api, h, memberID, protect)
	registerConfirmAvatarUpload(api, h, memberID, protect)
}

// ErrorFunc converts a handler's returned error into one the transport renders
// through the seam. Injected rather than imported so this package stays free of
// internal/contract.
type ErrorFunc func(error) error

// toStatusError is set once by RegisterOperations. It is applied by guard to
// EVERY handler, so no individual return path can forget it — a forgotten one
// would be a silent 500 carrying no code, which is precisely the failure this
// whole feature exists to remove.
// securedOp marks an operation as requiring the bearer scheme the contract
// package declares. Set by RegisterOperations.
var securedOp []map[string][]string

var toStatusError ErrorFunc = func(err error) error { return err }

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
// context carries no caller. It mirrors what the legacy handlers produced from
// a missing `userIdStr` — 401 with an authored detail.
func unauthenticated() error {
	return apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated")
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

func registerSignup(api huma.API, h *Handler) {
	type input struct {
		Body SignupBody
	}
	type output struct{ Body memberEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "signup",
		Errors: []int{http.StatusConflict, http.StatusUnprocessableEntity,
			http.StatusServiceUnavailable, http.StatusInternalServerError},
		Method:  http.MethodPost,
		Path:    "/api/member/signup",
		Summary: "Create a new member account",
		Description: "Creates the member and returns it. The account exists by the time " +
			"this responds. An email already in use answers 409.",
		Tags:          []string{"member"},
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		// The error path needs no translation here. auth-service maps the
		// unique-email violation to ErrDuplicateResource, the interceptor maps
		// that to codes.AlreadyExists, and httperr maps that to 409. Every hop
		// already exists and is tested; signup simply could not reach it while
		// it answered before the database was touched.
		member, err := h.client.CreateMember(ctx, &pb.CreateMemberRequest{
			Name:     in.Body.Name,
			Email:    in.Body.Email,
			Password: in.Body.Password,
		})
		if err != nil {
			return nil, err
		}

		return &output{Body: memberEnvelope{
			StatusCode: http.StatusCreated,
			Message:    "Successfully created user",
			Result:     memberFromProto(member),
		}}, nil
	}))
}

func registerSignin(api huma.API, h *Handler) {
	type input struct {
		Body SigninBody
	}
	type output struct{ Body loginEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "signin",
		Errors:      []int{http.StatusUnauthorized, http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError},
		Method:      http.MethodPost,
		Path:        "/api/member/signin",
		Summary:     "Sign in and receive tokens",
		Description: "Returns an access token, a refresh token, and the member. A wrong " +
			"password and an unknown email are deliberately indistinguishable.",
		Tags: []string{"member"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.LoginMember(ctx, &pb.LoginRequest{
			Email:    in.Body.Email,
			Password: in.Body.Password,
		})
		if err != nil {
			return nil, err
		}

		return &output{Body: loginEnvelope{
			StatusCode: http.StatusOK,
			Message:    "Successfully logged in",
			Result:     loginResultFromProto(res),
		}}, nil
	}))
}

func registerCheckEmail(api huma.API, h *Handler) {
	type input struct {
		Email string `query:"email" doc:"Email address to check"`
	}
	type output struct{ Body checkEmailEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "check-email-exists",
		Errors:      []int{http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError},
		Method:      http.MethodGet,
		Path:        "/api/member/check-email",
		Summary:     "Check whether an email is already registered",
		Description: "Signup's polling companion: signup returns 202 without creating the " +
			"account, and this reports when it exists.",
		Tags: []string{"member"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		// Transcribed: the legacy handler rejected an empty query itself rather
		// than declaring the parameter required, so this is a 400 with an
		// authored detail — NOT a 422 from the boundary.
		if in.Email == "" {
			return nil, apperr.WithDetail(apperr.ErrValidation, "Email query parameter is required")
		}

		res, err := h.client.CheckEmailExists(ctx, &pb.CheckEmailRequest{Email: in.Email})
		if err != nil {
			return nil, err
		}

		return &output{Body: checkEmailEnvelope{
			StatusCode: http.StatusOK,
			Exists:     res.Exists,
		}}, nil
	}))
}

// ---------------------------------------------------------------------------
// Protected operations
// ---------------------------------------------------------------------------

func registerGetMember(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)),
) {
	type output struct{ Body memberEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "get-member",
		Description: "Returns the member identified by the bearer token. Identity never comes from the request.",
		Errors:      []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/member",
		Summary:     "Get the signed-in member",
		Tags:        []string{"member"},
	}, guard(func(ctx context.Context, _ *struct{}) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}

		member, err := h.client.GetMember(ctx, &pb.GetMemberRequest{Id: id})
		if err != nil {
			return nil, err
		}

		return &output{Body: memberEnvelope{
			StatusCode: http.StatusOK,
			Message:    "Successfully retrieved member",
			Result:     memberFromProto(member),
		}}, nil
	}))
}

func registerUpdatePassword(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		Body UpdatePasswordBody
	}
	type output struct{ Body successEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "update-member-password",
		Description: "Changes the signed-in member's password. The current password is verified by auth-service.",
		Errors:      []int{http.StatusUnauthorized, http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPatch,
		Path:        "/api/member/update-password",
		Summary:     "Change the signed-in member's password",
		Tags:        []string{"member"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}

		// Identity comes from the token, never the body (ADR-0001 §5).
		res, err := h.client.UpdateMemberPassword(ctx, &pb.UpdatePasswordRequest{
			Id:                id,
			CurrentPassword:   in.Body.CurrentPassword,
			NewPassword:       in.Body.NewPassword,
			RepeatNewPassword: in.Body.RepeatNewPassword,
		})
		if err != nil {
			return nil, err
		}

		return &output{Body: successEnvelope{
			StatusCode: http.StatusOK,
			Message:    res.Message,
			Success:    res.Success,
		}}, nil
	}))
}

func registerUpdateInfo(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		Body UpdateInfoBody
	}
	type output struct{ Body memberEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "update-member-info",
		Description: "Updates the signed-in member's display name and status, and returns the updated member.",
		Errors:      []int{http.StatusUnauthorized, http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPatch,
		Path:        "/api/member/update-info",
		Summary:     "Update the signed-in member's profile",
		Tags:        []string{"member"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}

		member, err := h.client.UpdateMemberInfo(ctx, &pb.UpdateMemberInfoRequest{
			Id:     id,
			Name:   in.Body.Name,
			Status: in.Body.Status,
		})
		if err != nil {
			return nil, err
		}

		return &output{Body: memberEnvelope{
			StatusCode: http.StatusOK,
			Message:    "Successfully updated member info",
			Result:     memberFromProto(member),
		}}, nil
	}))
}

func registerRequestAvatarUpload(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		Body RequestAvatarUploadBody
	}
	type output struct{ Body avatarUploadEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "request-avatar-upload",
		Description: "Returns a presigned S3 URL to PUT an avatar to, plus the constraints the upload must satisfy.",
		Errors:      []int{http.StatusUnauthorized, http.StatusUnprocessableEntity, http.StatusInternalServerError},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPost,
		Path:        "/api/member/avatar/upload-request",
		Summary:     "Get a presigned URL for an avatar upload",
		Tags:        []string{"member"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}

		res, err := h.client.RequestAvatarUpload(ctx, &pb.RequestAvatarUploadRequest{
			MemberId: id,
			Filename: in.Body.Filename,
		})
		if err != nil {
			return nil, err
		}

		return &output{Body: avatarUploadEnvelope{
			StatusCode: http.StatusOK,
			Message:    "Avatar upload request successful",
			Result: &AvatarUploadResult{
				UploadID:            res.UploadId,
				PresignedURL:        res.PresignedUrl,
				S3Key:               res.S3Key,
				ExpiresAt:           timestampFromProto(res.ExpiresAt),
				MaxFileSize:         res.MaxFileSize,
				AllowedContentTypes: res.AllowedContentTypes,
			},
		}}, nil
	}))
}

func registerConfirmAvatarUpload(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		Body ConfirmAvatarUploadBody
	}
	type output struct{ Body confirmAvatarEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "confirm-avatar-upload",
		Description: "Confirms a previously requested avatar upload completed, and returns the stored avatar URL.",
		Errors:      []int{http.StatusUnauthorized, http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPost,
		Path:        "/api/member/avatar/confirm",
		Summary:     "Confirm an avatar upload completed",
		Tags:        []string{"member"},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}

		res, err := h.client.ConfirmAvatarUpload(ctx, &pb.ConfirmAvatarUploadRequest{
			MemberId: id,
			UploadId: in.Body.UploadID,
		})
		if err != nil {
			return nil, err
		}

		if !res.Success {
			// Transcribed from the legacy handler: a non-success reply becomes a
			// 400, and the downstream's own message is replaced because it is not
			// client-safe (FS-0001 §Requirements 9).
			return nil, apperr.WithDetail(apperr.ErrValidation, "Avatar upload could not be confirmed")
		}

		return &output{Body: confirmAvatarEnvelope{
			StatusCode: http.StatusOK,
			Message:    res.Message,
			Success:    res.Success,
			AvatarURL:  res.AvatarUrl,
		}}, nil
	}))
}

// ---------------------------------------------------------------------------
// Downstream → transport
// ---------------------------------------------------------------------------

func memberFromProto(m *pb.Member) *Member {
	if m == nil {
		return nil
	}
	return &Member{
		ID:            m.Id,
		Name:          m.Name,
		Email:         m.Email,
		Status:        m.Status,
		AverageRating: m.AverageRating,
		CreatedAt:     timestampFromProto(m.CreatedAt),
		UpdatedAt:     timestampFromProto(m.UpdatedAt),
		AvatarURL:     m.AvatarUrl,
		Role:          m.Role,
	}
}

func loginResultFromProto(r *pb.LoginResponse) *LoginResult {
	if r == nil {
		return nil
	}
	return &LoginResult{
		AccessToken:      r.AccessToken,
		RefreshToken:     r.RefreshToken,
		AccessExpiresIn:  r.AccessExpiresIn,
		RefreshExpiresIn: r.RefreshExpiresIn,
		MemberInfo:       memberFromProto(r.MemberInfo),
	}
}

// timestampFromProto preserves the {seconds, nanos} shape the wire already
// carries. Converting to RFC 3339 here would be an improvement, and therefore a
// behavior change this feature may not make (ADR-0002 §1).
func timestampFromProto(ts *timestamppb.Timestamp) *wire.Timestamp {
	if ts == nil {
		return nil
	}
	return &wire.Timestamp{Seconds: ts.Seconds, Nanos: ts.Nanos}
}
