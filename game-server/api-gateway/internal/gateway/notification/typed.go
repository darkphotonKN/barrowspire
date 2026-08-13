package notification

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/wire"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/notification"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
)

type MemberIDFunc func(ctx context.Context) (string, bool)
type ErrorFunc func(error) error

// securedOp marks an operation as requiring the bearer scheme the contract
// package declares. Set by RegisterOperations.
var securedOp []map[string][]string

var toStatusError ErrorFunc = func(err error) error { return err }

// guard routes every handler's error through the seam; see the member group.
func guard[I, O any](fn func(context.Context, *I) (*O, error)) func(context.Context, *I) (*O, error) {
	return func(ctx context.Context, in *I) (*O, error) {
		out, err := fn(ctx, in)
		if err != nil {
			return nil, toStatusError(err)
		}
		return out, nil
	}
}

func unauthenticated() error {
	return apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated")
}

// Notification mirrors pb.NotificationList. Data is a free-form object
// (structpb.Struct on the wire), so it is map[string]any here.
type Notification struct {
	ID               string          `json:"id,omitempty" doc:"Notification id"`
	UserID           string          `json:"user_id,omitempty" doc:"Recipient member id"`
	Title            string          `json:"title,omitempty" doc:"Short title"`
	Message          string          `json:"message,omitempty" doc:"Body text"`
	NotificationType string          `json:"notification_type,omitempty" doc:"Category, e.g. friend"`
	EventType        string          `json:"event_type,omitempty" doc:"Originating event, e.g. match.ended"`
	Read             bool            `json:"read,omitempty" doc:"Whether the recipient has read it"`
	Data             map[string]any  `json:"data,omitempty" doc:"Free-form payload"`
	CreatedAt        *wire.Timestamp `json:"created_at,omitempty" doc:"Creation time"`
	UpdatedAt        *wire.Timestamp `json:"updated_at,omitempty" doc:"Last update time"`
}

// Envelopes, transcribed. The list response names its payload `notifications`
// and carries `total`; it does not use `result`.
type listEnvelope struct {
	StatusCode    int             `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message       string          `json:"message" doc:"Human-readable summary"`
	Notifications []*Notification `json:"notifications" doc:"The member's notifications"`
	Total         int32           `json:"total" doc:"Total notifications available"`
}

type readEnvelope struct {
	StatusCode int    `json:"statusCode" doc:"Duplicates the HTTP status"`
	Success    bool   `json:"success" doc:"Whether the update succeeded"`
	Message    string `json:"message" doc:"Message chosen by notification-service"`
}

var errsAuthed = []int{http.StatusUnauthorized, http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError}

// RegisterOperations declares the serialized notification surface (FS-0002
// slice 3). All three routes are JWT-protected.
func RegisterOperations(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)), errFor ErrorFunc,
	secured []map[string][]string,
) {
	toStatusError = errFor
	securedOp = secured
	mw := huma.Middlewares{protect}

	type listOut struct{ Body listEnvelope }
	huma.Register(api, huma.Operation{
		OperationID: "list-notifications",
		Method:      http.MethodGet,
		Path:        "/api/notification/",
		Summary:     "List the signed-in member's notifications",
		Description: "Returns the member's notifications and the total available.",
		Tags:        []string{"notification"},
		Middlewares: mw, Security: securedOp, Errors: errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*listOut, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.GetNotification(ctx, &pb.NotificationRequest{UserId: id})
		if err != nil {
			return nil, err
		}
		items, err := wire.AsSlice[*Notification](res.Notifications)
		if err != nil {
			return nil, err
		}
		return &listOut{Body: listEnvelope{
			StatusCode: http.StatusOK, Message: "Successfully retrieved notifications",
			Notifications: items, Total: res.Total,
		}}, nil
	}))

	type readIn struct {
		ID string `path:"id" doc:"Notification id"`
	}
	type readOut struct{ Body readEnvelope }
	huma.Register(api, huma.Operation{
		OperationID: "mark-notification-read",
		Method:      http.MethodPatch,
		Path:        "/api/notification/{id}/read",
		Summary:     "Mark one notification as read",
		Description: "Marks a single notification belonging to the signed-in member as read.",
		Tags:        []string{"notification"},
		Middlewares: mw, Security: securedOp, Errors: errsAuthed,
	}, guard(func(ctx context.Context, in *readIn) (*readOut, error) {
		// Transcribed: the legacy handler rejected an empty id itself.
		if in.ID == "" {
			return nil, apperr.WithDetail(apperr.ErrValidation, "Notification ID is required")
		}
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.MarkNotificationAsRead(ctx, &pb.MarkNotificationAsReadRequest{
			NotificationId: in.ID, UserId: id,
		})
		if err != nil {
			return nil, err
		}
		return &readOut{Body: readEnvelope{
			StatusCode: http.StatusOK, Success: res.Success, Message: res.Message,
		}}, nil
	}))

	type allOut struct{ Body readEnvelope }
	huma.Register(api, huma.Operation{
		OperationID: "mark-all-notifications-read",
		Method:      http.MethodPatch,
		Path:        "/api/notification/read-all",
		Summary:     "Mark every notification as read",
		Description: "Marks all of the signed-in member's notifications as read.",
		Tags:        []string{"notification"},
		Middlewares: mw, Security: securedOp, Errors: errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*allOut, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.MarkAllNotificationsAsRead(ctx, &pb.MarkAllNotificationsAsReadRequest{UserId: id})
		if err != nil {
			return nil, err
		}
		return &allOut{Body: readEnvelope{
			StatusCode: http.StatusOK, Success: res.Success, Message: res.Message,
		}}, nil
	}))
}
