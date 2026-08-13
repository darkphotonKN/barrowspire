// This file is a FIXTURE. It is deliberately wrong, and it exists so the seam
// gate can be observed rejecting something.
//
// It is never compiled: contract-fixtures/ sits beside the modules listed in
// go.work, not inside one, so `go build ./...` never reaches it.
package thing

import (
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/gin-gonic/gin"
)

// VIOLATION 1: decides an error status outside the seam.
func (h *Handler) GetThing(c *gin.Context) {
	thing, err := h.client.GetThing(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "boom"})
		return
	}
	c.JSON(http.StatusOK, thing)
}

// VIOLATION 2: publishes a downstream message to the client.
func (h *Handler) CreateThing(c *gin.Context) {
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, "CreateThing", apperr.WithDetail(apperr.ErrValidation, err.Error()))
		return
	}
}
