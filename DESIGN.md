# POBT design

POBT has two faces. The **launcher** (src/App.tsx) is drawn in Path of Exile 2's own look — gold trim, plaques, the
gate shader — with its art and colours inline, as it always was. The **build editor** (src/editor/) is POBT's own
desktop interface over the official Path of Building, which runs with no window (ext/pobt-native/src/host/service.rs)
and does every calculation: the editor shows POB's own numbers and text, never computes or formats a game number.
Its look follows the launcher's (the gate behind its first screen, gold trim, Cinzel titles); its layout follows
go-pob's screens; its detail, Path of Building's. The **market** (src/market/, the Tools menu) is POBT's own too: the
PoE1 market from poe.ninja, the trades worth making in it and a loot filter made from its prices, drawn with the same
controls as the build editor, under the same title bar.

## Targets

Desktop only (macOS, Windows, Linux), pointer and keyboard, window ≥ 960×640. Compact controls (28–32pt), dense
lists. Appearance is dark (`nsh.json`), the theme defines both.

## Tokens

Colours live in `theme.json` (shadcn `cssVars`), never in screens:

- Surfaces: `background`, `card`, `popover`, `sidebar`, `muted`, `accent`; lines `border`, `input`; focus `ring`.
- Text: `foreground`, `muted-foreground`, `primary` (gold, for selection and emphasis).
- Meaning: `warning`, `positive`, `negative`, `destructive`.
- Game roles: `gem-str|dex|int|white` (gem colours), `rarity-normal|magic|rare|unique`.
- Fonts: `font-sans` (UI), `font-display` (Cinzel: titles), `font-mono` (numbers, codes).
- Radius: `--radius` 6pt; rounded-full for pills and switches.
- The launcher's trim: `trim`, `trim-hi` (aged gold lines), `gold` and `jewel` (the rule's red jewel), for `src/ui/art.tsx`;
  `banner`, `banner-hi`, `banner-foreground`: the primary button's red banner; `chrome`: the solid title bar.
- The market: `up` / `down` (rises in red, falls in green, as Chinese markets show them; never colour alone: a sign
  and a trend icon go with them), `heat-up` / `heat-flat` / `heat-down` (the heat map), `chart-1…5` (series).
- Radius: `radius-sm` 4pt for small parts (options, check boxes), `radius` and `radius-lg` 6pt.

**Data colours.** Path of Building colours its own text (`^xRRGGBB`, stat label colours, damage types). Those are game
data and are drawn as given (ColoredText, the sidebar), POB's white shown as `foreground`.

## Components

`src/ui/` wraps `nsh/base`, and every screen but the launcher uses only it (a missing look becomes a variant there).
Its details are the market's (they came from it, refined from the build editor's first controls): a button shows a
spinner while busy, an icon button says what it does in a hint, an empty state carries the icon of what is missing,
a dialog has a line under its title, fields share one frame.

