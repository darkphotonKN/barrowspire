package item

import (
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	client ItemClient
}

func NewHandler(client ItemClient) *Handler {
	return &Handler{
		client: client,
	}
}

func (h *Handler) CreateWeaponHandler(c *gin.Context) {
	const op = "CreateWeaponHandler"
	var req pb.CreateWeaponRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httperr.Write(c, op, httperr.BindError(err))
		return
	}

	weapon, err := h.client.CreateWeapon(c.Request.Context(), &req)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Weapon created successfully",
		"result":     weapon,
	})
}

func (h *Handler) ListWeaponsWithTemplateHandler(c *gin.Context) {
	const op = "ListWeaponsWithTemplateHandler"
	response, err := h.client.ListWeaponsWithTemplate(c.Request.Context())
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Weapons retrieved successfully",
		"weapons":    response.Weapons,
	})
}

// ListItemTypesHandler returns all item types for dropdown options
func (h *Handler) ListItemTypesHandler(c *gin.Context) {
	const op = "ListItemTypesHandler"
	// Call items-service to get item types
	itemTypes, err := h.client.ListItemTypes(c.Request.Context())
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Item types retrieved successfully",
		"result":     itemTypes.ItemTypes,
	})
}

// ListItemRaritiesHandler returns all item rarities for dropdown options
func (h *Handler) ListItemRaritiesHandler(c *gin.Context) {
	const op = "ListItemRaritiesHandler"
	// Call items-service to get item rarities
	rarities, err := h.client.ListItemRarities(c.Request.Context())
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Item rarities retrieved successfully",
		"result":     rarities.ItemRarities,
	})
}
