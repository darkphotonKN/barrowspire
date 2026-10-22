package grpcitems

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

// get all items under an aggregated type
func (c *Client) ListItemTemplates(ctx context.Context) (*pb.ListItemTemplatesResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)

	items, err := client.ListItemTemplates(ctx, &emptypb.Empty{})
	return items, err
}

// ListItemRarities lists the rarity tiers loot rolls against
func (c *Client) ListItemRarities(ctx context.Context) (*pb.ListItemRaritiesResponse, error) {
	return pb.NewItemsServiceClient(c.conn).ListItemRarities(ctx, &emptypb.Empty{})
}

// CreateWeapon creates a new weapon
func (c *Client) CreateWeapon(ctx context.Context, req *pb.CreateWeaponRequest) (*pb.Weapon, error) {
	client := pb.NewItemsServiceClient(c.conn)
	weapon, err := client.CreateWeapon(ctx, req)
	return weapon, err
}

// GetWeaponWithTemplateByID gets a weapon with template information by ID
func (c *Client) GetWeaponWithTemplateByID(ctx context.Context, req *pb.GetWeaponRequest) (*pb.WeaponDetail, error) {
	client := pb.NewItemsServiceClient(c.conn)
	weapon, err := client.GetWeaponWithTemplateByID(ctx, req)
	return weapon, err
}

// ListWeaponsWithTemplate lists all weapons with template information
func (c *Client) ListWeaponsWithTemplate(ctx context.Context) (*pb.ListWeaponsResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	weapons, err := client.ListWeaponsWithTemplate(ctx, &emptypb.Empty{})
	return weapons, err
}

// ListArmorsWithTemplate lists all armors with template information
func (c *Client) ListArmorsWithTemplate(ctx context.Context) (*pb.ListArmorsResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	armors, err := client.ListArmorsWithTemplate(ctx, &emptypb.Empty{})
	return armors, err
}

// ListConsumablesWithTemplate lists all consumables with template information
func (c *Client) ListConsumablesWithTemplate(ctx context.Context) (*pb.ListConsumablesResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	consumables, err := client.ListConsumablesWithTemplate(ctx, &emptypb.Empty{})
	return consumables, err
}

func (c *Client) GetLoadout(ctx context.Context, req *pb.GetLoadoutRequest) (*pb.GetLoadoutResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	return client.GetLoadout(ctx, req)
}

func (c *Client) GetLoadoutWithItems(ctx context.Context, req *pb.GetLoadoutWithItemsRequest) (*pb.GetLoadoutWithItemsResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	return client.GetLoadoutWithItems(ctx, req)
}

func (c *Client) ListItemInstances(ctx context.Context, req *pb.ListItemInstancesRequest) (*pb.ListItemInstancesResponse, error) {
	client := pb.NewItemsServiceClient(c.conn)
	return client.ListItemInstances(ctx, req)
}
