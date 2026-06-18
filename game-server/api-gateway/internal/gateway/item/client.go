package item

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/protobuf/types/known/emptypb"
)

type Client struct {
	registry discovery.Registry
	mu       sync.Mutex
	conn     *grpc.ClientConn
}

const (
	serviceName = "items"
)

func NewClient(registry discovery.Registry) ItemClient {
	return &Client{
		registry: registry,
	}
}

// ensureConn lazily dials the service once and caches the connection for
// reuse across calls (gRPC multiplexes over it). Opening a fresh conn per RPC
// serialized badly and churned connections; see common/discovery/grpc.go.
func (c *Client) ensureConn(ctx context.Context) (*grpc.ClientConn, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil && c.conn.GetState() != connectivity.Shutdown {
		return c.conn, nil
	}
	conn, err := discovery.ServiceConnection(ctx, serviceName, c.registry)
	if err != nil {
		return nil, err
	}
	c.conn = conn
	return conn, nil
}

func (c *Client) ListItemTypes(ctx context.Context) (*pb.ListItemTypesResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	itemTypes, err := client.ListItemTypes(ctx, &emptypb.Empty{})
	return itemTypes, err
}

func (c *Client) ListItemRarities(ctx context.Context) (*pb.ListItemRaritiesResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	rarities, err := client.ListItemRarities(ctx, &emptypb.Empty{})
	return rarities, err
}

func (c *Client) CreateWeapon(ctx context.Context, req *pb.CreateWeaponRequest) (*pb.Weapon, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	weapon, err := client.CreateWeapon(ctx, req)
	return weapon, err
}

func (c *Client) ListWeaponsWithTemplate(ctx context.Context) (*pb.ListWeaponsResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	weapons, err := client.ListWeaponsWithTemplate(ctx, &emptypb.Empty{})
	return weapons, err
}

func (c *Client) CreateItemTemplate(ctx context.Context, req *pb.CreateItemTemplateRequest) (*pb.ItemTemplate, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	template, err := client.CreateItemTemplate(ctx, req)
	return template, err
}

func (c *Client) CreateCompleteWeapon(ctx context.Context, req *pb.CreateCompleteWeaponRequest) (*pb.WeaponDetail, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	weapon, err := client.CreateCompleteWeapon(ctx, req)
	return weapon, err
}

func (c *Client) CreateCompleteArmor(ctx context.Context, req *pb.CreateCompleteArmorRequest) (*pb.ArmorDetail, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	armor, err := client.CreateCompleteArmor(ctx, req)
	return armor, err
}

func (c *Client) CreateCompleteConsumable(ctx context.Context, req *pb.CreateCompleteConsumableRequest) (*pb.ConsumableDetail, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	consumable, err := client.CreateCompleteConsumable(ctx, req)
	return consumable, err
}

func (c *Client) GetLoadout(ctx context.Context, req *pb.GetLoadoutRequest) (*pb.GetLoadoutResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	loadout, err := client.GetLoadout(ctx, req)
	return loadout, err
}

func (c *Client) ListItemInstances(ctx context.Context, req *pb.ListItemInstancesRequest) (*pb.ListItemInstancesResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	return client.ListItemInstances(ctx, req)
}

func (c *Client) UpdateLoadout(ctx context.Context, req *pb.UpdateLoadoutRequest) (*pb.UpdateLoadoutResponse, error) {
	conn, err := c.ensureConn(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to items service: %w", err)
	}
	client := pb.NewItemsServiceClient(conn)
	return client.UpdateLoadout(ctx, req)
}
