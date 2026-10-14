package item

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/types/known/emptypb"
)

// Client calls items-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials items-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with items-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial items service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) ListItemTypes(ctx context.Context) (*pb.ListItemTypesResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	itemTypes, err := client.ListItemTypes(ctx, &emptypb.Empty{})
	return itemTypes, err
}

func (c *Client) ListItemRarities(ctx context.Context) (*pb.ListItemRaritiesResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	rarities, err := client.ListItemRarities(ctx, &emptypb.Empty{})
	return rarities, err
}

func (c *Client) CreateWeapon(ctx context.Context, req *pb.CreateWeaponRequest) (*pb.Weapon, error) {
	client := pb.NewItemsServiceClient(c.conn)
	weapon, err := client.CreateWeapon(ctx, req)
	return weapon, err
}

func (c *Client) ListWeaponsWithTemplate(ctx context.Context) (*pb.ListWeaponsResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	weapons, err := client.ListWeaponsWithTemplate(ctx, &emptypb.Empty{})
	return weapons, err
}

func (c *Client) CreateItemTemplate(ctx context.Context, req *pb.CreateItemTemplateRequest) (*pb.ItemTemplate, error) {
	client := pb.NewItemsServiceClient(c.conn)
	template, err := client.CreateItemTemplate(ctx, req)
	return template, err
}

func (c *Client) CreateCompleteWeapon(ctx context.Context, req *pb.CreateCompleteWeaponRequest) (*pb.WeaponDetail, error) {
	client := pb.NewItemsServiceClient(c.conn)
	weapon, err := client.CreateCompleteWeapon(ctx, req)
	return weapon, err
}

func (c *Client) CreateCompleteArmor(ctx context.Context, req *pb.CreateCompleteArmorRequest) (*pb.ArmorDetail, error) {
	client := pb.NewItemsServiceClient(c.conn)
	armor, err := client.CreateCompleteArmor(ctx, req)
	return armor, err
}

func (c *Client) CreateCompleteConsumable(ctx context.Context, req *pb.CreateCompleteConsumableRequest) (*pb.ConsumableDetail, error) {
	client := pb.NewItemsServiceClient(c.conn)
	consumable, err := client.CreateCompleteConsumable(ctx, req)
	return consumable, err
}

func (c *Client) GetLoadout(ctx context.Context, req *pb.GetLoadoutRequest) (*pb.GetLoadoutResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	loadout, err := client.GetLoadout(ctx, req)
	return loadout, err
}

func (c *Client) ListItemInstances(ctx context.Context, req *pb.ListItemInstancesRequest) (*pb.ListItemInstancesResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	return client.ListItemInstances(ctx, req)
}

func (c *Client) UpdateLoadout(ctx context.Context, req *pb.UpdateLoadoutRequest) (*pb.UpdateLoadoutResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	return client.UpdateLoadout(ctx, req)
}

func (c *Client) GetItemSummaries(ctx context.Context, req *pb.GetItemSummariesRequest) (*pb.GetItemSummariesResponse, error) {
	return pb.NewItemsServiceClient(c.conn).GetItemSummaries(ctx, req)
}
