package slowroute

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    map[string]time.Duration
		wantErr bool
	}{
		{name: "empty is off", raw: "", want: map[string]time.Duration{}},
		{name: "one route", raw: "/api/marketplace/listings=300ms", want: map[string]time.Duration{"/api/marketplace/listings": 300 * time.Millisecond}},
		{name: "several routes with spaces", raw: " /a=1s , /b/:id=50ms ", want: map[string]time.Duration{"/a": time.Second, "/b/:id": 50 * time.Millisecond}},
		{name: "missing duration", raw: "/a", wantErr: true},
		{name: "bad duration", raw: "/a=soon", wantErr: true},
		{name: "zero duration", raw: "/a=0s", wantErr: true},
		{name: "missing route", raw: "=1s", wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Parse(tc.raw)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestMiddleware_DelaysOnlyMatchedRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Middleware(map[string]time.Duration{"/slow/:id": 80 * time.Millisecond}))
	router.GET("/slow/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
	router.GET("/fast", func(c *gin.Context) { c.Status(http.StatusOK) })

	tests := []struct {
		name    string
		path    string
		atLeast time.Duration
		under   time.Duration
	}{
		{name: "matched template sleeps", path: "/slow/42", atLeast: 80 * time.Millisecond, under: time.Second},
		{name: "other routes untouched", path: "/fast", atLeast: 0, under: 40 * time.Millisecond},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			start := time.Now()
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
			took := time.Since(start)

			assert.Equal(t, http.StatusOK, rec.Code)
			assert.GreaterOrEqual(t, took, tc.atLeast)
			assert.Less(t, took, tc.under)
		})
	}
}
