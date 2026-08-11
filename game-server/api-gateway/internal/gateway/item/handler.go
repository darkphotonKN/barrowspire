package item

import (
	"log"
	"net/http"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
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
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Request body is not valid JSON"))
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

// CreateItemTemplateHandler 創建物品模板
// 重要：這個方法會觸發 RabbitMQ 事件，發送通知給管理員
func (h *Handler) CreateItemTemplateHandler(c *gin.Context) {
	const op = "CreateItemTemplateHandler"
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	var httpReq struct {
		ItemName      string `json:"item_name" binding:"required"`
		ItemCode      string `json:"item_code" binding:"required"`
		TypeID        string `json:"type_id" binding:"required"`
		RarityID      string `json:"rarity_id" binding:"required"`
		ItemType      string `json:"item_type" binding:"required"`
		ItemID        string `json:"item_id" binding:"required"`
		IconURL       string `json:"icon_url"`
		RequiredLevel *int32 `json:"required_level"`
		BaseSellPrice *int32 `json:"base_sell_price"`
		BaseBuyPrice  *int32 `json:"base_buy_price"`
	}

	if err := c.ShouldBindJSON(&httpReq); err != nil {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Request body is not valid JSON"))
		return
	}

	grpcReq := &pb.CreateItemTemplateRequest{
		UserId:   userIdStr.(string),
		ItemName: httpReq.ItemName,
		RarityId: httpReq.RarityID,
		ItemType: httpReq.ItemType,
		ItemId:   httpReq.ItemID,
	}

	if httpReq.IconURL != "" {
		grpcReq.IconUrl = &httpReq.IconURL
	}
	if httpReq.RequiredLevel != nil {
		grpcReq.RequiredLevel = httpReq.RequiredLevel
	}
	if httpReq.BaseSellPrice != nil {
		grpcReq.BaseSellPrice = httpReq.BaseSellPrice
	}
	if httpReq.BaseBuyPrice != nil {
		grpcReq.BaseBuyPrice = httpReq.BaseBuyPrice
	}

	template, err := h.client.CreateItemTemplate(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Item template created successfully. Notification sent to admins.",
		"result":     template,
	})
}

// CreateCompleteWeaponHandler creates a complete weapon (weapon + template) in one request
func (h *Handler) CreateCompleteWeaponHandler(c *gin.Context) {
	const op = "CreateCompleteWeaponHandler"
	// 1. Extract userId from JWT
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	// 2. Parse JSON body
	var httpReq struct {
		// Template fields
		ItemName      string  `json:"item_name" binding:"required"`
		ItemCode      string  `json:"item_code" binding:"required"`
		IconURL       *string `json:"icon_url"`
		RequiredLevel *int32  `json:"required_level"`
		BaseSellPrice *int32  `json:"base_sell_price"`
		BaseBuyPrice  *int32  `json:"base_buy_price"`

		// Weapon fields
		TypeID       string  `json:"type_id" binding:"required"`
		RarityID     string  `json:"rarity_id" binding:"required"`
		AttackPower  int32   `json:"attack_power" binding:"required"`
		Durability   int32   `json:"durability" binding:"required"`
		CriticalRate float32 `json:"critical_rate"`
		WeaponType   string  `json:"weapon_type"`
		Description  string  `json:"description"`
	}

	if err := c.ShouldBindJSON(&httpReq); err != nil {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Request body is not valid JSON"))
		return
	}

	// 3. Build gRPC request
	grpcReq := &pb.CreateCompleteWeaponRequest{
		UserId:   userIdStr.(string),
		ItemName: httpReq.ItemName,

		RarityId:    httpReq.RarityID,
		AttackPower: httpReq.AttackPower,

		CriticalRate: httpReq.CriticalRate,
		WeaponType:   httpReq.WeaponType,
		Description:  httpReq.Description,
	}

	// Handle optional fields
	if httpReq.IconURL != nil {
		grpcReq.IconUrl = httpReq.IconURL
	}
	if httpReq.RequiredLevel != nil {
		grpcReq.RequiredLevel = httpReq.RequiredLevel
	}
	if httpReq.BaseSellPrice != nil {
		grpcReq.BaseSellPrice = httpReq.BaseSellPrice
	}
	if httpReq.BaseBuyPrice != nil {
		grpcReq.BaseBuyPrice = httpReq.BaseBuyPrice
	}

	// 4. Call items-service (will create weapon, create template, send RabbitMQ)
	weaponDetail, err := h.client.CreateCompleteWeapon(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	// 5. Success response
	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Complete weapon created successfully. Notification sent to admins.",
		"result":     weaponDetail,
	})
}

