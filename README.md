<p align="center"><img src="icon.png" width="128" height="128" alt="POBT"></p>

<h1 align="center">POBT</h1>

<p align="center">
  <b>Path of Building, in your language.</b><br>
  English | <a href="README.zh-CN.md">简体中文</a> · <a href="https://huacnlee.github.io/pobt/">Website</a>
</p>

<p align="center"><img src="website/public/screenshot.png" alt="The POBT launcher" width="800"></p>

<p align="center">
  <img src="website/public/screenshot-tree.png" alt="The passive tree, translated" width="32%">
  <img src="website/public/screenshot-pob.png" alt="The calculations, translated" width="32%">
  <img src="website/public/screenshot-pob2.png" alt="Path of Building for Path of Exile 2, translated" width="32%">
</p>

POBT runs the [Path of Building Community](https://pathofbuilding.community/) you already have — for Path of Exile
and Path of Exile 2 — with its whole interface translated: skills, items, passives and calculations. Simplified
Chinese, Traditional Chinese and Korean are included.

- Your Path of Building files are never modified; your builds stay where they are.
- Press **Ctrl+Shift+T** at any time to switch to English and back.
- The translations are plain CSV files in the `trs` folder beside `POBT.exe`: edit them to fix one or add your own (an update of POBT replaces the folder, so keep a copy of your changes).
- POBT updates itself when a new version is out.

## Performance

POBT can stand in for Path of Building's own program: it runs Path of Building's code with its own program in place
of `Path of Building.exe` and its graphics runtime. Measured on the same PC with the same build open on the passive
tree:

| | POBT 0.2.0 | Path of Building 2.68.1 |
| --- | ---: | ---: |
| Start to the build on screen | **2.71 s** | 3.33 s |
| Start to the build list | **1.65 s** | 2.06 s |
| CPU while idle | **8.8% of a core** | 47.3% of a core |
| Private memory | **895 MB** | 1,022 MB |
| Peak private memory while loading | **1,016 MB** | 1,510 MB |
| Working set | 724 MB | **514 MB** |
| Program size | 48 MB (19 MB zipped) | **20 MB** of native files |

How it was measured:

- **Runs**: medians of 3 to 4 warm runs.
- **Machine**: i7-13700KF, 32 GB of memory, RTX 3060 Ti, Windows 11.
- **Windows**: both windows were 1600×1000 and in front.
- **POBT**: showing Chinese.
- **Startup**: ends when the screen shows Path of Building. For POBT it adds the time to its launcher and the time
  from **Start** to Path of Building on screen.
- **CPU and memory**: taken over 30 s once the build was open and loading had settled. CPU is the process's average
  over those 30 s.
- **Program size**: POBT's unpacked program without its translations, against the native files of Path of Building
  that it replaces: `Path of Building.exe`, `SimpleGraphic.dll` and their DLLs.

## Download

**[Download POBT for Windows (.zip)](https://github.com/huacnlee/pobt/releases/latest/download/pobt-windows-x86_64.zip)**

1. Unpack the zip anywhere (right-click → Extract All).
2. Run `POBT.exe`. Windows may warn about a new program: choose **More info**, then **Run anyway**.
3. POBT finds Path of Building on its own; if it does not, choose its folder, or press **Install** to download it from its GitHub release.
4. Pick the game and the language, then **Start**.

Or install it with PowerShell, which adds Start menu and desktop shortcuts and updates POBT when run again:

```powershell
irm https://huacnlee.github.io/pobt/install.ps1 | iex
```

## Requirements

- 64-bit Windows 10 or 11
- [Path of Building Community](https://pathofbuilding.community/) for Path of Exile 1, 2 or both

## Questions

**Path of Building updated — does POBT keep up?** Yes: POBT runs the Path of Building you have installed, so update
Path of Building as usual.

**A translation is wrong or missing.** Translations are CSV files in [`trs/`](trs); issues and pull requests are
welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

- [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding), the planner POBT runs.
- [PoeCharm2](https://github.com/Chuanhsing/PoeCharm2), whose contributors wrote the translations ([`trs/SOURCE.md`](trs/SOURCE.md)).
- [Native Shell](https://nsh.dev), the framework POBT is built with.

Path of Exile is a trademark of Grinding Gear Games. POBT is not affiliated with Grinding Gear Games or the Path of
Building Community. POBT is licensed under the [Apache License 2.0](LICENSE).
