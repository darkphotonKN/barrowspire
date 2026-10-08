package character

import (
	"context"
	"io"
	"log/slog"
	"net"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
	"github.com/darkphotonKN/barrowspire-server/common/interceptor"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

// stubService answers with canned results so the test pins the wire mapping
// and the error codes the Status interceptor produces.
type stubService struct {
	character *Character
	list      []*Character
	err       error
}

func (s *stubService) CreateCharacter(ctx context.Context, in CharacterCreate) (*Character, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &Character{ID: uuid.New(), PlayerID: in.MemberID, ClassID: in.Class, Name: in.Name, Level: 1, CreatedAt: time.Now()}, nil
}

func (s *stubService) ListCharacters(ctx context.Context, memberID uuid.UUID) ([]*Character, error) {
	return s.list, s.err
}

func (s *stubService) GetCharacter(ctx context.Context, memberID, id uuid.UUID) (*Character, error) {
	return s.character, s.err
}

func (s *stubService) DeleteCharacter(ctx context.Context, memberID, id uuid.UUID) error {
	return s.err
}

func dial(t *testing.T, svc Service) pb.CharacterServiceClient {
	t.Helper()
	lis := bufconn.Listen(1 << 20)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := grpc.NewServer(grpc.ChainUnaryInterceptor(interceptor.Recovery(logger), interceptor.Status(logger)))
	pb.RegisterCharacterServiceServer(srv, NewHandler(svc))
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)

	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) { return lis.DialContext(ctx) }),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return pb.NewCharacterServiceClient(conn)
}

func TestCreateCharacter_FreshCharacter_Level1Floor0Next100(t *testing.T) {
	client := dial(t, &stubService{})
	member := uuid.New().String()

	got, err := client.CreateCharacter(context.Background(), &pb.CreateCharacterRequest{MemberId: member, Name: "Aldric", Class: "warrior"})

	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if got.GetName() != "Aldric" || got.GetClass() != "warrior" || got.GetLevel() != 1 || got.GetExperience() != 0 {
		t.Fatalf("got %+v", got)
	}
	if got.GetLevelFloor() != 0 || got.NextLevelAt == nil || got.GetNextLevelAt() != 100 {
		t.Fatalf("floor %d next %v, want 0 / 100", got.GetLevelFloor(), got.NextLevelAt)
	}
	if _, err := uuid.Parse(got.GetId()); err != nil || got.GetCreatedAt() == nil {
		t.Fatalf("id %q created_at %v", got.GetId(), got.GetCreatedAt())
	}
}

func TestGetCharacter_AtCap_NextLevelAtUnset(t *testing.T) {
	client := dial(t, &stubService{character: &Character{ID: uuid.New(), Level: 20, Exp: 1_000_000}})

	got, err := client.GetCharacter(context.Background(), &pb.GetCharacterRequest{MemberId: uuid.NewString(), CharacterId: uuid.NewString()})

	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.GetLevel() != 20 || got.GetExperience() != 1_000_000 || got.GetLevelFloor() != 38530 || got.NextLevelAt != nil {
		t.Fatalf("got level %d exp %d floor %d next %v", got.GetLevel(), got.GetExperience(), got.GetLevelFloor(), got.NextLevelAt)
	}
}

func TestListCharacters_MapsEveryCharacterInOrder(t *testing.T) {
	client := dial(t, &stubService{list: []*Character{
		{ID: uuid.New(), Name: "first", Level: 1},
		{ID: uuid.New(), Name: "second", Level: 5, Exp: 650},
	}})

	got, err := client.ListCharacters(context.Background(), &pb.ListCharactersRequest{MemberId: uuid.NewString()})

	if err != nil {
		t.Fatalf("list: %v", err)
	}
	cs := got.GetCharacters()
	if len(cs) != 2 || cs[0].GetName() != "first" || cs[1].GetName() != "second" || cs[1].GetLevelFloor() != 600 || cs[1].GetNextLevelAt() != 870 {
		t.Fatalf("got %+v", cs)
	}
}

func TestHandler_ErrorCodes(t *testing.T) {
	member, id := uuid.NewString(), uuid.NewString()
	tests := []struct {
		name string
		err  error
		call func(pb.CharacterServiceClient) error
		want codes.Code
	}{
		{"create invalid", commonconstants.ErrInvalidInput, func(c pb.CharacterServiceClient) error {
			_, err := c.CreateCharacter(context.Background(), &pb.CreateCharacterRequest{MemberId: member, Name: "", Class: "warrior"})
			return err
		}, codes.InvalidArgument},
		{"create taken name", commonconstants.ErrDuplicateResource, func(c pb.CharacterServiceClient) error {
			_, err := c.CreateCharacter(context.Background(), &pb.CreateCharacterRequest{MemberId: member, Name: "aldric", Class: "warrior"})
			return err
		}, codes.AlreadyExists},
		{"create with non-uuid member", nil, func(c pb.CharacterServiceClient) error {
			_, err := c.CreateCharacter(context.Background(), &pb.CreateCharacterRequest{MemberId: "nope", Name: "a", Class: "warrior"})
			return err
		}, codes.InvalidArgument},
		{"get not found", commonconstants.ErrNotFound, func(c pb.CharacterServiceClient) error {
			_, err := c.GetCharacter(context.Background(), &pb.GetCharacterRequest{MemberId: member, CharacterId: id})
			return err
		}, codes.NotFound},
		{"get non-uuid character", nil, func(c pb.CharacterServiceClient) error {
			_, err := c.GetCharacter(context.Background(), &pb.GetCharacterRequest{MemberId: member, CharacterId: "nope"})
			return err
		}, codes.InvalidArgument},
		{"delete not found", commonconstants.ErrNotFound, func(c pb.CharacterServiceClient) error {
			_, err := c.DeleteCharacter(context.Background(), &pb.DeleteCharacterRequest{MemberId: member, CharacterId: id})
			return err
		}, codes.NotFound},
		{"list with no member", nil, func(c pb.CharacterServiceClient) error {
			_, err := c.ListCharacters(context.Background(), &pb.ListCharactersRequest{})
			return err
		}, codes.InvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := dial(t, &stubService{err: tt.err})

			err := tt.call(client)

			if got := status.Code(err); got != tt.want {
				t.Fatalf("code = %v (%v), want %v", got, err, tt.want)
			}
		})
	}
}

func TestDeleteCharacter_Success_ReturnsEmpty(t *testing.T) {
	client := dial(t, &stubService{})

	if _, err := client.DeleteCharacter(context.Background(), &pb.DeleteCharacterRequest{MemberId: uuid.NewString(), CharacterId: uuid.NewString()}); err != nil {
		t.Fatalf("delete: %v", err)
	}
}
