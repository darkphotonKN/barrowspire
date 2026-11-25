package game

import (
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

/**
* The search over pushes that keeps a Weighted Plates room solvable
* (FS-5FZ4J §C R20): whether one delver, entering the room at start, can push
* its blocks onto every plate, one block after another, each block on its
* plate staying put for the rest. Cells are the room's own, (0, 0) its
* top-left; the room holds nothing but its blocks, its plates and open floor,
* and a block never leaves it. A plate a block has not covered is floor to
* both a body and a block.
*
* A plan it finds can be walked in play, so a placement it passes is
* solvable. It tries every order of plates and blocks but takes the first push
* path each block finds, so it may turn down a placement a cleverer delver
* could solve: the build then draws another, as it does for any that fails.
**/
func platesCoverable(w, h int, plates, blocks []components.Cell, start components.Cell) bool {
	if len(blocks) < len(plates) {
		return false
	}
	r := pushRoom{w: w, h: h}
	return r.coverAll(plates, blocks, nil, r.index(start))
}

// pushRoom is a room as the search walks it, w x h cells.
type pushRoom struct {
	w, h int
}

func (r pushRoom) index(c components.Cell) int { return c.Y*r.w + c.X }

// step is the cell one step from cell along (dx, dy); false off the room.
func (r pushRoom) step(cell, dx, dy int) (int, bool) {
	x, y := cell%r.w+dx, cell/r.w+dy
	if x < 0 || y < 0 || x >= r.w || y >= r.h {
		return 0, false
	}
	return y*r.w + x, true
}

// coverAll is whether, from player, the blocks can be pushed onto every
// plate, the covered cells already holding a block on its plate.
func (r pushRoom) coverAll(plates, blocks, covered []components.Cell, player int) bool {
	if len(plates) == 0 {
		return true
	}
	for i, plate := range plates {
		for j, block := range blocks {
			others := slices.Concat(covered, slices.Delete(slices.Clone(blocks), j, j+1))
			end, ok := r.pushTo(r.index(block), r.index(plate), player, others)
			if !ok {
				continue
			}
			rest := slices.Delete(slices.Clone(blocks), j, j+1)
			if r.coverAll(slices.Delete(slices.Clone(plates), i, i+1), rest, append(slices.Clone(covered), plate), end) {
				return true
			}
		}
	}
	return false
}

// pushTo searches, breadth first over where the block and the player stand,
// for pushes that bring the block from its cell to target with the other
// blocks standing fast; where the player ends, true when it can.
func (r pushRoom) pushTo(block, target, player int, others []components.Cell) (int, bool) {
	n := r.w * r.h
	fixed := make([]bool, n)
	for _, c := range others {
		fixed[r.index(c)] = true
	}
	if fixed[player] || player == block {
		return 0, false
	}
	seen := make([]bool, n*n)
	seen[block*n+player] = true
	queue := []int{block*n + player}
	for i := 0; i < len(queue); i++ {
		b, p := queue[i]/n, queue[i]%n
		if b == target {
			return p, true
		}
		for _, d := range [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			next, in := r.step(p, d[0], d[1])
			if !in || fixed[next] {
				continue
			}
			nb := b
			if next == b {
				// a push: the block moves on that way, if the cell beyond is free
				beyond, in := r.step(b, d[0], d[1])
				if !in || fixed[beyond] {
					continue
				}
				nb = beyond
			}
			if state := nb*n + next; !seen[state] {
				seen[state] = true
				queue = append(queue, state)
			}
		}
	}
	return 0, false
}
