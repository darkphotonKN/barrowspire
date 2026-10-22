package listing

import (
	"context"
	"fmt"

	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/marketplace"
	"github.com/darkphotonKN/barrowspire-server/common/discovery"
	"google.golang.org/grpc"
)

// Client calls marketplace-service over one long-lived connection.
type Client struct {
	conn *grpc.ClientConn
}

// NewClient dials marketplace-service at addr ("host:port"). The dial is lazy: nothing
// connects until the first RPC, so this service boots with marketplace-service absent
// and a call made while it is down fails with codes.Unavailable.
func NewClient(addr string) (*Client, error) {
	conn, err := discovery.Dial(addr)
	if err != nil {
		return nil, fmt.Errorf("dial marketplace service at %s: %w", addr, err)
	}
	return &Client{conn: conn}, nil
}

// Close releases the connection.
func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) ListItem(ctx context.Context, req *pb.ListItemRequest) (*pb.ListItemResponse, error) {
	client := pb.NewMarketplaceServiceClient(c.conn)
	listing, err := client.ListItem(ctx, req)
	return listing, err
}

func (c *Client) PlaceBid(ctx context.Context, req *pb.PlaceBidRequest) (*pb.PlaceBidResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).PlaceBid(ctx, req)
}

func (c *Client) WithdrawBid(ctx context.Context, req *pb.WithdrawBidRequest) (*pb.WithdrawBidResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).WithdrawBid(ctx, req)
}

func (c *Client) AcceptBid(ctx context.Context, req *pb.AcceptBidRequest) (*pb.AcceptBidResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).AcceptBid(ctx, req)
}

func (c *Client) Buyout(ctx context.Context, req *pb.BuyoutRequest) (*pb.BuyoutResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).Buyout(ctx, req)
}

func (c *Client) ListMyListings(ctx context.Context, req *pb.ListMyListingsRequest) (*pb.ListMyListingsResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).ListMyListings(ctx, req)
}

func (c *Client) ListMyBids(ctx context.Context, req *pb.ListMyBidsRequest) (*pb.ListMyBidsResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).ListMyBids(ctx, req)
}

func (c *Client) BrowseListings(ctx context.Context, req *pb.BrowseListingsRequest) (*pb.BrowseListingsResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).BrowseListings(ctx, req)
}

func (c *Client) GetListing(ctx context.Context, req *pb.GetListingRequest) (*pb.GetListingResponse, error) {
	return pb.NewMarketplaceServiceClient(c.conn).GetListing(ctx, req)
}
