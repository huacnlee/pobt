<p align="center"><img src="icon.png" width="128" height="128" alt="POBT"></p>

<h1 align="center">POBT</h1>

<p align="center">
  <b>POB 构筑的多语言翻译</b><br>
  <a href="README.md">English</a> | 简体中文 · <a href="https://huacnlee.github.io/pobt/zh-CN/">官网</a>
</p>

<p align="center"><img src="docs/screenshot.png" alt="POBT 启动界面" width="800"></p>

<p align="center">
  <img src="docs/screenshot-tree.png" alt="翻译后的天赋树" width="49%">
  <img src="docs/screenshot-pob.png" alt="翻译后的配置页" width="49%">
</p>

POBT 直接运行你电脑上已有的 [Path of Building Community](https://pathofbuilding.community/)（流放之路 1 和 2），
并把整个界面翻译成中文：技能、物品、天赋、计算结果，一应俱全。支持简体中文、繁體中文和한국어。

- 不修改任何 Path of Building 文件，你的 BD 仍在原来的位置。
- 随时按 **Ctrl+Shift+T** 切换中文 / 英文。
- 有新版本时自动更新。

## 下载

**[下载 POBT Windows 版（zip）](https://github.com/huacnlee/pobt/releases/latest/download/pobt-windows-x86_64.zip)**

1. 把压缩包解压到任意位置（右键 → 全部解压缩）。
2. 运行 `POBT.exe`。Windows 提示新程序时，点 **更多信息**，再点 **仍要运行**。
3. POBT 会自动找到 Path of Building；找不到时手动选择它的文件夹。
4. 选好游戏和语言，点 **启动**。

也可以用 PowerShell 安装（会创建开始菜单和桌面快捷方式，再次运行即可更新）：

```powershell
irm https://huacnlee.github.io/pobt/install.ps1 | iex
```

## 运行需要

- 64 位 Windows 10 或 11
- 已安装 [Path of Building Community](https://pathofbuilding.community/)（流放之路 1、2 任一或全部）

## 常见问题

**Path of Building 更新了，POBT 跟得上吗？** 跟得上：POBT 运行的就是你安装的 Path of Building，照常更新即可。

**发现翻译错误或缺失？** 翻译是 [`trs/`](trs) 下的 CSV 文件，欢迎提 Issue 或 Pull Request，参见
[CONTRIBUTING.md](CONTRIBUTING.md)。

## 致谢

- [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)：POBT 运行的构筑工具。
- [PoeCharm2](https://github.com/Chuanhsing/PoeCharm2)：翻译数据由其贡献者整理（[`trs/SOURCE.md`](trs/SOURCE.md)）。
- [Native Shell](https://nsh.dev)：POBT 使用的框架。

Path of Exile（流放之路）是 Grinding Gear Games 的商标。POBT 与 Grinding Gear Games 及 Path of Building Community
无关。POBT 以 [Apache License 2.0](LICENSE) 开源。