// CreateCompleteArmorHandler creates a complete armor (armor + template) in one request
func (h *Handler) CreateCompleteArmorHandler(c *gin.Context) {
	const op = "CreateCompleteArmorHandler"
	// 1. Extract userId from JWT
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	// 2. Parse JSON body
	var httpReq struct {
		// Template fields
		ItemName      string  `json:"item_name" binding:"required"`
		ItemCode      string  `json:"item_code" binding:"required"`
		IconURL       *string `json:"icon_url"`
		RequiredLevel *int32  `json:"required_level"`
		BaseSellPrice *int32  `json:"base_sell_price"`
		BaseBuyPrice  *int32  `json:"base_buy_price"`

		// Armor fields
		TypeID          string `json:"type_id" binding:"required"`
		RarityID        string `json:"rarity_id" binding:"required"`
		DefenseRating   int32  `json:"defense_rating" binding:"required"`
		Durability      int32  `json:"durability" binding:"required"`
		MagicResistance int32  `json:"magic_resistance"`
		ArmorSlot       string `json:"armor_slot"`
		Description     string `json:"description"`
	}

	if err := c.ShouldBindJSON(&httpReq); err != nil {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Request body is not valid JSON"))
		return
	}

	// 3. Build gRPC request
	grpcReq := &pb.CreateCompleteArmorRequest{
		UserId:          userIdStr.(string),
		ItemName:        httpReq.ItemName,
		RarityId:        httpReq.RarityID,
		DefenseRating:   httpReq.DefenseRating,
		MagicResistance: httpReq.MagicResistance,
		ArmorSlot:       httpReq.ArmorSlot,
		Description:     httpReq.Description,
	}

	// Handle optional fields
	if httpReq.IconURL != nil {
		grpcReq.IconUrl = httpReq.IconURL
	}
	if httpReq.RequiredLevel != nil {
		grpcReq.RequiredLevel = httpReq.RequiredLevel
	}
	if httpReq.BaseSellPrice != nil {
		grpcReq.BaseSellPrice = httpReq.BaseSellPrice
	}
	if httpReq.BaseBuyPrice != nil {
		grpcReq.BaseBuyPrice = httpReq.BaseBuyPrice
	}

	// 4. Call items-service
	armorDetail, err := h.client.CreateCompleteArmor(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	// 5. Success response
	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Complete armor created successfully. Notification sent to admins.",
		"result":     armorDetail,
	})
}

// CreateCompleteConsumableHandler creates a complete consumable (consumable + template) in one request
func (h *Handler) CreateCompleteConsumableHandler(c *gin.Context) {
	const op = "CreateCompleteConsumableHandler"
	// 1. Extract userId from JWT
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	// 2. Parse JSON body
	var httpReq struct {
		// Template fields
		ItemName      string  `json:"item_name" binding:"required"`
		ItemCode      string  `json:"item_code" binding:"required"`
		IconURL       *string `json:"icon_url"`
		RequiredLevel *int32  `json:"required_level"`
		BaseSellPrice *int32  `json:"base_sell_price"`
		BaseBuyPrice  *int32  `json:"base_buy_price"`

		// Consumable fields
		TypeID        string `json:"type_id" binding:"required"`
		RarityID      string `json:"rarity_id" binding:"required"`
		HealingAmount int32  `json:"healing_amount"`
		ManaAmount    int32  `json:"mana_amount"`
		BuffDuration  int32  `json:"buff_duration"`
		MaxStackSize  int32  `json:"max_stack_size" binding:"required"`
		Description   string `json:"description"`
	}

	if err := c.ShouldBindJSON(&httpReq); err != nil {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Request body is not valid JSON"))
		return
	}

	// 3. Build gRPC request
	grpcReq := &pb.CreateCompleteConsumableRequest{
		UserId:        userIdStr.(string),
		ItemName:      httpReq.ItemName,
		RarityId:      httpReq.RarityID,
		HealingAmount: httpReq.HealingAmount,
		ManaAmount:    httpReq.ManaAmount,
		BuffDuration:  httpReq.BuffDuration,
		MaxStackSize:  httpReq.MaxStackSize,
		Description:   httpReq.Description,
	}

	// Handle optional fields
	if httpReq.IconURL != nil {
		grpcReq.IconUrl = httpReq.IconURL
	}
	if httpReq.RequiredLevel != nil {
		grpcReq.RequiredLevel = httpReq.RequiredLevel
	}
	if httpReq.BaseSellPrice != nil {
		grpcReq.BaseSellPrice = httpReq.BaseSellPrice
	}
	if httpReq.BaseBuyPrice != nil {
		grpcReq.BaseBuyPrice = httpReq.BaseBuyPrice
	}

	// 4. Call items-service
	consumableDetail, err := h.client.CreateCompleteConsumable(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	// 5. Success response
	c.JSON(http.StatusCreated, gin.H{
		"statusCode": http.StatusCreated,
		"message":    "Complete consumable created successfully. Notification sent to admins.",
		"result":     consumableDetail,
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

// get loadout for player
func (h *Handler) GetLoadoutHandler(c *gin.Context) {
	const op = "GetLoadoutHandler"
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	grpcReq := &pb.GetLoadoutRequest{
		MemberId: userIdStr.(string),
	}
	result, err := h.client.GetLoadout(c.Request.Context(), grpcReq)
	if err != nil {
		log.Printf("GetLoadout error: %v", err)
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Loadout retrieved successfully",
		"result":     result,
	})
}

func (h *Handler) ListItemInstancesHandler(c *gin.Context) {
	const op = "ListItemInstancesHandler"
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	grpcReq := &pb.ListItemInstancesRequest{
		MemberId: userIdStr.(string),
	}
	result, err := h.client.ListItemInstances(c.Request.Context(), grpcReq)
	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Item instances retrieved successfully",
		"result":     result,
	})
}

func (h *Handler) UpdateLoadoutHandler(c *gin.Context) {
	const op = "UpdateLoadoutHandler"
	userIdStr, exists := c.Get("userIdStr")
	if !exists {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated"))
		return
	}

	var body struct {
		Slot           string `json:"slot" binding:"required"`
		ItemInstanceId string `json:"item_instance_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "Request body is not valid JSON"))
		return
	}

	grpcReq := &pb.UpdateLoadoutRequest{
		MemberId:       userIdStr.(string),
		Slot:           body.Slot,
		ItemInstanceId: body.ItemInstanceId,
	}
	log.Printf("UpdateLoadout request: member=%s slot=%s item=%s", grpcReq.MemberId, grpcReq.Slot, grpcReq.ItemInstanceId)
	result, err := h.client.UpdateLoadout(c.Request.Context(), grpcReq)
	if err != nil {
		log.Printf("UpdateLoadout error: %v", err)
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"statusCode": http.StatusOK,
		"message":    "Loadout updated successfully",
		"result":     result,
	})
}
