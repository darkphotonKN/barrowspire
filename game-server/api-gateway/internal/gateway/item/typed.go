package item

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/wire"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
)

// MemberIDFunc and ErrorFunc are injected rather than imported so this package
// stays free of internal/contract. Same shape as the member group.
type MemberIDFunc func(ctx context.Context) (string, bool)
type ErrorFunc func(error) error

var toStatusError ErrorFunc = func(err error) error { return err }

// guard routes a handler's error through the seam. Applied to EVERY handler so
// no return path can forget it — a forgotten one is a silent 500 with no code.
func guard[I, O any](fn func(context.Context, *I) (*O, error)) func(context.Context, *I) (*O, error) {
	return func(ctx context.Context, in *I) (*O, error) {
		out, err := fn(ctx, in)
		if err != nil {
			return nil, toStatusError(err)
		}
		return out, nil
	}
}

func unauthenticated() error {
	return apperr.WithDetail(apperr.ErrUnauthenticated, "Not authenticated")
}

// Envelopes. Every item response wraps its payload in statusCode + message,
// duplicating the HTTP status. Transcribed, not removed (ADR-0002 §1).
type resultEnvelope[T any] struct {
	StatusCode int    `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string `json:"message" doc:"Human-readable summary"`
	Result     T      `json:"result" doc:"The payload"`
}

// ListWeapons is the one response that names its payload `weapons` rather than
// `result`. Transcribed as-is.
type weaponsEnvelope struct {
	StatusCode int             `json:"statusCode" doc:"Duplicates the HTTP status"`
	Message    string          `json:"message" doc:"Human-readable summary"`
	Weapons    []*WeaponDetail `json:"weapons" doc:"All weapons with their template detail"`
}

// Request bodies. `required` is transcribed from the legacy handlers'
// binding:"required" tags — present where they had it, absent where they did not.
type CreateWeaponBody struct {
	RarityID     string  `json:"rarity_id,omitempty" doc:"Rarity id"`
	AttackPower  int32   `json:"attack_power,omitempty" doc:"Attack power"`
	CriticalRate float32 `json:"critical_rate,omitempty" doc:"Critical hit rate"`
	WeaponType   string  `json:"weapon_type,omitempty" doc:"Weapon type"`
	Description  string  `json:"description,omitempty" doc:"Description"`
}

type CreateItemTemplateBody struct {
	ItemName      string `json:"item_name" required:"true" doc:"Display name"`
	ItemCode      string `json:"item_code" required:"true" doc:"Unique code"`
	TypeID        string `json:"type_id" required:"true" doc:"Item type id"`
	RarityID      string `json:"rarity_id" required:"true" doc:"Rarity id"`
	ItemType      string `json:"item_type" required:"true" doc:"Item type name"`
	ItemID        string `json:"item_id" required:"true" doc:"Underlying item id"`
	IconURL       string `json:"icon_url,omitempty" doc:"Icon URL"`
	RequiredLevel *int32 `json:"required_level,omitempty" doc:"Minimum level"`
	BaseSellPrice *int32 `json:"base_sell_price,omitempty" doc:"Base sell price"`
	BaseBuyPrice  *int32 `json:"base_buy_price,omitempty" doc:"Base buy price"`
}

type CreateCompleteWeaponBody struct {
	ItemName      string  `json:"item_name" required:"true" doc:"Display name"`
	ItemCode      string  `json:"item_code" required:"true" doc:"Unique code"`
	IconURL       *string `json:"icon_url,omitempty" doc:"Icon URL"`
	RequiredLevel *int32  `json:"required_level,omitempty" doc:"Minimum level"`
	BaseSellPrice *int32  `json:"base_sell_price,omitempty" doc:"Base sell price"`
	BaseBuyPrice  *int32  `json:"base_buy_price,omitempty" doc:"Base buy price"`
	TypeID        string  `json:"type_id" required:"true" doc:"Item type id"`
	RarityID      string  `json:"rarity_id" required:"true" doc:"Rarity id"`
	AttackPower   int32   `json:"attack_power" required:"true" doc:"Attack power"`
	Durability    int32   `json:"durability" required:"true" doc:"Durability"`
	CriticalRate  float32 `json:"critical_rate,omitempty" doc:"Critical hit rate"`
	WeaponType    string  `json:"weapon_type,omitempty" doc:"Weapon type"`
	Description   string  `json:"description,omitempty" doc:"Description"`
}

type CreateCompleteArmorBody struct {
	ItemName        string  `json:"item_name" required:"true" doc:"Display name"`
	ItemCode        string  `json:"item_code" required:"true" doc:"Unique code"`
	IconURL         *string `json:"icon_url,omitempty" doc:"Icon URL"`
	RequiredLevel   *int32  `json:"required_level,omitempty" doc:"Minimum level"`
	BaseSellPrice   *int32  `json:"base_sell_price,omitempty" doc:"Base sell price"`
	BaseBuyPrice    *int32  `json:"base_buy_price,omitempty" doc:"Base buy price"`
	TypeID          string  `json:"type_id" required:"true" doc:"Item type id"`
	RarityID        string  `json:"rarity_id" required:"true" doc:"Rarity id"`
	DefenseRating   int32   `json:"defense_rating" required:"true" doc:"Defense rating"`
	Durability      int32   `json:"durability" required:"true" doc:"Durability"`
	MagicResistance int32   `json:"magic_resistance,omitempty" doc:"Magic resistance"`
	ArmorSlot       string  `json:"armor_slot,omitempty" doc:"Armor slot"`
	Description     string  `json:"description,omitempty" doc:"Description"`
}

type CreateCompleteConsumableBody struct {
	ItemName      string  `json:"item_name" required:"true" doc:"Display name"`
	ItemCode      string  `json:"item_code" required:"true" doc:"Unique code"`
	IconURL       *string `json:"icon_url,omitempty" doc:"Icon URL"`
	RequiredLevel *int32  `json:"required_level,omitempty" doc:"Minimum level"`
	BaseSellPrice *int32  `json:"base_sell_price,omitempty" doc:"Base sell price"`
	BaseBuyPrice  *int32  `json:"base_buy_price,omitempty" doc:"Base buy price"`
	TypeID        string  `json:"type_id" required:"true" doc:"Item type id"`
	RarityID      string  `json:"rarity_id" required:"true" doc:"Rarity id"`
	HealingAmount int32   `json:"healing_amount,omitempty" doc:"Healing amount"`
	ManaAmount    int32   `json:"mana_amount,omitempty" doc:"Mana restored"`
	BuffDuration  int32   `json:"buff_duration,omitempty" doc:"Buff duration in seconds"`
	MaxStackSize  int32   `json:"max_stack_size" required:"true" doc:"Maximum stack size"`
	Description   string  `json:"description,omitempty" doc:"Description"`
}

type UpdateLoadoutBody struct {
	Slot           string `json:"slot" required:"true" doc:"Loadout slot to change"`
	ItemInstanceID string `json:"item_instance_id,omitempty" doc:"Item instance to equip; empty unequips"`
}

// Error sets, per operation. Each lists what that operation can actually
// produce — not a copied default.
var (
	errsAuthed       = []int{http.StatusUnauthorized, http.StatusUnprocessableEntity, http.StatusInternalServerError}
	errsAuthedDomain = []int{http.StatusUnauthorized, http.StatusBadRequest, http.StatusUnprocessableEntity, http.StatusInternalServerError}
)

// RegisterOperations declares the serialized items surface (FS-0002 slice 2).
// All eleven routes are JWT-protected, so every operation carries protect.
func RegisterOperations(api huma.API, h *Handler, memberID MemberIDFunc,
	protect func(huma.Context, func(huma.Context)), errFor ErrorFunc,
) {
	toStatusError = errFor
	mw := huma.Middlewares{protect}

	registerCreateWeapon(api, h, mw)
	registerListWeapons(api, h, mw)
	registerCreateItemTemplate(api, h, memberID, mw)
	registerCreateCompleteWeapon(api, h, memberID, mw)
	registerCreateCompleteArmor(api, h, memberID, mw)
	registerCreateCompleteConsumable(api, h, memberID, mw)
	registerListItemTypes(api, h, mw)
	registerListItemRarities(api, h, mw)
	registerGetLoadout(api, h, memberID, mw)
	registerListItemInstances(api, h, memberID, mw)
	registerUpdateLoadout(api, h, memberID, mw)
}

func registerCreateWeapon(api huma.API, h *Handler, mw huma.Middlewares) {
	type input struct{ Body CreateWeaponBody }
	type output struct {
		Status int
		Body   resultEnvelope[*Weapon]
	}

	huma.Register(api, huma.Operation{
		OperationID:   "create-weapon",
		Method:        http.MethodPost,
		Path:          "/api/items/weapon",
		Summary:       "Create a weapon (legacy)",
		Description:   "Creates a weapon without its template. Superseded by create-complete-weapon; kept because removing an endpoint is a behavior change.",
		Tags:          []string{"items"},
		Middlewares:   mw,
		Errors:        errsAuthed,
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		res, err := h.client.CreateWeapon(ctx, &pb.CreateWeaponRequest{
			RarityId:     in.Body.RarityID,
			AttackPower:  in.Body.AttackPower,
			CriticalRate: in.Body.CriticalRate,
			WeaponType:   in.Body.WeaponType,
			Description:  in.Body.Description,
		})
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[Weapon](res)
		if err != nil {
			return nil, err
		}
		return &output{Status: http.StatusCreated, Body: resultEnvelope[*Weapon]{
			StatusCode: http.StatusCreated, Message: "Weapon created successfully", Result: wire,
		}}, nil
	}))
}

func registerListWeapons(api huma.API, h *Handler, mw huma.Middlewares) {
	type output struct{ Body weaponsEnvelope }

	huma.Register(api, huma.Operation{
		OperationID: "list-weapons",
		Method:      http.MethodGet,
		Path:        "/api/items/weapons",
		Summary:     "List weapons with their template detail",
		Description: "Returns every weapon joined with its item template.",
		Tags:        []string{"items"},
		Middlewares: mw,
		Errors:      errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*output, error) {
		res, err := h.client.ListWeaponsWithTemplate(ctx)
		if err != nil {
			return nil, err
		}
		weapons, err := wire.AsSlice[*WeaponDetail](res.Weapons)
		if err != nil {
			return nil, err
		}
		return &output{Body: weaponsEnvelope{
			StatusCode: http.StatusOK, Message: "Weapons retrieved successfully", Weapons: weapons,
		}}, nil
	}))
}

func registerCreateItemTemplate(api huma.API, h *Handler, memberID MemberIDFunc, mw huma.Middlewares) {
	type input struct{ Body CreateItemTemplateBody }
	type output struct {
		Status int
		Body   resultEnvelope[*ItemTemplate]
	}

	huma.Register(api, huma.Operation{
		OperationID:   "create-item-template",
		Method:        http.MethodPost,
		Path:          "/api/items/template",
		Summary:       "Create an item template (legacy)",
		Description:   "Creates a template only and notifies admins over RabbitMQ. Superseded by the complete-* endpoints.",
		Tags:          []string{"items"},
		Middlewares:   mw,
		Errors:        errsAuthedDomain,
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}

		req := &pb.CreateItemTemplateRequest{
			UserId:   id,
			ItemName: in.Body.ItemName,
			RarityId: in.Body.RarityID,
			ItemType: in.Body.ItemType,
			ItemId:   in.Body.ItemID,
		}
		// Transcribed exactly: the legacy handler set these only when present,
		// and a proto optional field distinguishes unset from zero.
		if in.Body.IconURL != "" {
			req.IconUrl = &in.Body.IconURL
		}
		req.RequiredLevel = in.Body.RequiredLevel
		req.BaseSellPrice = in.Body.BaseSellPrice
		req.BaseBuyPrice = in.Body.BaseBuyPrice

		res, err := h.client.CreateItemTemplate(ctx, req)
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[ItemTemplate](res)
		if err != nil {
			return nil, err
		}
		return &output{Status: http.StatusCreated, Body: resultEnvelope[*ItemTemplate]{
			StatusCode: http.StatusCreated,
			Message:    "Item template created successfully. Notification sent to admins.",
			Result:     wire,
		}}, nil
	}))
}

func registerCreateCompleteWeapon(api huma.API, h *Handler, memberID MemberIDFunc, mw huma.Middlewares) {
	type input struct{ Body CreateCompleteWeaponBody }
	type output struct {
		Status int
		Body   resultEnvelope[*WeaponDetail]
	}

	huma.Register(api, huma.Operation{
		OperationID:   "create-complete-weapon",
		Method:        http.MethodPost,
		Path:          "/api/items/complete-weapon",
		Summary:       "Create a weapon and its template together",
		Description:   "Creates the weapon and its item template in one request and notifies admins.",
		Tags:          []string{"items"},
		Middlewares:   mw,
		Errors:        errsAuthedDomain,
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		// NOTE (pioneer log): item_code, type_id and durability are REQUIRED by
		// this request body and are then discarded — the proto has no such
		// fields, and the legacy handler never forwarded them either. Kept
		// required because dropping a required field is a behavior change
		// (ADR-0002 §1). A candidate for its own FS.
		res, err := h.client.CreateCompleteWeapon(ctx, &pb.CreateCompleteWeaponRequest{
			UserId: id, ItemName: in.Body.ItemName,
			IconUrl: in.Body.IconURL, RequiredLevel: in.Body.RequiredLevel,
			BaseSellPrice: in.Body.BaseSellPrice, BaseBuyPrice: in.Body.BaseBuyPrice,
			RarityId: in.Body.RarityID, AttackPower: in.Body.AttackPower,
			CriticalRate: in.Body.CriticalRate, WeaponType: in.Body.WeaponType,
			Description: in.Body.Description,
		})
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[WeaponDetail](res)
		if err != nil {
			return nil, err
		}
		return &output{Status: http.StatusCreated, Body: resultEnvelope[*WeaponDetail]{
			StatusCode: http.StatusCreated,
			Message:    "Complete weapon created successfully. Notification sent to admins.",
			Result:     wire,
		}}, nil
	}))
}

func registerCreateCompleteArmor(api huma.API, h *Handler, memberID MemberIDFunc, mw huma.Middlewares) {
	type input struct{ Body CreateCompleteArmorBody }
	type output struct {
		Status int
		Body   resultEnvelope[*ArmorDetail]
	}

	huma.Register(api, huma.Operation{
		OperationID:   "create-complete-armor",
		Method:        http.MethodPost,
		Path:          "/api/items/complete-armor",
		Summary:       "Create armor and its template together",
		Description:   "Creates the armor and its item template in one request and notifies admins.",
		Tags:          []string{"items"},
		Middlewares:   mw,
		Errors:        errsAuthedDomain,
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		// NOTE (pioneer log): item_code, type_id and durability are REQUIRED by
		// this request body and are then discarded — the proto has no such
		// fields, and the legacy handler never forwarded them either. Kept
		// required because dropping a required field is a behavior change
		// (ADR-0002 §1). A candidate for its own FS.
		res, err := h.client.CreateCompleteArmor(ctx, &pb.CreateCompleteArmorRequest{
			UserId: id, ItemName: in.Body.ItemName,
			IconUrl: in.Body.IconURL, RequiredLevel: in.Body.RequiredLevel,
			BaseSellPrice: in.Body.BaseSellPrice, BaseBuyPrice: in.Body.BaseBuyPrice,
			RarityId: in.Body.RarityID, DefenseRating: in.Body.DefenseRating,
			MagicResistance: in.Body.MagicResistance, ArmorSlot: in.Body.ArmorSlot,
			Description: in.Body.Description,
		})
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[ArmorDetail](res)
		if err != nil {
			return nil, err
		}
		return &output{Status: http.StatusCreated, Body: resultEnvelope[*ArmorDetail]{
			StatusCode: http.StatusCreated,
			Message:    "Complete armor created successfully. Notification sent to admins.",
			Result:     wire,
		}}, nil
	}))
}

func registerCreateCompleteConsumable(api huma.API, h *Handler, memberID MemberIDFunc, mw huma.Middlewares) {
	type input struct{ Body CreateCompleteConsumableBody }
	type output struct {
		Status int
		Body   resultEnvelope[*ConsumableDetail]
	}

	huma.Register(api, huma.Operation{
		OperationID:   "create-complete-consumable",
		Method:        http.MethodPost,
		Path:          "/api/items/complete-consumable",
		Summary:       "Create a consumable and its template together",
		Description:   "Creates the consumable and its item template in one request and notifies admins.",
		Tags:          []string{"items"},
		Middlewares:   mw,
		Errors:        errsAuthedDomain,
		DefaultStatus: http.StatusCreated,
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		// NOTE (pioneer log): item_code, type_id and durability are REQUIRED by
		// this request body and are then discarded — the proto has no such
		// fields, and the legacy handler never forwarded them either. Kept
		// required because dropping a required field is a behavior change
		// (ADR-0002 §1). A candidate for its own FS.
		res, err := h.client.CreateCompleteConsumable(ctx, &pb.CreateCompleteConsumableRequest{
			UserId: id, ItemName: in.Body.ItemName,
			IconUrl: in.Body.IconURL, RequiredLevel: in.Body.RequiredLevel,
			BaseSellPrice: in.Body.BaseSellPrice, BaseBuyPrice: in.Body.BaseBuyPrice,
			RarityId: in.Body.RarityID, HealingAmount: in.Body.HealingAmount,
			ManaAmount: in.Body.ManaAmount, BuffDuration: in.Body.BuffDuration,
			MaxStackSize: in.Body.MaxStackSize, Description: in.Body.Description,
		})
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[ConsumableDetail](res)
		if err != nil {
			return nil, err
		}
		return &output{Status: http.StatusCreated, Body: resultEnvelope[*ConsumableDetail]{
			StatusCode: http.StatusCreated,
			Message:    "Complete consumable created successfully. Notification sent to admins.",
			Result:     wire,
		}}, nil
	}))
}

func registerListItemTypes(api huma.API, h *Handler, mw huma.Middlewares) {
	type output struct{ Body resultEnvelope[[]*ItemType] }

	huma.Register(api, huma.Operation{
		OperationID: "list-item-types",
		Method:      http.MethodGet,
		Path:        "/api/items/types",
		Summary:     "List item types",
		Description: "Dropdown options for item creation forms.",
		Tags:        []string{"items"},
		Middlewares: mw,
		Errors:      errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*output, error) {
		res, err := h.client.ListItemTypes(ctx)
		if err != nil {
			return nil, err
		}
		types, err := wire.AsSlice[*ItemType](res.ItemTypes)
		if err != nil {
			return nil, err
		}
		return &output{Body: resultEnvelope[[]*ItemType]{
			StatusCode: http.StatusOK, Message: "Item types retrieved successfully", Result: types,
		}}, nil
	}))
}

func registerListItemRarities(api huma.API, h *Handler, mw huma.Middlewares) {
	type output struct{ Body resultEnvelope[[]*ItemRarity] }

	huma.Register(api, huma.Operation{
		OperationID: "list-item-rarities",
		Method:      http.MethodGet,
		Path:        "/api/items/rarities",
		Summary:     "List item rarities",
		Description: "Dropdown options for item creation forms.",
		Tags:        []string{"items"},
		Middlewares: mw,
		Errors:      errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*output, error) {
		res, err := h.client.ListItemRarities(ctx)
		if err != nil {
			return nil, err
		}
		rarities, err := wire.AsSlice[*ItemRarity](res.ItemRarities)
		if err != nil {
			return nil, err
		}
		return &output{Body: resultEnvelope[[]*ItemRarity]{
			StatusCode: http.StatusOK, Message: "Item rarities retrieved successfully", Result: rarities,
		}}, nil
	}))
}

func registerGetLoadout(api huma.API, h *Handler, memberID MemberIDFunc, mw huma.Middlewares) {
	type output struct {
		Body resultEnvelope[*GetLoadoutResponse]
	}

	huma.Register(api, huma.Operation{
		OperationID: "get-loadout",
		Method:      http.MethodGet,
		Path:        "/api/items/loadout",
		Summary:     "Get the signed-in member's loadout",
		Description: "Returns the equipped item in each loadout slot.",
		Tags:        []string{"items"},
		Middlewares: mw,
		Errors:      errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.GetLoadout(ctx, &pb.GetLoadoutRequest{MemberId: id})
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[GetLoadoutResponse](res)
		if err != nil {
			return nil, err
		}
		return &output{Body: resultEnvelope[*GetLoadoutResponse]{
			StatusCode: http.StatusOK, Message: "Loadout retrieved successfully", Result: wire,
		}}, nil
	}))
}

func registerListItemInstances(api huma.API, h *Handler, memberID MemberIDFunc, mw huma.Middlewares) {
	type output struct {
		Body resultEnvelope[*ListItemInstancesResponse]
	}

	huma.Register(api, huma.Operation{
		OperationID: "list-item-instances",
		Method:      http.MethodGet,
		Path:        "/api/items/instances",
		Summary:     "List the signed-in member's item instances",
		Description: "The member's stash: every item instance they own.",
		Tags:        []string{"items"},
		Middlewares: mw,
		Errors:      errsAuthed,
	}, guard(func(ctx context.Context, _ *struct{}) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.ListItemInstances(ctx, &pb.ListItemInstancesRequest{MemberId: id})
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[ListItemInstancesResponse](res)
		if err != nil {
			return nil, err
		}
		return &output{Body: resultEnvelope[*ListItemInstancesResponse]{
			StatusCode: http.StatusOK, Message: "Item instances retrieved successfully", Result: wire,
		}}, nil
	}))
}

func registerUpdateLoadout(api huma.API, h *Handler, memberID MemberIDFunc, mw huma.Middlewares) {
	type input struct{ Body UpdateLoadoutBody }
	type output struct {
		Body resultEnvelope[*UpdateLoadoutResponse]
	}

	huma.Register(api, huma.Operation{
		OperationID: "update-loadout",
		Method:      http.MethodPut,
		Path:        "/api/items/loadout",
		Summary:     "Equip or unequip an item in a loadout slot",
		Description: "Sets the item instance in a slot. An empty item_instance_id unequips the slot.",
		Tags:        []string{"items"},
		Middlewares: mw,
		Errors:      errsAuthedDomain,
	}, guard(func(ctx context.Context, in *input) (*output, error) {
		id, ok := memberID(ctx)
		if !ok {
			return nil, unauthenticated()
		}
		res, err := h.client.UpdateLoadout(ctx, &pb.UpdateLoadoutRequest{
			MemberId: id, Slot: in.Body.Slot, ItemInstanceId: in.Body.ItemInstanceID,
		})
		if err != nil {
			return nil, err
		}
		wire, err := wire.As[UpdateLoadoutResponse](res)
		if err != nil {
			return nil, err
		}
		return &output{Body: resultEnvelope[*UpdateLoadoutResponse]{
			StatusCode: http.StatusOK, Message: "Loadout updated successfully", Result: wire,
		}}, nil
	}))
}
