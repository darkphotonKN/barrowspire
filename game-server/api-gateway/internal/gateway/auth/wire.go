package auth

import "github.com/darkphotonKN/barrowspire-server/api-gateway/internal/wire"

// Transport types for the serialized member surface (FS-0002 slice 1).
//
// These are TRANSCRIPTIONS, not designs. Every field name, type, and
// `omitempty` here mirrors what the endpoint already puts on the wire, because
// today's responses marshal downstream protobuf structs directly and protoc
// emits `omitempty` on every scalar. Dropping an `omitempty` would add members
// to responses that currently omit them — a behavior change, which ADR-0002 §1
// forbids this feature from making.
//
// They exist as separate types rather than reusing the protobuf structs because
// ADR-0001 §5 puts downstream models off the wire: a proto regeneration must not
// be able to silently reshape the public contract.
//
// Known-ugly things transcribed on purpose, each a pioneer-log candidate:
//   - timestamps are {seconds, nanos} objects, not RFC 3339 strings;
//   - `status` on a member is an integer with no documented meaning;
//   - every success response is wrapped in a `statusCode` + `message` envelope
//     that duplicates the HTTP status.

// Member is a member as the gateway already publishes it.
type Member struct {
	ID            string          `json:"id,omitempty" doc:"Member id (UUID)"`
	Name          string          `json:"name,omitempty" doc:"Display name"`
	Email         string          `json:"email,omitempty" doc:"Email address"`
	Status        int32           `json:"status,omitempty" doc:"Account status code as stored by auth-service"`
	AverageRating float32         `json:"average_rating,omitempty" doc:"Average rating"`
	CreatedAt     *wire.Timestamp `json:"created_at,omitempty" doc:"Creation time"`
	UpdatedAt     *wire.Timestamp `json:"updated_at,omitempty" doc:"Last update time"`
	AvatarURL     string          `json:"avatar_url,omitempty" doc:"Avatar URL, empty when unset"`
	Role          string          `json:"role,omitempty" doc:"Member role"`
}

// LoginResult is the `result` member of a successful sign-in.
type LoginResult struct {
	AccessToken      string  `json:"access_token,omitempty" doc:"Bearer token for the Authorization header"`
	RefreshToken     string  `json:"refresh_token,omitempty" doc:"Refresh token"`
	AccessExpiresIn  int32   `json:"access_expires_in,omitempty" doc:"Access token lifetime in seconds"`
	RefreshExpiresIn int32   `json:"refresh_expires_in,omitempty" doc:"Refresh token lifetime in seconds"`
	MemberInfo       *Member `json:"member_info,omitempty" doc:"The signed-in member"`
}

// AvatarUploadResult is the `result` member of an avatar upload request.
type AvatarUploadResult struct {
	UploadID     string `json:"upload_id,omitempty" doc:"Correlates the request with its confirmation"`
	PresignedURL string `json:"presigned_url,omitempty" doc:"S3 URL to PUT the file to"`
	S3Key        string `json:"s3_key,omitempty" doc:"Object key"`
	// A Timestamp object, not a Unix integer — same {seconds, nanos} shape the
	// rest of this surface uses. Assumed int64 while transcribing; the compiler
	// disagreed, which is the argument for transport types over hand-checking.
	ExpiresAt           *wire.Timestamp `json:"expires_at,omitempty" doc:"Presigned URL expiry"`
	MaxFileSize         int64           `json:"max_file_size,omitempty" doc:"Maximum accepted size in bytes"`
	AllowedContentTypes []string        `json:"allowed_content_types,omitempty" doc:"Accepted content types"`
}

// ---------------------------------------------------------------------------
// Request bodies
//
// Optionality is transcribed, not corrected. Today these bind into protobuf
// structs with NO `binding:"required"` tags, so an empty body is accepted and
// the downstream decides — which is why signing in with `{}` reaches
// auth-service rather than failing at the edge. Adding `required` here would
// move a 401 to a 422 and is a behavior change (ADR-0002 §1).
//
// The exception is ConfirmAvatarUploadBody: its legacy struct already carries
// `binding:"required"`, so `required` is transcribed, not invented.
// ---------------------------------------------------------------------------

type SignupBody struct {
	Name     string `json:"name,omitempty" doc:"Display name"`
	Email    string `json:"email,omitempty" doc:"Email address"`
	Password string `json:"password,omitempty" doc:"Plaintext password"`
}

type SigninBody struct {
	Email    string `json:"email,omitempty" doc:"Email address"`
	Password string `json:"password,omitempty" doc:"Plaintext password"`
}

type UpdatePasswordBody struct {
	CurrentPassword   string `json:"current_password,omitempty" doc:"Current password"`
	NewPassword       string `json:"new_password,omitempty" doc:"New password"`
	RepeatNewPassword string `json:"repeat_new_password,omitempty" doc:"New password, repeated"`
}

type UpdateInfoBody struct {
	Name   string `json:"name,omitempty" doc:"New display name"`
	Status string `json:"status,omitempty" doc:"New status"`
}

type RequestAvatarUploadBody struct {
	Filename string `json:"filename,omitempty" doc:"Name of the file to upload"`
}

type ConfirmAvatarUploadBody struct {
	UploadID string `json:"upload_id" required:"true" doc:"The upload_id returned by the upload request"`
}

// ---------------------------------------------------------------------------
// Response envelopes
//
// Every success response carries `statusCode` and usually `message`, both
// duplicating information already in the HTTP response. Transcribed verbatim:
// removing the envelope is the deliberate shape break ADR-0001 §11 assigns to a
// client cutover, not something a wrap may do silently.
// ---------------------------------------------------------------------------

type memberEnvelope struct {
	StatusCode int     `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string  `json:"message" doc:"Human-readable summary"`
	Result     *Member `json:"result" doc:"The member"`
}

type loginEnvelope struct {
	StatusCode int          `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string       `json:"message" doc:"Human-readable summary"`
	Result     *LoginResult `json:"result" doc:"Tokens and member info"`
}

type avatarUploadEnvelope struct {
	StatusCode int                 `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string              `json:"message" doc:"Human-readable summary"`
	Result     *AvatarUploadResult `json:"result" doc:"Presigned upload details"`
}

type checkEmailEnvelope struct {
	StatusCode int  `json:"statusCode" doc:"Duplicates the HTTP status"`
	Exists     bool `json:"exists" doc:"Whether an account already uses this email"`
}

type successEnvelope struct {
	StatusCode int    `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string `json:"message" doc:"Message chosen by auth-service"`
	Success    bool   `json:"success" doc:"Whether the operation succeeded"`
}

type confirmAvatarEnvelope struct {
	StatusCode int    `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string `json:"message" doc:"Message chosen by auth-service"`
	Success    bool   `json:"success" doc:"Whether the operation succeeded"`
	AvatarURL  string `json:"avatar_url" doc:"The stored avatar URL"`
}