| Component | Look |
| --- | --- |
| `Button` | 28pt (`h-7`), `sm` with `text-xs`. `primary`: the red banner (`banner-hi → banner`), `trim-hi` edge brightening to `gold` on hover, label in Cinzel; `default` / `outline`: bordered `secondary`; `ghost`; `destructive`. An `icon` (and `trailingIcon`); `busy` turns a Spinner in its place; `selected` keeps a toggle lit; `tooltip` for one with only an icon |
| `IconButton`, `Hint`, `TooltipBubble` | 28pt (`sm` 24pt) square ghost with a 14pt icon, its label its hint; hints are a popover box after 500 ms, POPUP |
| `Tabs`, `Segmented` | Tabs: 36pt, a rule under them, a 2pt gold underline sliding to the chosen one. Segmented: 28pt, a `muted` groove, the chosen pill `background` with a border, sliding |
| `Card`, `Section`, `Separator`, `Badge` | Card: rounded, bordered `card`; with a `title`, a 36pt title row with a rule; `bodyClass` pads it (`p-3`). Section: a small muted group label over its content. Badge: a 20pt pill, its tone at 15% fill and 40% edge (`neutral`, `primary`, `warning`, `destructive`, `up`, `down`), with an optional icon |
| `Row` | `min-h-8`, `rounded-sm`, hover `accent/60`, pressed and selected `accent`; `choose` chooses as the pointer goes down (a list's selection) |
| `Input`, `TextArea`, `NumberField`, `Field`, `FieldRow` | 28pt, `border-input` on `background`, the border `ring` while focused; an input may start with an icon; a number's steppers stacked at its right end. Field: label above, hint or error under; FieldRow: label left, control right |
| `Select`, `Menu` | A 28pt field; its popup opens 4pt below, never over it, as wide, `rounded-sm` options, the chosen one gold; searchable, grouped, or drawn by the caller |
| `Switch`, `Checkbox`, `Slider` | 20×36 track turning gold; a 16pt box with its label (`hideLabel` in a table's cell); a 6pt track with a 14pt thumb |
| `Modal`, `confirm` | 480pt (`class` for wider), `popover` with a border, Cinzel title and an optional line under it, actions at the end, `overlay` behind; all of it fades in. `confirm` asks before what cannot be undone |
| `Toaster`, `toast` | Bottom right, at most 380pt, a `trim-hi` edge (red for an error), square, a ringed check / cross / i; 3.5 s, an error 6 s; there only while one shows, so it takes no presses meant for what is under it |
| `Empty`, `ErrorState`, `Skeleton` | A Cinzel title, a muted line, the trim-coloured icon of what is missing above; an error with Retry; placeholders breathing slowly |
| `Accordion` | Cards whose header washes like a Row, the chevron turning, the body springing open (`reveal`) |
| `ProgressBar`, `Spinner` | 6pt round track, gold fill; a ring turning once in 800 ms |
| `Text` | display, title, heading, body, label, caption, mono × default, muted, primary, warning, positive, negative, up, down, destructive |
| `Icon` | Lucide's (nsh-icon), by name, in a tone, 12 / 14 / 16 / 20 / 32pt |
| `HoverCard`, `Popover`, `Peek` | Path of Building's tooltips beside the pointer; a panel opened by a press; a card lined up with a canvas's spot |
| `Backdrop`, `Rule`, `Framed`, `Jewel` | The launcher's art: the gate dimmed, the gold rule with its jewel, the double trim, the jewel alone |

**Pictures.** The passive tree draws Path of Building's own art (TreeData). Items and gems, which POB has no art for,
show the game's pictures (`src/editor/art.tsx`: RePoE's lists lead a name to its art, the picture is the official
site's), at a fixed size so rows never move when one loads. The market's items show the pictures poe.ninja names
(`src/market/ui/ItemArt.tsx`), downloaded once into its cache: 32pt in lists, 40pt on opportunities, 64pt on an item.

## Motion

Tokens (`src/ui/motion.ts`): instant 120, fast 180, base 240, slow 360, slower 500 ms; ease-out; press scale 0.97;
WASH (colours, 120), PRESS (120 × 0.97), FADE (opacity, 240), GROW (360), POPUP (180, from `opacity-0 scale-95`).
Everything has `motion-reduce:` off.

### Motion inventory: build editor

| Change | Tool | Tokens |
| --- | --- | --- |
| Button / tab / row hover, press | colour transition; press scale | WASH 120, PRESS 120 × 0.97 |
| Page tab selected | Tabs indicator slides natively (spring) | built in; instant with reduced motion |
| Page content switch | opacity fade of the shown page | FADE 240 |
| Select / Menu popup | grows from its trigger, fades | POPUP 180, scale 95% → 100% |
| Switch thumb | translate + colour | 180 |
| Data loading bar | width grows with the stages | GROW 360 |
| Calculating | "Calculating" label appears in the header (no spinner flash under 1 s) | — |
| Sidebar values after a change | swap in place (numbers must not move) | none, by design |
| Build list ↔ build | the view swaps; the build's pages keep their state while mounted | — |
| Select popup | opens below its trigger on every desktop (`cover` off) | POPUP 180 |
| Tree pan and zoom | animated values, redrawn natively (no transition) | — |
| Tree hover tooltip | Peek beside the hovered node, in the window's layer (never clipped); fade only | opacity 120 |
| Tree search highlight | appears at once | none, by design |
| Calcs section collapse | chevron rotates 90°; rows appear at once | fast 180 |
| Hover cards (items, gems, options, calcs cells) | HoverCard beside the pointer after a rest (150 ms; calcs 300 ms); POB is asked as the pointer arrives and the card waits for it (≤ 600 ms), so it shows at its final size; fade only | opacity 120 |
| Calcs breakdown pinned (press) | popover beside the cell, flips side when it must; Escape closes | POPUP 180 |
| Calcs wide table | scrolls sideways; its right fade shows while more is hidden | FADE 240 |
| POB recalculating (calcs) | the page dims | FADE 240 |
| Item and gem pictures | appear when loaded, in a box of fixed size | none |

### The market

Under POBT's solid title bar (back to where it was opened from; the market's state at its end), its sections are the
build editor's page tabs: Opportunities, Market, Prices, Watchlist, Ledger, Loot filter, Settings. A page has the build
editor's header (48pt, `card`, the title in gold Cinzel) and ends, where it shows prices, on the line saying they
change and that POBT is not affiliated with Grinding Gear Games.

**Numbers first**: prices, profits and changes in tabular figures, right-aligned, the unit (`c`, `div`) after them.
**No promises**: every opportunity has its risk; the exact quote is the game's. **Everything for everyone**: no
account, no locks.

| Change | Tool | Tokens |
| --- | --- | --- |
| Market updating (title bar) | Spinner; "Updating the market… 12/45" counts in place; Refresh disabled; when done the age shows | instant |
| A failed update | the kept market stays; the status says how old it is, in `warning` | none |
| Opportunity cards, first time | rise 8pt and fade in, 50 ms apart, the first 10 only | slower |
| Filters (all / dips / cycles / risk) | Segmented slides; the list is replaced, no entrance | base |
| First load, nothing kept | skeletons breathe, then the content fades in | base |
| Cycle card open | Accordion springs open, chevron turns 180° | fast |
| Cycle ring (`CycleRing`) | the faint orbit, then each trade's arc drawn in order, its head and labels fading in as it arrives; the closing arc in `up` | slow per arc, base |
| A step checked (opportunity) | the check scales in, the step goes muted; "Write in the ledger" fades to full | fast, base |
| Heat map | tiles grow from their centre the first time, then move in place; hover dims the others | slower, base |
| Price chart | the line draws left to right, volumes rise one after another; the crosshair follows the pointer | slower |
| Watchlist star | the old icon shrinks out, the new grows in | base |
| A row removed (watchlist, ledger) | LayoutAnimation, the others close up | base |
| A trade added | rises 8pt and fades in at the top | slow |
| Filter's threshold slider | follows the pointer 1:1, its value in place | none |
| Done, saved, installed, cleared | Toast | 240 |

With reduced motion all of it is instant: no wave, the skeletons still, the ring drawn whole.

## Language

Everything Path of Building says goes through `tr()` (the trs dictionaries, shared with the Lua POB). POBT's own words
are `t()` keys in `src/editor/i18n.ts`, in every language the launcher offers. The shared controls' and the
market's words are `t()` keys of `nsh/i18n` in `locales/` (English and Chinese; another language falls back to
English), shown in the launcher's language. Item names come from poe.ninja in English; in simplified Chinese they are
Tencent's (`src/market/data/names.zh-CN.json`, by `scripts/tencent-names.ts`). The market's words: Opportunity
机会, Dip 低吸, Arbitrage cycle 套利环, Watchlist 自选, Ledger 账本, Alert 提醒, Liquidity 流动性.
