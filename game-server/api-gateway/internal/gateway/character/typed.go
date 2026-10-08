package character

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	commonauth "github.com/darkphotonKN/barrowspire-server/common/auth"
)

// Serialized character operations (FS-BDA7X §API surface). Every character
// route is typed here and protected; none remains on gin.

// ErrorFunc converts a handler's returned error into one the transport renders
// through the seam. Injected rather than imported so this package stays free of
// internal/contract.
type ErrorFunc func(error) error

// securedOp marks an operation as requiring the bearer scheme the contract
// package declares. Set by RegisterOperations.
var securedOp []map[string][]string

// toStatusError is set once by RegisterOperations. It is applied by guard to
// EVERY handler, so no individual return path can forget it.
var toStatusError ErrorFunc = func(err error) error { return err }

const tag = "characters"

func RegisterOperations(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
	errFor ErrorFunc, secured []map[string][]string,
) {
	toStatusError = errFor
	securedOp = secured

	registerCreateCharacter(api, h, protect)
	registerListMyCharacters(api, h, protect)
	registerGetCharacter(api, h, protect)
	registerDeleteCharacter(api, h, protect)
}

// byID is the path of a single character. The uuid format is the edge's shape
// check: a malformed id is a 422 and never reaches character-service.
type byID struct {
	CharacterID string `path:"characterId" format:"uuid" doc:"Character id."`
}

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

// memberID is the caller, from the token. Protected has already refused a
// request without one; this is the fail-closed backstop, never a fallback.
func memberID(ctx context.Context) (string, error) {
	caller, ok := commonauth.IdentityFromCtx(ctx)
	if !ok {
		return "", apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated")
	}
	return caller.MemberID.String(), nil
}

func registerListMyCharacters(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type output struct{ Body CharacterList }

	huma.Register(api, huma.Operation{
		OperationID: "list-my-characters",
		Description: "Lists the signed-in member's live characters, oldest first, each with its level and experience. " +
			"The member is taken from the token, never the request.",
		Errors: []int{
			http.StatusUnauthorized,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/characters",
		Summary:     "List my characters",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, _ *struct{}) (*output, error) {
		member, err := memberID(ctx)
		if err != nil {
			return nil, err
		}

		res, err := h.client.ListCharacters(ctx, &pb.ListCharactersRequest{MemberId: member})
		if err != nil {
			return nil, err
		}
		if res == nil {
			return nil, errors.New("character service returned no list")
		}

		return &output{Body: characterListFromProto(res)}, nil
	}))
}

func registerCreateCharacter(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type input struct {
		Body CharacterCreate
	}

	type output struct{ Body Character }

	huma.Register(api, huma.Operation{
		OperationID: "create-character",
		Description: "Creates a character for the signed-in member at level 1 with no experience. " +
			"The member is taken from the token, never the request. " +
			"An unknown class or an empty or over-long name is refused (400); a name already taken, in any case, answers 409.",
		DefaultStatus: http.StatusCreated,
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusConflict,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodPost,
		Path:        "/api/characters",
		Summary:     "Create a character",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		member, err := memberID(ctx)
		if err != nil {
			return nil, err
		}

		res, err := h.client.CreateCharacter(ctx, &pb.CreateCharacterRequest{
			MemberId: member,
			Name:     in.Body.Name,
			Class:    in.Body.Class,
		})
		if err != nil {
			return nil, err
		}
		if res == nil {
			return nil, errors.New("character service returned no character")
		}

		return &output{Body: characterFromProto(res)}, nil
	}))
}

func registerGetCharacter(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type output struct{ Body Character }

	huma.Register(api, huma.Operation{
		OperationID: "get-character",
		Description: "Reads one of the signed-in member's characters with its level and experience. " +
			"Another member's, a deleted, and an unknown character all answer 404.",
		Errors: []int{
			http.StatusUnauthorized,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodGet,
		Path:        "/api/characters/{characterId}",
		Summary:     "Get one of my characters",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, in *byID) (*output, error) {
		member, err := memberID(ctx)
		if err != nil {
			return nil, err
		}

		res, err := h.client.GetCharacter(ctx, &pb.GetCharacterRequest{
			MemberId:    member,
			CharacterId: in.CharacterID,
		})
		if err != nil {
			return nil, err
		}
		if res == nil {
			return nil, errors.New("character service returned no character")
		}

		return &output{Body: characterFromProto(res)}, nil
	}))
}

func registerDeleteCharacter(api huma.API, h *Handler,
	protect func(huma.Context, func(huma.Context)),
) {
	type output struct{}

	huma.Register(api, huma.Operation{
		OperationID: "delete-character",
		Description: "Deletes one of the signed-in member's characters. " +
			"Another member's, an already deleted, and an unknown character all answer 404.",
		DefaultStatus: http.StatusNoContent,
		Errors: []int{
			http.StatusUnauthorized,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
			http.StatusServiceUnavailable,
		},
		Middlewares: huma.Middlewares{protect},
		Security:    securedOp,
		Method:      http.MethodDelete,
		Path:        "/api/characters/{characterId}",
		Summary:     "Delete one of my characters",
		Tags:        []string{tag},
	}, guard(func(ctx context.Context, in *byID) (*output, error) {
		member, err := memberID(ctx)
		if err != nil {
			return nil, err
		}

		if _, err := h.client.DeleteCharacter(ctx, &pb.DeleteCharacterRequest{
			MemberId:    member,
			CharacterId: in.CharacterID,
		}); err != nil {
			return nil, err
		}

		return &output{}, nil
	}))
}
