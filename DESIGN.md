# POBT design

POBT has two faces. The **launcher** (src/App.tsx) is drawn in Path of Exile 2's own look — gold trim, plaques, the
gate shader — with its art and colours inline, as it always was. The **build editor** (src/editor/) is POBT's own
desktop interface over the official Path of Building, which runs with no window (ext/pobt-native/src/host/service.rs)
and does every calculation: the editor shows POB's own numbers and text, never computes or formats a game number.
Its look follows the launcher's (the gate behind its first screen, gold trim, Cinzel titles); its layout follows
go-pob's screens; its detail, Path of Building's.

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
- The launcher's trim: `trim`, `trim-hi` (aged gold lines) and `jewel` (the rule's red jewel), for `src/ui/art.tsx`.

**Data colours.** Path of Building colours its own text (`^xRRGGBB`, stat label colours, damage types). Those are game
data and are drawn as given (ColoredText, the sidebar), POB's white shown as `foreground`.

## Components

`src/ui/` wraps `nsh/base`: Button (primary, secondary, ghost, destructive; sm 28pt, md 32pt), TabBar, Segmented,
Panel, Divider, Badge, EmptyState, TextField, TextArea, Select, Switch, Checkbox, NumberField, FieldRow, ProgressBar,
Text (display, title, heading, body, label, caption, mono × tones), Hint, ListRow, Modal; and the launcher's art:
Backdrop (the gate, dimmed), Rule (gold rule with a jewel), Framed (double gold trim). Pages use only these; a missing
look becomes a variant there.

**Pictures.** The passive tree draws Path of Building's own art (TreeData). Items and gems, which POB has no art for,
show the game's pictures (`src/editor/art.tsx`: RePoE's lists lead a name to its art, the picture is the official
site's), at a fixed size so rows never move when one loads.

## Motion

Tokens (`src/ui/motion.ts`): instant 120, fast 180, base 240, slow 360, slower 500 ms; ease-out; press scale 0.97.
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

## Language

Everything Path of Building says goes through `tr()` (the trs dictionaries, shared with the Lua POB). POBT's own words
are `t()` keys in `src/editor/i18n.ts`, in every language the launcher offers.
