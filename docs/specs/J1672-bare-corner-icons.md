# FS-J1672: Bare corner icons

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Bare corner icons → FS-J1672`: [FS-3EBCA](3EBCA-hud-corner-icons.md) (the corner row's plates, R2, R3), [FS-1GZGD](1GZGD-in-game-mailbox.md) (the envelope's plate and wax seal, D12, R33, R35, § Change C2) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (the HUD is on the game palette) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Envelope**, **Count badge**, **Wax seal**, **Corner row**

> Promoted `--from-thread` on 2026-11-13 from the locked scoping notes: the owner's approved
> charter (2026-11-13). Requirements marked **(charter default)** are that charter's D1–D7, each
> with its reason. Those marked **(spec)** fill an acceptance-level gap the charter left, and are
> this spec's own. Code citations are against `92f5daae`.

## Summary

The five icons in the bottom-right corner (Menu, Inventory, Character, Party and the Mailbox)
lose the carved plate each one stands on: only their amber line glyphs are drawn, straight over
the world. The town envelope also loses the wax seal at its flap's point; the count of letters
waiting moves to a small ember badge at the envelope's top-right corner. Where the icons are, how
big a press target they are, what they do, their keys and their hover labels stay the same.

The owner, 2026-11-13: 「把ui右下角的功能icon移除外匡 信箱icon中間的圈圈有點怪拿掉」 (take the frame
off the function icons in the UI's bottom-right corner; the circle in the middle of the mailbox
icon looks a bit odd, take it out), then on the seal: 「只有中間那個圈圈拿掉 不然就改一下造型」
(just take out that middle circle, or else change its shape a little).

## Bounds

Issues under this FS may change `game-client/src/ui/HudCorner.ts`,
`game-client/src/ui/MailboxEnvelope.ts` and their tests (`HudCorner.test.ts`; the envelope's
`describe` blocks in `LetterPanel.test.ts`, or a new `MailboxEnvelope.test.ts`).

They may **not** change `carvedPanel` (the dialogue, the chat window and every panel frame wear
it), `hudCornerLayout.ts` or `letterPanelLayout.ts` (the rects), the letter panel, the mailbox
store or `@/mailbox/mailbox`, any scene's wiring, any server, proto or gateway, or the existing
text of an owning FS. A slice that finds one of these unavoidable stops and escalates.

## Facts this spec rests on

Verified 2026-11-13 on `92f5daae`; paths under `game-client/src/`.

- **The row** (`ui/HudCorner.ts` `draw`) draws, for each icon, `carvedPanel(g, f…, { opacity:
  0.85 })` into the icon's graphics, then the glyph: Menu `drawGear`, Inventory `drawBag`,
  Character `drawBust`, Party `drawParty`, all line strokes in `palette.interactable` at 0.85,
  `palette.interactableBright` at 1 under the pointer. The greyed Mailbox (outside the town) is
  `drawEnvelopeLines` in `palette.hudFaint` at 0.6 plus a dark `drawWaxSeal(…, 8, false)`.
- **`carvedPanel`** (`ui/carvedPanel.ts`) is the plate: a drop shadow, two grounds, a lit top
  edge, a double brass rule and a brass stud at each corner.
- **The Party glyph** (`drawParty`) draws its front bust over the back one by first filling the
  front bust's shape in `palette.hudPanel` (the plate's umber), which hides the back bust's
  lines behind it. The other glyphs fill nothing.
- **The envelope** (`ui/MailboxEnvelope.ts`) draws its own plate (`drawBody`: `carvedPanel` at
  0.85, then `drawEnvelopeLines`), a wax seal of radius 8 at the flap's point (`drawSeal`,
  `envelopeSealAt`: ember with drips and a bright rim when lit, `palette.ink` when dark) and,
  when lit, the count (`min(waitingCount, 99)`, 11 px bold `palette.hudText`) on the seal. Lit
  and count come from `sealState` (`@/mailbox/mailbox`). The torch glow (`drawGlow`) is 14
  rounded rects round the plate's rect, faded in and out by the pulse tween.
- **The envelope's lines** sit in the rect 11 px in from the plate's left, top and right and
  10 px up from its foot (36 × 25 inside 58 × 46); the flap runs from the top corners down to
  the point at 58% of that rect's height, where the seal sits, so the two flap lines already meet
  there under it.
- **`drawWaxSeal`** is also the letter list's unread dot (`ui/LetterPanel.ts`, radius 4, lit).
- **Each icon's zone** is its 58 × 46 rect from `cornerIconFrame` / `envelopeFrame`
  (`ui/hudCornerLayout.ts`), at depth 1000, a hand cursor unless greyed; `HudCorner.covers` reads
  the same rects. At 1080 × 720: Menu (1006, 658), Inventory (940, 658), Character (874, 658),
  Party (808, 658), Mail (742, 658); at 1280 each 200 px further right.

## Requirements

1. **No plates.** No corner icon draws a plate: no `carvedPanel`, no shadow, ground, brass rule
   or stud, for any of the five icons, the town envelope and the greyed Mailbox included. Only the
   line glyph is drawn, over the world. **(charter default, D1: the owner asked for the frame
   gone; half a plate looks unfinished)**
2. **Glyphs unchanged.** Each glyph keeps its shape, place in its rect, line width and colours:
   `palette.interactable` at 0.85, `palette.interactableBright` at 1 under the pointer; the
   greyed Mailbox `palette.hudFaint` at 0.6, never brightening. **(charter default, D3, D7: the
   hover never depended on the plate; redesigning the glyphs is out of v1)**
3. **No fill behind a glyph.** No glyph fills a shape in any colour. The Party glyph's front bust
   still stands in front of the back one, so the back bust's lines are not drawn where the front
   bust covers them, rather than hidden under a `palette.hudPanel` fill, which with no plate under
   it would show as a dark patch over the world. Seen from the player's side the two busts look
   as they did on the plate. **(spec: D1 and D4 together; a fill in the plate's colour is a piece
   of plate, and a dark shape round a glyph is the halo D4 leaves out of v1)**
4. **Hit areas unchanged.** Each icon's 58 × 46 interactive zone stays at its rect, undrawn, with
   the hand cursor (none on the greyed Mailbox); `covers` answers for the same rects; a press in
   the empty part of a rect is still the icon's, never the world's. **(charter default, D2: not
   harder to press)**
5. **Hover unchanged.** Under the pointer the glyph brightens and the label with the icon's name
   and key shows above its rect, 6 px over its top, as before (FS-3EBCA R5); it goes when the
   pointer leaves. **(charter default, D3)**
6. **No outline or halo.** Nothing is added round a glyph for legibility in this change: no dark
   outline, shadow or halo. The owner judges legibility over the town, a field and a run in the
   browser check. **(charter default, D4: smaller v1, don't guess)**
7. **No seal on the envelope.** The envelope draws no wax seal in any state: not lit, not dark,
   and not on the greyed Mailbox outside the town. Its two flap lines meet in a V at the former
   seal point, with nothing over it. **(charter default, D5: the middle circle goes)**
8. **The count badge.** While anything is unread or unclaimed (`sealState(summary).lit`), a small
   ember badge carrying the count, `min(waitingCount, 99)`, sits at the envelope's top-right
   corner; when nothing waits there is no badge. The greyed Mailbox never shows one (nothing of
   the mailbox is fetched outside the town, FS-1GZGD D11). This replaces FS-1GZGD D12's "the
   seal lights with a count": the badge carries the count. **(charter default, D5: the count must
   not vanish)**
9. **The badge's look.** A rounded badge 14 px tall, as wide as its count plus 4 px each side and
   never narrower than 14 px (one digit is a circle, two a short pill), its ends fully round;
   filled `palette.ember` at 1 with a 1 px `palette.interactableBright` rim at 0.85, the lit
   seal's colours; the count centred on it, 11 px bold `palette.hudText`, the font and size the
   seal's count used. Centred on the top-right corner of the envelope's lines, at
   (rect.x + 47, rect.y + 11): (789, 669) at 1080 × 720; if a wide count would carry it, rim
   included, past the icon's 58 × 46 rect, it moves left just far enough to stay inside (the rect
   is the hit area, R4, and the row's 8 px gap stays clear). Drawn over the envelope's lines, at the HUD depth; the pointer does not
   change it. **(spec: D5 names a small ember rounded badge at the top-right corner; its size,
   rim and type are the seal's, so the count reads as it did)**
10. **The pulse stays.** A newer letter still makes the envelope glow a few times (three glows,
    as before), then the badge simply stays. The torch glow keeps drawing round the icon's former
    plate rect, as today. **(charter default, D5, D6: the glow is independent of the plate)**
11. **Everything else stays.** The icons' places, sizes, order, spacing, keys, presses, guards and
    labels; the envelope's toggle and its refusals (FS-1GZGD § Change C1, C4); the glyph shapes;
    `carvedPanel` and every panel that wears it; the letter list's unread seal dot
    (`drawWaxSeal` in `LetterPanel`). **(charter default, D7, and the charter's bounds)**
12. **Palette tokens only.** Every colour is a `palette` token; no raw colour literal (ADR-0013,
    ADR-0025; the lint fence passes). **(charter's bounds)**

### What this changes in its owners

Where an owner's text below and this FS disagree, this FS wins; the owners' text is not edited.

- **FS-3EBCA R2** ("Each icon is a 58 × 46 plate"): the 58 × 46 rect stays as the icon's hit
  area and the place its glyph is drawn in; nothing draws the plate (R1, R4).
- **FS-3EBCA R3** ("Each plate as the envelope's: `carvedPanel` at opacity 0.85, and on it a
  line glyph…"): the glyph alone (R1–R3).
- **FS-3EBCA's acceptance criterion** "Each live icon is drawn on a carved plate at depth 1000
  with its glyph in `interactable`…" reads, from this change: each live icon is drawn with no
  plate at depth 1000, its glyph in `interactable`, brightening to `interactableBright` under the
  pointer; the greyed Mail in `hudFaint`, never brightening, with no seal; no raw colour literal.
- **FS-1GZGD D12, R33, R35** and their acceptance criterion "The seal is lit with
  `waitingCount`…": the envelope is a bare line envelope; the count badge shows `waitingCount`
  (capped at 99) while it is > 0 and is gone at 0; a newer `newestLetterAt` still pulses (R7–R10).
  Where FS-1GZGD (A9.1, R38, R39) says the seal drops at once after a read, a Take or a crumble,
  the badge's count drops at once, or the badge goes.
- **FS-1GZGD § Change C2** ("Its plate, lines, seal, count and pulse are drawn exactly as
  before") and its criterion "its seal, count and pulse are unchanged": the place stays; the
  plate and seal go, the count moves to the badge, the pulse stays.

## User Stories

1. As a player, I want the corner icons drawn without a frame, so that the corner of the screen
   looks lighter and shows more of the world.
2. As a player, I want the icons to keep their places, so that my hand still finds them.
3. As a player, I want to press an icon anywhere in its old square, so that taking the frame away
   never makes it harder to hit.
4. As a player, I want an icon to brighten and name itself and its key under the pointer as it
   did, so that I still learn the keys as I go.
5. As a player in the town, I want the envelope to read as a plain envelope, so that it no longer
   carries an odd circle in its middle.
6. As a player in the town, I want a small count at the envelope's corner while letters wait, so
   that I still see at a glance how many need me.
7. As a player in the town, I want no count once everything is read and taken, so that a count
   always means something to do.
8. As a player in the town, I want the envelope still to glow when a new letter arrives, so that
   I notice it even if the count was already showing.
9. As a player outside the town, I want the greyed envelope bare too, with no circle and no count,
   so that it still reads as the mailbox and as not pressable.
10. As a player, I want the two busts of the Party icon to read as before with no dark patch
    behind them, so that no piece of the old frame is left on the world.
11. As a player, I want the dialogue, the chat window and every panel to keep their carved frames,
    so that only the corner icons change.
12. As the owner, I want to judge in the browser whether bare glyphs read well over the town, a
    field and a run, so that an outline is added only if one is needed.

## Acceptance Criteria

- [ ] No corner icon draws `carvedPanel` (or any rounded-rect ground, brass rule or stud) in the
      town, a field or a run: each icon's graphics hold only its glyph's lines, and the envelope's
      also its badge and glow.
- [ ] Each live glyph is drawn in `interactable` at 0.85 and in `interactableBright` at 1 under
      the pointer; the greyed Mailbox in `hudFaint` at 0.6, unchanged under the pointer.
- [ ] No glyph fills a shape: the Party glyph draws no `hudPanel` (or any) fill, and its back
      bust's lines are not drawn where the front bust stands.
- [ ] Each icon's zone is still its 58 × 46 rect (the five rects of FS-3EBCA §A R2 at 1080 × 720,
      200 px further right at 1280), at depth 1000, with a hand cursor except the greyed Mailbox;
      `covers` answers for the same points.
- [ ] Hover labels are unchanged: "Menu (Esc)", "Inventory (I)", "Character (C)", "Party (T)",
      "Mailbox", "Mailbox · town only", above the rect, gone on leaving.
- [ ] The town envelope draws no circle at its flap's point in any state, lit or dark; the greyed
      Mailbox draws none either. The flap lines still meet at that point.
- [ ] With `waitingCount` 3 the envelope shows a badge reading "3", centred at (789, 669) at
      1080 × 720 (989, 669 at 1280), filled `ember`; with 120 it reads "99" and, rim included,
      stays inside (742, 658, 58, 46); with 0 there is no badge and no count text.
- [ ] After a read, a Take or a crumble that lowers `waitingCount` the badge's count follows at
      once, and it goes when the count reaches 0.
- [ ] A pulse still plays three glows round the icon's rect (the tween as before: yoyo, repeat 2)
      and leaves the badge in place.
- [ ] The letter list still marks an unread row with its lit seal dot; `carvedPanel.ts` is
      unchanged, and the dialogue, chat window and panel frames still draw it.
- [ ] No raw colour literal; `npx vitest run --maxWorkers=4 --minWorkers=1`,
      `npx tsc --noEmit -p .` and `npm run lint` pass in `game-client`.

**By eye (the owner):**

- [ ] The five bare icons read clearly over the town's ground, a field and a run's floor, idle and
      under the pointer; the owner says whether an outline or halo is wanted (a follow-up, not
      this change).
- [ ] The envelope reads as an envelope with no circle in its middle, and its badge's count is
      legible at render scale 1, 1.5 and 2.

## Edge States

- **Nothing waits (or the summary has not come yet):** a bare envelope, no badge.
- **More than 99 waiting:** the badge reads "99".
- **A new letter while the badge already shows:** the glow plays round the rect; the badge's count
  changes to the new summary's.
- **Under the pointer with the badge showing:** the envelope's lines brighten; the badge is as it
  was; the label shows above the rect, the badge under it.
- **Outside the town:** the greyed Mailbox is a bare faint envelope, no seal, no badge, no press.
- **A resize:** glyphs, zones, the badge and the glow move with the corner, as before.
- **A press in the empty part of a rect** (no glyph under the pointer): the icon's press, not an
  attack or a cast (FS-3EBCA R10).
- **The letter panel, the inventory or the character panel open:** they open and close as before;
  the bare row stays in view under the ones that stop above it.

## Out of Scope

- Re-laying out the row: positions, spacing, sizes, order (D7).
- Redesigning any glyph (D7).
- An outline, shadow or halo for legibility (D4; a follow-up only if the owner asks after the
  browser check).
- Any change to `carvedPanel`, the letter panel (its unread seal dot included), the dialogue, the
  chat window or any other panel.
- Badges or counts on Inventory, Character, Party or Menu (FS-3EBCA Out of Scope still holds).
- Renaming `sealState` or `@/mailbox/mailbox`'s seal wording in code.
- Any server, proto, gateway or contract change.
