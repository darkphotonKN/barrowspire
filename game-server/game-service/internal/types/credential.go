package types

import "log/slog"

// redacted is what a BearerToken prints as, anywhere it is printed.
const redacted = "[REDACTED]"

/**
* BearerToken is a member's own access token, as they connected with it.
*
* The world forwards it on the one call that acts as the member: loading their
* worn gear, so items-service can still check the caller owns it. It is never
* logged: it prints, slogs and marshals as a redaction, so a record holding one
* can be logged whole. string(token) is the only way to the value.
**/
type BearerToken string

func (BearerToken) String() string { return redacted }

func (BearerToken) GoString() string { return redacted }

func (BearerToken) LogValue() slog.Value { return slog.StringValue(redacted) }

func (BearerToken) MarshalText() ([]byte, error) { return []byte(redacted), nil }
