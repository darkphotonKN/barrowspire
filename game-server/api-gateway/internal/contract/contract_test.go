package contract_test

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/contract"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/testsupport"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/darkphotonKN/barrowspire-server/common/errcode"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

// failing mounts one typed operation that returns build(), and returns the
// recorded response.
//
// build is a FUNCTION, not an error, and that matters: huma.NewError is a
// package-level var replaced at mount time, so an error value constructed before
// contract.New runs carries Huma's native model instead of the seam's. Taking a
// factory forces construction inside the handler, which is when a real one is
// built.
func failing(t *testing.T, build func() error) map[string]any {
	t.Helper()
	r := gin.New()
	api := contract.New(r)
	huma.Register(api, huma.Operation{
		OperationID: "boom", Method: http.MethodGet, Path: "/boom",
	}, func(ctx context.Context, _ *struct{}) (*struct{}, error) {
		return nil, build()
	})

	w := testsupport.Do(r, http.MethodGet, "/boom", "")
	assert.Equal(t, "application/problem+json", w.Header().Get("Content-Type"),
		"a typed handler must not degrade to application/json")

	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// FS-0002 §Requirements 8. Huma ships its own RFC 9457 error format. If it is
// left in place, the gateway ends up with two problem+json dialects that differ
// in exactly the member clients switch on — and the difference only shows up on
// the error path, which is the path nobody exercises before shipping.
func TestError_ShapeIsIdenticalToTheSeam(t *testing.T) {
	seamCtx, seamRec := testsupport.NewCtx()
	httperr.Write(seamCtx, "Reference", apperr.ErrValidation)

	var seamBody map[string]any
	require.NoError(t, json.Unmarshal(seamRec.Body.Bytes(), &seamBody))

	humaBody := failing(t, func() error { return huma.Error400BadRequest("whatever huma says") })

	assert.Equal(t, keys(seamBody), keys(humaBody),
		"the two error paths must publish the same members")
	assert.Equal(t, seamBody["code"], humaBody["code"])
	assert.Equal(t, seamBody["status"], humaBody["status"])
}

// FS-0002 §Requirements 10. 422 is new: ADR-0001 §7 reserves it for shape
// failures at a typed boundary, and FS-0001 recorded that it "does not appear
// until Huma is mounted". It must still carry a code the client can switch on.
func TestError_UnprocessableEntity_CarriesValidationCode(t *testing.T) {
	body := failing(t, func() error { return huma.Error422UnprocessableEntity("bad shape") })

	assert.Equal(t, float64(http.StatusUnprocessableEntity), body["status"])
	assert.Equal(t, string(errcode.ValidationFailed), body["code"])
}

// FS-0001 §Requirements 8 — errors[] is always present so clients never
// null-check before iterating. Huma omits its detail list when empty.
func TestError_ErrorsMemberIsAlwaysAnArray(t *testing.T) {
	body := failing(t, func() error { return huma.Error500InternalServerError("no field detail here") })

	errs, ok := body["errors"].([]any)
	require.True(t, ok, "errors must be an array, got %T", body["errors"])
	assert.Empty(t, errs)
}

// FS-0001 §Requirements 9 — no downstream or internal text reaches the client.
// Huma puts the handler's message straight into its response by default.
func TestError_InternalMessage_NeverReachesTheClient(t *testing.T) {
	body := failing(t, func() error {
		return huma.Error500InternalServerError("dial tcp 10.0.3.14:7116: connection refused")
	})

	detail, _ := body["detail"].(string)
	assert.NotContains(t, detail, "10.0.3.14")
	assert.NotContains(t, detail, "connection refused")
}

// The docs UI is the feature's first acceptance condition, and it is public by
// decision (ADR-0002 §6) — so it must render without credentials.
func TestDocs_AreServedPublicly(t *testing.T) {
	r := gin.New()
	contract.New(r)

	assert.Equal(t, http.StatusOK, testsupport.Do(r, http.MethodGet, contract.DocsPath, "").Code)
	assert.Equal(t, http.StatusOK, testsupport.Do(r, http.MethodGet, contract.OpenAPIPath+".yaml", "").Code)
}

// FS-0002 §Requirements 1-2: Huma is added to the gateway, not substituted for
// it. A legacy gin route registered on the same engine keeps working.
func TestMount_LeavesLegacyGinRoutesAlone(t *testing.T) {
	r := gin.New()
	contract.New(r)
	r.POST("/webhook/stripe", func(c *gin.Context) { c.String(http.StatusOK, "legacy") })

	w := testsupport.Do(r, http.MethodPost, "/webhook/stripe", "")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "legacy", w.Body.String())
}
