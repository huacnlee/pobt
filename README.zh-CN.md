<p align="center"><img src="icon.png" width="128" height="128" alt="POBT"></p>

<h1 align="center">POBT</h1>

<p align="center">
  <b>POB 构筑的多语言翻译</b><br>
  <a href="README.md">English</a> | 简体中文 · <a href="https://huacnlee.github.io/pobt/zh-CN/">官网</a>
</p>

<p align="center"><img src="website/public/screenshot.png" alt="POBT 启动界面" width="800"></p>

<p align="center">
  <img src="website/public/screenshot-tree.png" alt="翻译后的天赋树" width="32%">
  <img src="website/public/screenshot-pob.png" alt="翻译后的计算页" width="32%">
  <img src="website/public/screenshot-pob2.png" alt="翻译后的流放之路 2 Path of Building" width="32%">
</p>

POBT 直接运行你电脑上已有的 [Path of Building Community](https://pathofbuilding.community/)（流放之路 1 和 2），
并把整个界面翻译成中文：技能、物品、天赋、计算结果，一应俱全。支持简体中文、繁體中文和한국어。

- 不修改任何 Path of Building 文件，你的 BD 仍在原来的位置。
- 随时按 **Ctrl+Shift+T** 切换中文 / 英文。
- 翻译是 `POBT.exe` 旁边 `trs` 文件夹里的 CSV 文件，可以自己修改或补充（POBT 更新时会覆盖这个文件夹，改过的内容请自己备份）。
- 有新版本时自动更新。
- **角色导入**：从账号导入角色，复制 POB 代码或保存到 Path of Building，见下文。
- **AI 构筑分析**：在「工具」菜单里选一个构筑（或粘贴构筑代码），调用你电脑上已安装的 Claude Code 或 Codex，从伤害、防御、恢复、异常状态、功能、装备六个维度打分，并给出优先改进项。POBT 不保存任何密钥，AI 以你已登录的身份运行。

## 角色导入

<p align="center"><img src="website/public/screenshot-characters.png" alt="角色导入页" width="800"></p>

在启动器（或 Path of Building 上方）点 **工具 → 角色导入**，列出账号下的角色，一键复制 POB 代码，或保存到
Path of Building 的构筑列表。

- **流放之路**：国际服（PC、Xbox、PS）填写账号名，私密资料再加 POESESSID；腾讯服填写 POESESSID。腾讯服的中文物品
  会先翻译回英文再导入。
- **流放之路 2**：国际服像 Path of Building 2 一样，在浏览器里登录 pathofexile.com 授权；腾讯服粘贴 WeGame 角色
  分享链接：在 WeGame 的流放之路 2 助手里打开角色数据，点右上角「一键分享」。


## 构建编辑器

POBT 启动后直接进入自己的构建界面：天赋树、技能、物品、计算、配置与备注，全新界面并已翻译。所有数字都出自
Path of Building 本身：你安装的 Path of Building 在后台无窗口运行，承担全部计算，因此结果准确，并随 Path of Building
的每次更新自动跟进。第一个界面列出 Path of Building 的构建文件夹，保存时写回同一个文件，两边共享所有构建。经典版
Path of Building（原窗口界面）仍可从**工具 → 经典版 Path of Building（旧版）**进入。

## 性能

POBT 可以代替 Path of Building 自带的程序使用：它运行的是 Path of Building 自己的代码，只是用 POBT 自己的程序代替了
`Path of Building.exe` 和它的图形运行时。在同一台电脑上，打开同一个 BD、停在天赋树页实测：

| | POBT 0.2.0 | Path of Building 2.68.1 |
| --- | ---: | ---: |
| 启动到看到 BD | **2.70 秒** | 3.38 秒 |
| 启动到看到 BD 列表 | **1.51 秒** | 1.87 秒 |
| 空闲时 CPU | **单核的 8.0%** | 单核的 46.4% |
| 私有内存 | **893 MB** | 1,011 MB |
| 加载 BD 时的私有内存峰值 | **1,007 MB** | 1,507 MB |
| 工作集内存 | 725 MB | **517 MB** |
| 运行需要的原生文件 | 50 MB（压缩后 20 MB） | **28 MB**（压缩后 11 MB） |

测量方法：

- **版本**：官方发布的 POBT 0.2.0 安装包。
- **次数**：每项 5 次热启动取中位数。
- **测试机**：i7-13700KF、32 GB 内存、RTX 3060 Ti、Windows 11。
- **窗口**：两个窗口都是 1600×1000，且都在前台。
- **POBT**：显示中文。
- **启动时间**：以屏幕上出现 Path of Building 界面为终点。POBT 的时间等于打开启动器的时间，加上点击「启动」到出现
  Path of Building 界面的时间。
- **CPU 和内存**：在 BD 打开、加载平稳后测 30 秒，CPU 取这 30 秒的平均占用。
- **原生文件**：各自运行需要的全部原生文件。Path of Building：exe、全部 DLL（图形、C++ 运行库、Lua 及其模块）和
  `SimpleGraphic` 及字体。POBT：自己的程序，加上它加载的 5 个 Path of Building 的 Lua DLL。两者共用的 Lua 代码和数据、
  POBT 的翻译文件都不计入。
- **工作集内存**：POBT 把天赋树的贴图放在内存里，Path of Building 放在显存里（POBT 只用一半显存）；翻译词典约占
  45 MB。其中大部分处于闲置状态：清空工作集后，两者都只用回约 70 MB。

## 下载

**[下载 POBT Windows 版（zip）](https://github.com/huacnlee/pobt/releases/latest/download/pobt-windows-x86_64.zip)**

1. 把压缩包解压到任意位置（右键 → 全部解压缩）。
2. 运行 `POBT.exe`。Windows 提示新程序时，点 **更多信息**，再点 **仍要运行**。
3. POBT 会自动找到 Path of Building；找不到时手动选择它的文件夹，或点「安装」从 GitHub 下载最新版。
4. 选好游戏和语言，点 **启动**。

也可以用 PowerShell 安装（会创建开始菜单和桌面快捷方式，再次运行即可更新）：

```powershell
irm https://huacnlee.github.io/pobt/install.ps1 | iex
```

macOS（Apple 芯片）或 Linux（x86_64、arm64）用下面的命令安装或更新：

```bash
curl -fsSL https://huacnlee.github.io/pobt/install.sh | bash
```

脚本会校验 checksum；macOS 把 `POBT.app` 放进「应用程序」，Linux 安装到 `~/.local/share/pobt`，并添加 `pobt` 命令和启动器入口。

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
