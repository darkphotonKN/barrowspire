package listing

// Handler carries the marketplace client the typed operations in typed.go
// forward to. It holds no HTTP code of its own: every marketplace route is
// registered through RegisterOperations.
type Handler struct {
	client ListingClient
}

func NewHandler(client ListingClient) *Handler {
	return &Handler{
		client: client,
	}
}
