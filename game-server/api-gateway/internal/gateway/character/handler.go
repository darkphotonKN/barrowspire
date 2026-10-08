package character

// Handler holds the character-service client the typed operations close over.
//
// The legacy gin POST /api/character/ and its handlers are gone: FS-BDA7X
// replaced them with the typed, authenticated operations in typed.go
// (ADR-0002 §5), so no gin route owns a character path.
type Handler struct {
	client CharacterClient
}

func NewHandler(client CharacterClient) *Handler {
	return &Handler{
		client: client,
	}
}
