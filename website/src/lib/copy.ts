// The site copy, English and Simplified Chinese.

export type Language = "en" | "zh-CN";

export const REPO = "https://github.com/huacnlee/pobt";
export const ZIP = `${REPO}/releases/latest/download/pobt-windows-x86_64.zip`;
export const RELEASES = `${REPO}/releases`;
export const POB = "https://pathofbuilding.community/";
export const SPONSOR = "https://github.com/sponsors/huacnlee";
/** The screenshots, under the site's base (public/screenshots). */
export const SHOT = "screenshots/launcher.webp";

export interface Shot {
  src: string;
  alt: string;
}

export interface Copy {
  title: string;
  description: string;
  skip: string;
  nav: { github: string; sponsor: string; language: string };
  subtitle: string;
  intro: string;
  download: string;
  downloadNote: string;
  scriptLink: string;
  shotAlt: string;
  /** The build editor's pages, in this language; then an AI analysis. */
  shots: Shot[];
  shotAi: Shot;
  featuresTitle: string;
  features: string[];
  /** Importing characters: what it does. */
  charactersTitle: string;
  charactersText: string[];
  perfTitle: string;
  perfIntro: string;
  perfHead: [string, string, string];
  perfRows: [string, string, string][];
  perfNote: string;
  installTitle: string;
  installIntro: string;
  steps: [string, string][];
  scriptTitle: string;
  scriptIntro: string;
  copy: string;
  copied: string;
  readScript: string;
  unixTitle: string;
  unixIntro: string;
  unixNote: string;
  requireTitle: string;
  requirements: string[];
  faqTitle: string;
  faq: [string, string][];
  sponsorTitle: string;
  sponsorIntro: string;
  sponsorButton: string;
  creditsTitle: string;
  credits: [string, string, string][];
  footer: string;
  trademark: string;
}

