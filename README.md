# POBT

多语言版 [Path of Building](https://github.com/PathOfBuildingCommunity/PathOfBuilding)（流放之路 / 流放之路 2），
用 [Native Shell (NSH)](https://nsh.dev) 重写的 PoeCharm2 替代品：界面支持简体中文、繁體中文、한국어。

## 原理

POBT 不修改 Path of Building 的任何文件，而是直接用 POB 自带的 LuaJIT（`lua51.dll`）运行它的 Lua 代码，
并自己实现 POB 依赖的 SimpleGraphic 接口：

- `src/host.rs`：在独立线程上运行 POB，实现 `DrawImage`、`DrawString`、子脚本（`LaunchSubScript`）等接口，
  每帧把绘制命令交给界面线程。
- `src/translate.rs`：`DrawString` / `DrawStringWidth` 里的英文按词典替换成译文，支持 `{0}` / `#` 数字模板，
  保留颜色转义（`^7`、`^xRRGGBB`）；输入框里的文字不翻译。
- `src/text.rs`：用微软雅黑 / Consolas 的字形宽度排版，保证 POB 的布局按译文宽度计算。
- `src/images.rs`、`src/dds.rs`：图片、着色副本、POB2 的 BC7 `.dds.zst` 纹理。
- `src/lib.rs`：`PobCanvas` 组件（NSH Canvas 绘制 + 鼠标键盘转发）和 `Pob` 模块。
- `App.tsx`：启动界面（选择游戏、POB 目录、语言）。

运行中按 **Ctrl+Shift+T** 在译文和英文之间切换。

## 运行

需要已安装的 Path of Building Community（PoE1 和/或 PoE2），以及 [nsh](https://nsh.dev/docs/installation)。

```sh
nsh run
nsh package --target windows
```

## 翻译数据

`trs/` 下的翻译数据来自 [PoeCharm2](https://github.com/Chuanhsing/PoeCharm2)，版权归其作者与贡献者，详见
[`trs/SOURCE.md`](trs/SOURCE.md)。翻译格式是两列 CSV：`英文,译文`，`{0}`、`{1}` 或 `#` 代表数字。
