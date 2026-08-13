// Package wire holds transport types and helpers shared by every serialized
// route group.
//
// It exists because Huma's schema registry keys components by TYPE NAME, not by
// import path: declaring a Timestamp in both internal/gateway/auth and
// internal/gateway/item panics the generator with "duplicate name: Timestamp".
// A shared definition is not merely tidier, it is the only thing that works —
// and the collision is guaranteed to recur as more groups serialize, since they
// all mirror the same protobuf well-known types.
package wire

import "encoding/json"

// Timestamp is protobuf's timestamp as encoding/json renders it — {seconds,
// nanos}, not RFC 3339. Transcribed from the wire as it is today, not improved
// (ADR-0002 §1). Converting to RFC 3339 is a behavior change and belongs to its
// own feature.
type Timestamp struct {
	Seconds int64 `json:"seconds,omitempty" doc:"Seconds since the Unix epoch"`
	Nanos   int32 `json:"nanos,omitempty" doc:"Nanosecond offset within the second"`
}

// As converts a downstream protobuf message into its transport mirror by
// marshalling and unmarshalling through JSON.
//
// Deliberate, not lazy. A mirror's json tags are transcribed from the proto's,
// so a JSON round-trip reproduces the bytes the legacy handler produced BY
// CONSTRUCTION, including every `omitempty`. Hand-assigning a hundred-plus
// fields across a dozen types makes byte-compatibility a matter of care, at
// exactly the scale where care fails.
//
// Each group's wire tests assert the tags actually agree, so a proto
// regeneration that renames a field fails a test rather than silently drifting
// the contract.
func As[T any](src any) (*T, error) {
	raw, err := json.Marshal(src)
	if err != nil {
		return nil, err
	}
	var dst T
	if err := json.Unmarshal(raw, &dst); err != nil {
		return nil, err
	}
	return &dst, nil
}

// AsSlice is As for a repeated field. It returns an empty slice rather than nil
// so the marshalled result is [] and never null: the legacy handlers put proto
// slices on the wire, and a client iterating null breaks.
func AsSlice[T any](src any) ([]T, error) {
	raw, err := json.Marshal(src)
	if err != nil {
		return nil, err
	}
	var dst []T
	if err := json.Unmarshal(raw, &dst); err != nil {
		return nil, err
	}
	if dst == nil {
		dst = []T{}
	}
	return dst, nil
}
