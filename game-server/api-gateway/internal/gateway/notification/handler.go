package notification

type Handler struct {
	client NotificationClient
}

func NewHandler(client NotificationClient) *Handler {
	return &Handler{
		client: client,
	}
}
