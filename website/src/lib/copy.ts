// The site copy, English and Simplified Chinese.

export type Language = "en" | "zh-CN";

export const REPO = "https://github.com/huacnlee/pobt";
export const ZIP = `${REPO}/releases/latest/download/pobt-windows-x86_64.zip`;
export const RELEASES = `${REPO}/releases`;
export const POB = "https://pathofbuilding.community/";

export interface Copy {
  title: string;
  description: string;
  skip: string;
  nav: { download: string; install: string; faq: string; github: string; language: string };
  subtitle: string;
  intro: string;
  download: string;
  downloadNote: string;
  scriptLink: string;
  shotAlt: string;
  featuresTitle: string;
  features: string[];
  installTitle: string;
  installIntro: string;
  steps: [string, string][];
  scriptTitle: string;
  scriptIntro: string;
  copy: string;
  copied: string;
  readScript: string;
  requireTitle: string;
  requirements: string[];
  faqTitle: string;
  faq: [string, string][];
  creditsTitle: string;
  credits: [string, string, string][];
  footer: string;
  trademark: string;
}

export const copy: Record<Language, Copy> = {
  en: {
    title: "POBT — Path of Building in your language",
    description:
      "POBT runs Path of Building Community with its interface translated to Simplified Chinese, Traditional Chinese or Korean. Free, open source, for Windows.",
    skip: "Skip to content",
    nav: { download: "Download", install: "Install", faq: "FAQ", github: "GitHub", language: "Language" },
    subtitle: "Your Path of Building, in your language",
    intro:
      "POBT runs the Path of Building Community you already have, with its whole interface translated: skills, items, passives, calculations. Simplified Chinese, Traditional Chinese and Korean, switchable any time.",
    download: "Download for Windows",
    downloadNote: "Free · .zip · 64-bit Windows 10 / 11 · no installer needed",
    scriptLink: "or install with PowerShell",
    shotAlt: "The POBT launcher: pick Path of Exile or Path of Exile 2 and a language, then Start.",
    featuresTitle: "What it does",
    features: [
      "Translates Path of Building for Path of Exile 1 and 2",
        "Adds Simplified Chinese, Traditional Chinese and Korean",
        "Your Path of Building files are never modified",
        "Ctrl+Shift+T switches to English and back",
        "Updates itself when a new version is out",
    ],
    installTitle: "Install in a minute",
    installIntro: "No setup program and no scripts: unpack the zip and run it.",
    steps: [
      ["Download", "Get pobt-windows-x86_64.zip with the button above."],
      ["Unpack", "Right-click the zip and choose Extract All, to any folder you like."],
      ["Run POBT.exe", "Windows may ask whether to run it, as with any new program: choose More info, then Run anyway."],
      ["Pick your POB", "POBT finds Path of Building on its own; if not, choose its folder. Pick the game and the language, then Start."],
    ],
    scriptTitle: "Prefer a script?",
    scriptIntro: "In PowerShell, this installs POBT to your user folder with Start menu and desktop shortcuts, and updates it when run again.",
    copy: "Copy",
    copied: "Copied",
    readScript: "Read the script",
    requireTitle: "What you need",
    requirements: [
      "64-bit Windows 10 or 11",
      "Path of Building Community (Path of Exile 1, 2, or both) installed",
      "Microsoft YaHei, which Windows includes, for the text",
    ],
    faqTitle: "Questions",
    faq: [
      [
        "Does POBT change my Path of Building?",
        "No. It runs Path of Building's own code and files as they are; your builds stay where Path of Building keeps them, and Path of Building still runs on its own.",
      ],
      [
        "How is this different from PoeCharm?",
        "POBT is a new program with the same idea, built on Native Shell. It uses the translations PoeCharm2's contributors wrote.",
      ],
      ["Can I switch back to English?", "Press Ctrl+Shift+T while POBT runs, or pick English in the launcher."],
      [
        "Path of Building has an update: does POBT keep up?",
        "Yes. POBT runs whatever Path of Building you have installed, so update Path of Building as usual.",
      ],
      [
        "A translation is wrong or missing.",
        "The translations are plain CSV files in the repository: open an issue or a pull request on GitHub.",
      ],
    ],
    creditsTitle: "Thanks",
    credits: [
      ["Path of Building Community", "the planner POBT runs", "https://github.com/PathOfBuildingCommunity/PathOfBuilding"],
      ["PoeCharm2", "the translations", "https://github.com/Chuanhsing/PoeCharm2"],
      ["Native Shell", "the framework POBT is built with", "https://nsh.dev"],
    ],
    footer: "POBT is open source under the Apache License 2.0.",
    trademark: "Path of Exile is a trademark of Grinding Gear Games. POBT is not affiliated with Grinding Gear Games or the Path of Building Community.",
  },
  "zh-CN": {
    title: "POBT — 中文版 Path of Building",
    description: "POBT 让 Path of Building Community 显示简体中文、繁體中文或한국어界面。免费、开源，适用于 Windows。",
    skip: "跳到正文",
    nav: { download: "下载", install: "安装", faq: "常见问题", github: "GitHub", language: "语言" },
    subtitle: "POB 构筑的多语言翻译",
    intro:
      "POBT 直接运行你电脑上已有的 Path of Building Community，并把整个界面翻译成中文：技能、物品、天赋、计算结果，一应俱全。支持简体中文、繁體中文和한국어，随时切换。",
    download: "下载 Windows 版",
    downloadNote: "免费 · zip 压缩包 · 64 位 Windows 10 / 11 · 无需安装",
    scriptLink: "或用 PowerShell 安装",
    shotAlt: "POBT 启动界面：选择流放之路或流放之路 2 和语言，然后启动。",
    featuresTitle: "功能",
    features: ["翻译流放之路 1 与 2 的 Path of Building", "新增简体中文、繁體中文与한국어", "绝不修改你的 Path of Building 文件", "Ctrl+Shift+T 随时切换英文", "有新版本时自动更新"],
    installTitle: "一分钟装好",
    installIntro: "不用安装程序，也不用敲命令：解压就能用。",
    steps: [
      ["下载", "点上面的按钮下载 pobt-windows-x86_64.zip。"],
      ["解压", "右键压缩包，选“全部解压缩”，放到任意文件夹。"],
      ["运行 POBT.exe", "第一次运行新程序时 Windows 可能会提示：点“更多信息”，再点“仍要运行”。"],
      ["选择 POB", "POBT 会自动找到 Path of Building；找不到时手动选择它的文件夹。选好游戏和语言，点“启动”。"],
    ],
    scriptTitle: "想用脚本安装？",
    scriptIntro: "在 PowerShell 中运行这条命令，会把 POBT 安装到用户目录，并创建开始菜单和桌面快捷方式；再次运行即可更新。",
    copy: "复制",
    copied: "已复制",
    readScript: "查看脚本",
    requireTitle: "运行需要",
    requirements: ["64 位 Windows 10 或 11", "已安装 Path of Building Community（流放之路 1、2 任一或全部）", "系统自带的微软雅黑字体"],
    faqTitle: "常见问题",
    faq: [
      [
        "POBT 会改动我的 Path of Building 吗？",
        "不会。POBT 原样运行 Path of Building 自己的代码和文件；你的 BD 仍保存在原来的位置，Path of Building 也照常可以单独运行。",
      ],
      ["和 PoeCharm 有什么不同？", "POBT 是基于 Native Shell 重写的新程序，思路相同，使用 PoeCharm2 贡献者们整理的翻译。"],
      ["能切回英文吗？", "运行中按 Ctrl+Shift+T，或在启动界面选择 English。"],
      ["Path of Building 更新了，POBT 跟得上吗？", "跟得上。POBT 运行的就是你安装的 Path of Building，照常更新 Path of Building 即可。"],
      ["发现翻译错误或缺失？", "翻译是仓库里的 CSV 文件，欢迎在 GitHub 提 Issue 或 Pull Request。"],
    ],
    creditsTitle: "致谢",
    credits: [
      ["Path of Building Community", "POBT 运行的构筑工具", "https://github.com/PathOfBuildingCommunity/PathOfBuilding"],
      ["PoeCharm2", "翻译数据", "https://github.com/Chuanhsing/PoeCharm2"],
      ["Native Shell", "POBT 使用的框架", "https://nsh.dev"],
    ],
    footer: "POBT 以 Apache License 2.0 开源。",
    trademark: "Path of Exile（流放之路）是 Grinding Gear Games 的商标。POBT 与 Grinding Gear Games 及 Path of Building Community 无关。",
  },
};
