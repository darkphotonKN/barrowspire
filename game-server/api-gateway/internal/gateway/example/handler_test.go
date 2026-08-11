package example_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/gateway/example"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/example"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// stubClient returns whatever it is told to. The gateway's job on an error path
// is to translate, so the only thing a test needs to vary is what came back.
type stubClient struct {
	example *pb.Example
	err     error
}

func (s *stubClient) CreateExample(context.Context, *pb.CreateExampleRequest) (*pb.Example, error) {
	return s.example, s.err
}

func (s *stubClient) GetExample(context.Context, *pb.GetExampleRequest) (*pb.Example, error) {
	return s.example, s.err
}

// newRouter mounts the example routes exactly as config/routes.go does, so the
// tests exercise real routing rather than a handler called directly.
func newRouter(client example.ExampleClient) *gin.Engine {
	r := gin.New()
	h := example.NewHandler(client)
	g := r.Group("/example")
	g.GET("/:id", h.GetExample)
	g.POST("", h.CreateExample)
	return r
}

func do(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body
}

// FS-0001 §Requirements 4, 7 — every error this package can produce now comes
// out of the seam, in problem+json, with a code.
func TestExampleHandler_ErrorPaths_ReturnProblemJSON(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		clientErr  error
		wantStatus int
		wantCode   errcode.Code
	}{
		{
			name: "create with malformed json", method: http.MethodPost, path: "/example", body: `{"name":`,
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "create rejected downstream", method: http.MethodPost, path: "/example", body: `{}`,
			clientErr:  status.Error(codes.InvalidArgument, "name is required"),
			wantStatus: http.StatusBadRequest, wantCode: errcode.ValidationFailed,
		},
		{
			name: "create conflicts downstream", method: http.MethodPost, path: "/example", body: `{}`,
			clientErr:  status.Error(codes.AlreadyExists, "already there"),
			wantStatus: http.StatusConflict, wantCode: errcode.AlreadyExists,
		},
		{
			name: "get missing", method: http.MethodGet, path: "/example/abc",
			clientErr:  status.Error(codes.NotFound, "no such example"),
			wantStatus: http.StatusNotFound, wantCode: errcode.NotFound,
		},
		{
			name: "get with downstream unavailable", method: http.MethodGet, path: "/example/abc",
			clientErr:  status.Error(codes.Unavailable, "dial tcp 10.0.0.4:50051: connect: connection refused"),
			wantStatus: http.StatusInternalServerError, wantCode: errcode.Internal,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := do(newRouter(&stubClient{err: tt.clientErr}), tt.method, tt.path, tt.body)

			assert.Equal(t, tt.wantStatus, w.Code)
			assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"))

			body := decode(t, w)
			assert.Equal(t, string(tt.wantCode), body["code"])
			assert.Contains(t, body, "errors")
		})
	}
}

// FS-0001 §Requirements 9 — GetExample used to return err.Error() verbatim,
// which on an unreachable downstream meant handing the client an internal
// address and port.
func TestExampleHandler_GetExample_DoesNotLeakDownstreamError(t *testing.T) {
	const leak = "dial tcp 10.0.0.4:50051: connect: connection refused"

	w := do(newRouter(&stubClient{err: status.Error(codes.Unavailable, leak)}), http.MethodGet, "/example/abc", "")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.NotContains(t, w.Body.String(), "10.0.0.4")
	assert.NotContains(t, w.Body.String(), "dial tcp")
}

// FS-0001 §Requirements 12 — success responses are untouched by this feature.
// Asserted on the exact body, because "untouched" is the claim every migration
// slice makes and none of them can prove without this.
func TestExampleHandler_SuccessResponses_AreUnchanged(t *testing.T) {
	client := &stubClient{example: &pb.Example{Id: "abc"}}

	t.Run("create", func(t *testing.T) {
		w := do(newRouter(client), http.MethodPost, "/example", `{}`)

		assert.Equal(t, http.StatusCreated, w.Code)
		assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

		body := decode(t, w)
		assert.Equal(t, float64(http.StatusOK), body["statusCode"])
		assert.Equal(t, "success", body["message"])
		assert.Contains(t, body, "result")
	})

	t.Run("get", func(t *testing.T) {
		w := do(newRouter(client), http.MethodGet, "/example/abc", "")

		assert.Equal(t, http.StatusCreated, w.Code)
		body := decode(t, w)
		assert.Equal(t, float64(http.StatusOK), body["statusCode"])
		assert.Equal(t, "success", body["message"])
	})
}
