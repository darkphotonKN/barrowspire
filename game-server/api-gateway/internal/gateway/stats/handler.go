package stats

import (
	"net/http"
	"strconv"

	"github.com/darkphotonKN/barrowspire-server/api-gateway/internal/httperr"
	pb "github.com/darkphotonKN/barrowspire-server/common/api/proto/stats"
	"github.com/darkphotonKN/barrowspire-server/common/apperr"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	client StatsClient
}

func NewHandler(client StatsClient) *Handler {
	return &Handler{
		client: client,
	}
}

func (h *Handler) GetPlayerStats(c *gin.Context) {
	const op = "GetPlayerStats"
	playerID := c.Param("playerId")
	if playerID == "" {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "player ID is required"))
		return
	}

	stats, err := h.client.GetPlayerStats(c.Request.Context(), &pb.GetPlayerMatchStatsRequest{
		MemberId: playerID,
	})

	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (h *Handler) GetLeaderboard(c *gin.Context) {
	const op = "GetLeaderboard"
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")

	l, err := strconv.Atoi(limitStr)
	if err != nil || l > 50 || l < 0 {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "limit must be between 0 and 50."))
		return
	}
	limit := int32(l)

	o, err := strconv.Atoi(offsetStr)
	if err != nil || o < 0 {
		httperr.Write(c, op, apperr.WithDetail(apperr.ErrValidation, "offset must be 0 or greater."))
		return
	}
	offset := int32(o)

	res, err := h.client.GetLeaderboard(c.Request.Context(), &pb.GetLeaderboardRequest{
		Limit:  &limit,
		Offset: &offset,
	})

	if err != nil {
		httperr.Write(c, op, err)
		return
	}

	c.JSON(http.StatusOK, res)
}