export const copy: Record<Language, Copy> = {
  en: {
    title: "POBT — Path of Building in your language",
    description:
      "POBT runs Path of Building Community with its interface translated to Simplified Chinese, Traditional Chinese or Korean. Free, open source, for Windows, macOS and Linux.",
    skip: "Skip to content",
    nav: { github: "GitHub", sponsor: "Sponsor", language: "Language" },
    subtitle: "Your Path of Building, in your language",
    intro:
      "POBT runs the Path of Building Community you already have, with its whole interface translated: skills, items, passives, calculations. Simplified Chinese, Traditional Chinese and Korean, switchable any time.",
    download: "Download for Windows",
    downloadNote: "Free · .zip · 64-bit Windows 10 / 11 · no installer needed",
    scriptLink: "or install with a script · macOS and Linux",
    shotAlt: "The POBT launcher: pick Path of Exile or Path of Exile 2 and a language, then Start.",
    shots: [
      { src: "screenshots/tree-en.webp", alt: "The passive tree" },
      { src: "screenshots/skills-en.webp", alt: "Skills and gems" },
      { src: "screenshots/items-en.webp", alt: "Items, with Path of Building's comparison" },
      { src: "screenshots/calcs-en.webp", alt: "The calculations" },
    ],
    shotAi: { src: "screenshots/ai-en.webp", alt: "An AI analysis of a build: its score, what to do first, and each part rated" },
    featuresTitle: "What it does",
    features: [
      "Translates Path of Building for Path of Exile 1 and 2",
        "Adds Simplified Chinese, Traditional Chinese and Korean",
        "Your Path of Building files are never modified",
        "Ctrl+Shift+T switches to English and back",
        "Updates itself when a new version is out",
        "Starts faster and idles at a sixth of the CPU of Path of Building's own program",
    ],
    charactersTitle: "Import characters",
    charactersText: [
      "From the Tools menu, list the characters of an account and make one a build: copy its code, or save it among Path of Building's.",
      "Path of Exile: the official site's realms (PC, Xbox, PlayStation), or Tencent's with its POESESSID; Tencent's Chinese items go back to English first.",
      "Path of Exile 2: signed in to pathofexile.com in the browser, as Path of Building 2 does; Tencent's, by a WeGame share link.",
    ],
    perfTitle: "In place of Path of Building's own program",
    perfIntro:
      "POBT runs Path of Building's own code with its own program in place of Path of Building.exe and its graphics runtime. On the same PC, with the same build open on the passive tree:",
    perfHead: ["", "POBT 0.2.0", "Path of Building 2.68.1"],
    perfRows: [
      ["Start to the build on screen", "2.70 s", "3.38 s"],
      ["Start to the build list", "1.51 s", "1.87 s"],
      ["CPU while idle", "8.0% of a core", "46.4% of a core"],
      ["Private memory", "893 MB", "1,011 MB"],
      ["Peak private memory while loading", "1,007 MB", "1,507 MB"],
      ["Working set", "725 MB", "517 MB"],
      ["Native files to run it", "50 MB (20 MB zipped)", "28 MB (11 MB zipped)"],
    ],
    perfNote:
      "The official 0.2.0 release, medians of 5 warm runs on an i7-13700KF, 32 GB, RTX 3060 Ti, Windows 11, both windows 1600×1000 in front, POBT showing Chinese. Path of Building uses less working set and less disk; POBT starts faster, uses less private memory and a sixth of the CPU at idle.",
    installTitle: "Install in a minute",
    installIntro: "No setup program and no scripts: unpack the zip and run it.",
    steps: [
      ["Download", "Get pobt-windows-x86_64.zip with the button above."],
      ["Unpack", "Right-click the zip and choose Extract All, to any folder you like."],
      ["Run POBT.exe", "Windows may ask whether to run it, as with any new program: choose More info, then Run anyway."],
      ["Pick your POB", "POBT finds Path of Building on its own; if not, choose its folder, or Install downloads it for you. Pick the game and the language, then Start."],
    ],
    scriptTitle: "Prefer a script?",
    scriptIntro: "In PowerShell, this installs POBT to your user folder with Start menu and desktop shortcuts, and updates it when run again.",
    copy: "Copy",
    copied: "Copied",
    readScript: "Read the script",
    unixTitle: "macOS and Linux",
    unixIntro: "On macOS (Apple silicon) or Linux (x86_64, arm64), run this in a terminal to install POBT, and again to update it.",
    unixNote: "It checks the download's checksum, then puts POBT.app in Applications on macOS; on Linux it installs to ~/.local/share/pobt with a pobt command and an app launcher entry.",
    requireTitle: "What you need",
    requirements: [
      "64-bit Windows 10 or 11, macOS on Apple silicon, or Linux (x86_64, arm64)",
      "Path of Building Community for Path of Exile 1, 2 or both: POBT installs it if you have none",
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
    sponsorTitle: "Support POBT",
    sponsorIntro: "POBT is free and always will be. If it saves you time in your builds, you can support its development on GitHub Sponsors.",
    sponsorButton: "Sponsor",
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
    description: "POBT 让 Path of Building Community 显示简体中文、繁體中文或한국어界面。免费、开源，适用于 Windows、macOS 和 Linux。",
    skip: "跳到正文",
    nav: { github: "GitHub", sponsor: "赞助", language: "语言" },
    subtitle: "POB 构筑的多语言翻译",
    intro:
      "POBT 直接运行你电脑上已有的 Path of Building Community，并把整个界面翻译成中文：技能、物品、天赋、计算结果，一应俱全。支持简体中文、繁體中文和한국어，随时切换。",
    download: "下载 Windows 版",
    downloadNote: "免费 · zip 压缩包 · 64 位 Windows 10 / 11 · 无需安装",
    scriptLink: "或用脚本安装 · macOS 与 Linux",
    shotAlt: "POBT 启动界面：选择流放之路或流放之路 2 和语言，然后启动。",
    shots: [
      { src: "screenshots/tree-zh.webp", alt: "天赋树" },
      { src: "screenshots/skills-zh.webp", alt: "技能与宝石" },
      { src: "screenshots/items-zh.webp", alt: "物品，带 Path of Building 的对比" },
      { src: "screenshots/calcs-zh.webp", alt: "计算页" },
    ],
    shotAi: { src: "screenshots/ai-zh.webp", alt: "构筑的 AI 分析：总分、优先改进项与各项评分" },
    featuresTitle: "功能",
    features: [
      "翻译流放之路 1 与 2 的 Path of Building",
      "新增简体中文、繁體中文与한국어",
      "绝不修改你的 Path of Building 文件",
      "Ctrl+Shift+T 随时切换英文",
      "有新版本时自动更新",
      "比 Path of Building 自带的程序启动更快，空闲时 CPU 只用六分之一",
    ],
    charactersTitle: "角色导入",
    charactersText: [
      "从「工具」菜单打开，列出账号下的角色，一键复制 POB 代码，或保存到 Path of Building 的构筑列表。",
      "流放之路：国际服（PC、Xbox、PS）或填写 POESESSID 的腾讯服；腾讯服的中文物品会先翻译回英文。",
      "流放之路 2：国际服像 Path of Building 2 一样在浏览器里登录 pathofexile.com 授权；腾讯服粘贴 WeGame 角色分享链接即可。",
    ],
    perfTitle: "可以代替 Path of Building 自带的程序",
    perfIntro:
      "POBT 运行的是 Path of Building 自己的代码，只是用 POBT 自己的程序代替了 Path of Building.exe 和它的图形运行时。在同一台电脑上，打开同一个 BD、停在天赋树页：",
    perfHead: ["", "POBT 0.2.0", "Path of Building 2.68.1"],
    perfRows: [
      ["启动到看到 BD", "2.70 秒", "3.38 秒"],
      ["启动到看到 BD 列表", "1.51 秒", "1.87 秒"],
      ["空闲时 CPU", "单核的 8.0%", "单核的 46.4%"],
      ["私有内存", "893 MB", "1,011 MB"],
      ["加载 BD 时的私有内存峰值", "1,007 MB", "1,507 MB"],
      ["工作集内存", "725 MB", "517 MB"],
      ["运行需要的原生文件", "50 MB（压缩后 20 MB）", "28 MB（压缩后 11 MB）"],
    ],
    perfNote:
      "数据为官方 0.2.0 发布版 5 次热启动的中位数；测试机为 i7-13700KF、32 GB 内存、RTX 3060 Ti、Windows 11，两个窗口都是 1600×1000 且在前台，POBT 显示中文。Path of Building 的工作集内存和磁盘占用更少；POBT 启动更快、私有内存更少，空闲 CPU 只有六分之一。",
    installTitle: "一分钟装好",
    installIntro: "不用安装程序，也不用敲命令：解压就能用。",
    steps: [
      ["下载", "点上面的按钮下载 pobt-windows-x86_64.zip。"],
      ["解压", "右键压缩包，选“全部解压缩”，放到任意文件夹。"],
      ["运行 POBT.exe", "第一次运行新程序时 Windows 可能会提示：点“更多信息”，再点“仍要运行”。"],
      ["选择 POB", "POBT 会自动找到 Path of Building；找不到时手动选择它的文件夹，或点“安装”自动下载。选好游戏和语言，点“启动”。"],
    ],
    scriptTitle: "想用脚本安装？",
    scriptIntro: "在 PowerShell 中运行这条命令，会把 POBT 安装到用户目录，并创建开始菜单和桌面快捷方式；再次运行即可更新。",
    copy: "复制",
    copied: "已复制",
    readScript: "查看脚本",
    unixTitle: "macOS 与 Linux",
    unixIntro: "在 macOS（Apple 芯片）或 Linux（x86_64、arm64）的终端里运行这条命令即可安装 POBT；再次运行即可更新。",
    unixNote: "脚本会先校验下载文件，再把 POBT.app 放进 macOS 的“应用程序”；Linux 上安装到 ~/.local/share/pobt，并添加 pobt 命令和应用启动器入口。",
    requireTitle: "运行需要",
    requirements: ["64 位 Windows 10 或 11、Apple 芯片的 macOS，或 Linux（x86_64、arm64）", "Path of Building Community（流放之路 1、2 任一或全部）：没有的话 POBT 可以帮你安装", "系统自带的微软雅黑字体"],
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
    sponsorTitle: "支持 POBT",
    sponsorIntro: "POBT 免费，以后也会一直免费。如果它帮你省下了构筑的时间，欢迎通过 GitHub Sponsors 支持它的开发。",
    sponsorButton: "赞助",
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
