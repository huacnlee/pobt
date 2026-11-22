# Contributing to POBT

## Translations

Translations live in `trs/<language>/` as two-column CSV files, `English,translation`. `{0}`, `{1}` or `#` stand
for the numbers of the text: `"+{0} to maximum Life",+{0} 最大生命`. The English must match what Path of Building
draws, without its colour codes (`^7`, `^xRRGGBB`). Press **Ctrl+Shift+T** in POBT to see the English of a screen.

They are not built into the app: the release puts the `trs` folder beside `POBT.exe`, where anyone can edit them
(an update of POBT replaces it). A development run reads the one in the source tree.

## How it works

POBT changes no file of Path of Building. It runs POB's Lua on the LuaJIT POB ships (`lua51.dll`) and implements the
SimpleGraphic API POB is written against.

| File | What it does |
| --- | --- |
| `src/host.rs` | Runs POB on its own thread: SimpleGraphic's functions (`DrawImage`, `DrawString`, `LaunchSubScript`, …), its callbacks, sub scripts, and the frames it draws |
| `src/prelude.lua` | The Lua half of the API: image handles, file searches, modules, `PCall` |
| `src/lua.rs` | A small binding to `lua51.dll`, loaded at run time so POB's native modules share the VM |
| `src/translate.rs` | The dictionary: exact matches and number templates, colour codes kept |
| `src/text.rs` | Colour escapes, measuring and laying out text with Microsoft YaHei / Consolas |
| `src/images.rs`, `src/dds.rs` | Images for the canvas: tinted copies, art slices, POB2's `.dds.zst` textures |
| `src/lib.rs` | The `PobCanvas` component (an NSH canvas, mouse and keys) and the `Pob` module |
| `src/trs.rs` | The translation data, built in or from a `trs` folder |
| `App.tsx` | The launcher and the update check |

## Developing

You need Windows, Rust and the [nsh CLI](https://nsh.dev/docs/installation), at the version of the `nsh-*` crates in
`Cargo.toml`, and Path of Building Community installed.

```sh
nsh run                       # the app, rebuilt as you edit
nsh check                     # cargo check, then type checks App.tsx
cargo test --lib              # the dictionary and translation file tests
nsh package --target windows  # POBT.zip
```

The website is in `website/` (Astro, Bun): `bun install && bun run dev`.

The art in `assets/ui` and `icon.png` is drawn by scripts (`bun add @resvg/resvg-js` first): `bun scripts/ui-art.mjs` (the plaques), `bun scripts/title-art.mjs <Cinzel.ttf>` (the title) and `bun scripts/icon-art.mjs <Cinzel.ttf>` (the icon), with [Cinzel](https://github.com/google/fonts/tree/main/ofl/cinzel).

## Releasing

Bump `version` in `nsh.json` and `Cargo.toml`, then push a tag `vX.Y.Z`. The Release workflow packages Windows,
writes the updater's `latest.json` and publishes the GitHub release; installed apps update from it.
