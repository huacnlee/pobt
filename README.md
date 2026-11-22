# POBT

English | [简体中文](README.zh-CN.md)

[Path of Building](https://github.com/PathOfBuildingCommunity/PathOfBuilding) (Path of Exile 1 and 2) with a
translated interface, built with [Native Shell (NSH)](https://nsh.dev) as a successor to PoeCharm2. Simplified Chinese,
Traditional Chinese and Korean are included.

## How it works

POBT changes no file of Path of Building. It runs POB's Lua on the LuaJIT POB ships (`lua51.dll`) and implements the
SimpleGraphic API POB is written against:

- `src/host.rs`: runs POB on its own thread and provides `DrawImage`, `DrawString`, sub scripts (`LaunchSubScript`)
  and the rest; every frame's draw commands go to the UI thread.
- `src/translate.rs`: replaces the English that reaches `DrawString` / `DrawStringWidth` with the translation, with
  number templates (`{0}`, `#`) and colour escapes (`^7`, `^xRRGGBB`) kept; text in edit boxes is left as typed.
- `src/text.rs`: lays text out with the widths of Microsoft YaHei and Consolas, so POB's layout follows the translated
  text.
- `src/images.rs`, `src/dds.rs`: images, tinted copies, and POB2's BC7 `.dds.zst` textures.
- `src/lib.rs`: the `PobCanvas` component (drawing on an NSH canvas, forwarding the mouse and keys) and the `Pob`
  module.
- `App.tsx`: the launcher (game, POB folder, language) and the update check.

Press **Ctrl+Shift+T** while POB runs to switch between the translation and English.

## Running

You need Path of Building Community installed (PoE1 and/or PoE2) and [nsh](https://nsh.dev/docs/installation).

```sh
nsh run
nsh package --target windows
```

POBT updates itself from this repository's GitHub Releases.

## Translations

The translations in `trs/` come from [PoeCharm2](https://github.com/Chuanhsing/PoeCharm2) and remain the work of its
authors and contributors; see [`trs/SOURCE.md`](trs/SOURCE.md). Each file is a two-column CSV, `English,translation`,
where `{0}`, `{1}` or `#` stand for numbers.
