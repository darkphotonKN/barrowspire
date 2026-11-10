package character

import (
	"context"
	"net"
	"testing"
	"time"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/character"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// fakeCharacters answers GetCharacter with err and records the request. With
// stall set it accepts the call and never answers, until the caller gives up.
type fakeCharacters struct {
	pb.UnimplementedCharacterServiceServer
	err   error
	stall bool
	last  *pb.GetCharacterRequest
}

func (f *fakeCharacters) GetCharacter(ctx context.Context, req *pb.GetCharacterRequest) (*pb.Character, error) {
	f.last = req
	if f.stall {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	if f.err != nil {
		return nil, f.err
	}
	return &pb.Character{Id: req.GetCharacterId()}, nil
}

// serve runs fake on a local port and returns a Client dialled to it.
func serve(t *testing.T, fake *fakeCharacters) *Client {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	server := grpc.NewServer()
	pb.RegisterCharacterServiceServer(server, fake)
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(server.Stop)

	client, err := NewClient(listener.Addr().String())
	if err != nil {
		t.Fatalf("new client: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return client
}

func TestOwnsCharacter_AsksForTheMembersCharacter(t *testing.T) {
	fake := &fakeCharacters{}
	member, character := uuid.New(), uuid.New()

	owned, err := serve(t, fake).OwnsCharacter(context.Background(), member, character)

	if err != nil || !owned {
		t.Fatalf("owned = %v, err = %v, want true", owned, err)
	}
	if fake.last.GetMemberId() != member.String() || fake.last.GetCharacterId() != character.String() {
		t.Errorf("asked for member %s character %s", fake.last.GetMemberId(), fake.last.GetCharacterId())
	}
}

// FS-50MTX R10, R11: character-service saying no is a clean false; every other
// failure is an error, so it can never read as a 404.
func TestOwnsCharacter_SeparatesNoFromCouldNotAnswer(t *testing.T) {
	tests := []struct {
		name    string
		code    codes.Code
		wantErr bool
	}{
		{"foreign, deleted or unknown", codes.NotFound, false},
		{"malformed id", codes.InvalidArgument, false},
		{"down", codes.Unavailable, true},
		{"timed out", codes.DeadlineExceeded, true},
		{"internal", codes.Internal, true},
		{"unrecognised", codes.Unknown, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := serve(t, &fakeCharacters{err: status.Error(tt.code, "answer")})

			owned, err := client.OwnsCharacter(context.Background(), uuid.New(), uuid.New())

			if owned {
				t.Error("owned = true on a failed lookup")
			}
			if (err != nil) != tt.wantErr {
				t.Errorf("err = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// FS-50MTX R11: character-service accepting the call and then stalling must not
// hang the write. The check gives up after 3 seconds with an error, so it can
// answer 503 rather than never answering. The caller here sets a far longer
// limit, only so that a missing deadline fails this test instead of hanging it.
func TestOwnsCharacter_StalledService_GivesUpAfterThreeSeconds(t *testing.T) {
	client := serve(t, &fakeCharacters{stall: true})
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	started := time.Now()
	owned, err := client.OwnsCharacter(ctx, uuid.New(), uuid.New())
	took := time.Since(started)

	if owned || err == nil {
		t.Fatalf("owned = %v, err = %v, want an error", owned, err)
	}
	if got := status.Code(err); got != codes.DeadlineExceeded {
		t.Errorf("code = %v, want DeadlineExceeded", got)
	}
	if took < 2500*time.Millisecond || took > 4500*time.Millisecond {
		t.Errorf("gave up after %v, want about 3s", took)
	}
}

// A real transport failure: nothing listens on the port. The dial is lazy, so
// the client is built without error and only the call fails.
func TestOwnsCharacter_NothingListening_IsAnError(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	client, err := NewClient(addr)
	if err != nil {
		t.Fatalf("new client with no server: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	owned, err := client.OwnsCharacter(ctx, uuid.New(), uuid.New())

	if owned || err == nil {
		t.Fatalf("owned = %v, err = %v, want an error", owned, err)
	}
	if got := status.Code(err); got != codes.Unavailable {
		t.Errorf("code = %v, want Unavailable", got)
	}
}
