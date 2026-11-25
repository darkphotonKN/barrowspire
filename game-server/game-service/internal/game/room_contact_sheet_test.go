package game

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/require"
)

/**
* TestRoomContactSheet is a record, not a gate (FS-KE075 §Change: Room variety,
* Acceptance "a contact sheet"): with ROOM_CONTACT_SHEET=<png path> it draws
* six built floors, floor 1 and floor 2 of three seeded runs, a cell to
* sheetCell px, each room's floor tinted by its contents, and what stands on
* the floor marked: a monster red, a container gold, a trap orange, a seal
* piece violet, an encounter NPC white, the stairs cyan.
**/
func TestRoomContactSheet(t *testing.T) {
	path := os.Getenv("ROOM_CONTACT_SHEET")
	if path == "" {
		t.Skip("set ROOM_CONTACT_SHEET=<png path> to draw the sheet")
	}
	const sheetCell, gap, across = 8, 16, 3
	var floors []*Session
	for seed := uint64(1); seed <= 3; seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		floors = append(floors, s)
	}
	cols, rows := floors[0].dungeon.layout.Cols, floors[0].dungeon.layout.Rows
	w, h := cols*sheetCell, rows*sheetCell
	img := image.NewRGBA(image.Rect(0, 0, across*(w+gap)+gap, 2*(h+gap)+gap))
	fill(img, img.Bounds(), color.RGBA{24, 22, 20, 255})
	for row := range 2 {
		for i, s := range floors {
			if row == 1 {
				require.NoError(t, s.regenerateFloor())
			}
			require.NotNil(t, s.dungeon)
			drawFloor(img, s, gap+i*(w+gap), gap+row*(h+gap), sheetCell)
		}
	}
	out, err := os.Create(path)
	require.NoError(t, err)
	defer out.Close()
	require.NoError(t, png.Encode(out, img))
}

// contentTint is the floor colour of a room holding c.
var contentTint = map[roomContent]color.RGBA{
	contentRole:      {96, 132, 96, 255},
	contentClaimed:   {120, 96, 150, 255},
	contentQuiet:     {70, 96, 140, 255},
	contentMonsters:  {150, 80, 72, 255},
	contentTrap:      {168, 120, 60, 255},
	contentContainer: {160, 146, 84, 255},
}

func drawFloor(img *image.RGBA, s *Session, ox, oy, size int) {
	d := s.dungeon
	l := d.layout
	at := func(cx, cy int) image.Rectangle {
		return image.Rect(ox+cx*size, oy+cy*size, ox+(cx+1)*size, oy+(cy+1)*size)
	}
	fill(img, image.Rect(ox, oy, ox+l.Cols*size, oy+l.Rows*size), color.RGBA{10, 10, 12, 255})
	for _, wall := range l.Walls {
		x0, y0 := int(wall.X/l.CellSize), int(wall.Y/l.CellSize)
		for cx := x0; cx < x0+int(wall.W/l.CellSize); cx++ {
			for cy := y0; cy < y0+int(wall.H/l.CellSize); cy++ {
				fill(img, at(cx, cy), color.RGBA{92, 88, 84, 255})
			}
		}
	}
	for c, region := range d.region {
		if region == 0 {
			continue
		}
		tint := color.RGBA{136, 128, 116, 255}
		if region <= len(l.Rooms) {
			tint = contentTint[d.content(region-1)]
		}
		fill(img, at(c%l.Cols, c/l.Cols), tint)
	}
	for _, e := range s.EntityManager.GetAllEntities() {
		tc, ok := e.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		var mark color.RGBA
		switch {
		case e.HasComponent(ecs.ComponentTypeEnemy):
			mark = color.RGBA{230, 40, 30, 255}
		case e.HasComponent(ecs.ComponentTypeContainer):
			mark = color.RGBA{255, 214, 60, 255}
		case e.HasComponent(ecs.ComponentTypeTrap):
			mark = color.RGBA{255, 140, 0, 255}
		case e.HasComponent(ecs.ComponentTypeSealPiece):
			mark = color.RGBA{200, 120, 255, 255}
		case e.HasComponent(ecs.ComponentTypeEncounterNPC):
			mark = color.RGBA{250, 250, 250, 255}
		case e.HasComponent(ecs.ComponentTypeStairs):
			mark = color.RGBA{60, 230, 230, 255}
		default:
			continue
		}
		p := tc.(*components.TransformComponent)
		x, y := ox+int(p.X/l.CellSize*float64(size)), oy+int(p.Y/l.CellSize*float64(size))
		fill(img, image.Rect(x-2, y-2, x+3, y+3), mark)
	}
}

func fill(img *image.RGBA, r image.Rectangle, c color.RGBA) {
	r = r.Intersect(img.Bounds())
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			img.SetRGBA(x, y, c)
		}
	}
}
