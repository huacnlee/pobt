// Builds analysed by an AI on the user's machine, Claude Code or Codex (`Pob.aiStart`): the launcher's Analysis
// page's words in each language, and the report the native side gives it.

/** An agent installed (`Pob.aiAgents`). */
export interface Agent {
  id: "claude" | "codex";
  name: string;
  path: string;
}

/** A folder of POB's builds (`Pob.aiBuilds`): where it is, and its folders and builds. */
export interface BuildRoot {
  root: string;
  tree: BuildEntry[];
}

export interface BuildEntry {
  name: string;
  path: string;
  dir: boolean;
  children?: BuildEntry[];
}

export type DimensionKey = "offence" | "defence" | "recovery" | "ailments" | "utility" | "gear";

export const DIMENSIONS: DimensionKey[] = ["offence", "defence", "recovery", "ailments", "utility", "gear"];

/** A dimension of the report: its score out of 10, its key numbers, and what is good, bad and to change. */
export interface Dimension {
  key: DimensionKey;
  score: number;
  verdict: string;
  metrics?: { label: string; value: string }[];
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
}

/** The agent's report: `score` out of 100. */
export interface Report {
  title?: string;
  summary?: string;
  score?: number;
  dimensions: Dimension[];
  priorities?: string[];
}

/** The analysis running or last run (`Pob.aiProgress`). */
export interface AiProgress {
  state: "running" | "done" | "failed" | "cancelled";
  agent: string;
  build: string;
  step: "reading" | "thinking" | string;
  activity: string;
  error: string;
  report: Report | null;
  raw: string;
}

export interface AnalysisStrings {
  open: string;
  back: string;
  title: string;
  /** The language the agent writes in, named in English for it. */
  answerIn: string;
  agent: string;
  /** No agent installed: what to install. */
  noAgent: { title: string; body: string; claude: string; codex: string; refresh: string };
  source: { builds: string; code: string };
  noBuilds: string;
  pickFile: string;
  codeLabel: string;
  codeHint: string;
  question: string;
  questionHint: string;
  analyse: string;
  stop: string;
  empty: string;
  /** Running, `seconds` so far. */
  steps: Record<string, string>;
  elapsed: (seconds: number) => string;
  dimensions: Record<DimensionKey, string>;
  overall: string;
  priorities: string;
  strengths: string;
  weaknesses: string;
  suggestions: string;
  copy: string;
  copied: string;
  /** The answer was not a report: its text as it came. */
  unparsed: string;
  cancelled: string;
  errors: Record<string, string>;
  failed: (why: string) => string;
}

const STRINGS: Record<string, AnalysisStrings> = {
  en: {
    open: "AI build analysis",
    back: "Back",
    title: "AI ANALYSIS",
    answerIn: "English",
    agent: "Analyse with",
    noAgent: {
      title: "No AI found",
      body: "POBT asks the AI already on your computer: Claude Code or Codex. Install one, sign in to it once in a terminal, then come back.",
      claude: "Install Claude Code",
      codex: "Install Codex",
      refresh: "Look again",
    },
    source: { builds: "Builds", code: "Build code" },
    noBuilds: "No builds found in Path of Building's folders",
    pickFile: "Choose a file…",
    codeLabel: "Build code",
    codeHint: "Paste a build code (Export in Path of Building)",
    question: "Your question (optional)",
    questionHint: "e.g. Can it do Uber bosses?",
    analyse: "Analyse",
    stop: "Stop",
    empty: "Choose a build and press Analyse: the AI rates its damage, defences, recovery, ailments, utility and gear",
    steps: { reading: "Reading the build…", thinking: "The AI is analysing the build…" },
    elapsed: (s) => `${s}s`,
    dimensions: { offence: "Damage", defence: "Defence", recovery: "Recovery", ailments: "Ailments", utility: "Utility", gear: "Gear" },
    overall: "Endgame ready",
    priorities: "What to do first",
    strengths: "Strengths",
    weaknesses: "Weaknesses",
    suggestions: "Suggestions",
    copy: "Copy",
    copied: "Report copied",
    unparsed: "The AI's answer was not a report; here it is as it came:",
    cancelled: "Analysis stopped",
    errors: {
      noAgent: "The AI's program was not found: install it, or look again",
      noBuild: "The build's file cannot be read",
      badBuild: "This is not a Path of Building build",
      badCode: "This is not a build code",
    },
    failed: (why) => `The AI failed: ${why}`,
  },
  "zh-rCN": {
    open: "AI 构筑分析",
    back: "返回",
    title: "AI 分析",
    answerIn: "Simplified Chinese",
    agent: "分析工具",
    noAgent: {
      title: "未找到 AI",
      body: "POBT 调用你电脑上已安装的 AI：Claude Code 或 Codex。安装其一，并在终端里登录一次，再回来。",
      claude: "安装 Claude Code",
      codex: "安装 Codex",
      refresh: "重新检测",
    },
    source: { builds: "构筑", code: "构筑代码" },
    noBuilds: "Path of Building 的文件夹里没有构筑",
    pickFile: "选择文件…",
    codeLabel: "构筑代码",
    codeHint: "粘贴构筑代码（Path of Building 的导出）",
    question: "你的问题（可选）",
    questionHint: "例如：能打终极首领吗？",
    analyse: "开始分析",
    stop: "停止",
    empty: "选择构筑并点击开始分析：AI 会评估它的伤害、防御、恢复、异常状态、功能与装备",
    steps: { reading: "读取构筑…", thinking: "AI 正在分析构筑…" },
    elapsed: (s) => `${s} 秒`,
    dimensions: { offence: "伤害", defence: "防御", recovery: "恢复", ailments: "异常状态", utility: "功能", gear: "装备" },
    overall: "终局就绪度",
    priorities: "优先改进",
    strengths: "优势",
    weaknesses: "不足",
    suggestions: "建议",
    copy: "复制",
    copied: "已复制报告",
    unparsed: "AI 的回答不是报告格式，原文如下：",
    cancelled: "已停止分析",
    errors: {
      noAgent: "找不到 AI 的程序：请安装，或重新检测",
      noBuild: "无法读取构筑文件",
      badBuild: "这不是 Path of Building 的构筑",
      badCode: "这不是构筑代码",
    },
    failed: (why) => `AI 运行失败：${why}`,
  },
  "zh-rTW": {
    open: "AI 構築分析",
    back: "返回",
    title: "AI 分析",
    answerIn: "Traditional Chinese",
    agent: "分析工具",
    noAgent: {
      title: "未找到 AI",
      body: "POBT 呼叫你電腦上已安裝的 AI：Claude Code 或 Codex。安裝其一，並在終端機裡登入一次，再回來。",
      claude: "安裝 Claude Code",
      codex: "安裝 Codex",
      refresh: "重新偵測",
    },
    source: { builds: "構築", code: "構築代碼" },
    noBuilds: "Path of Building 的資料夾裡沒有構築",
    pickFile: "選擇檔案…",
    codeLabel: "構築代碼",
    codeHint: "貼上構築代碼（Path of Building 的匯出）",
    question: "你的問題（選填）",
    questionHint: "例如：能打終極首領嗎？",
    analyse: "開始分析",
    stop: "停止",
    empty: "選擇構築並按下開始分析：AI 會評估它的傷害、防禦、恢復、異常狀態、功能與裝備",
    steps: { reading: "讀取構築…", thinking: "AI 正在分析構築…" },
    elapsed: (s) => `${s} 秒`,
    dimensions: { offence: "傷害", defence: "防禦", recovery: "恢復", ailments: "異常狀態", utility: "功能", gear: "裝備" },
    overall: "終局就緒度",
    priorities: "優先改進",
    strengths: "優勢",
    weaknesses: "不足",
    suggestions: "建議",
    copy: "複製",
    copied: "已複製報告",
    unparsed: "AI 的回答不是報告格式，原文如下：",
    cancelled: "已停止分析",
    errors: {
      noAgent: "找不到 AI 的程式：請安裝，或重新偵測",
      noBuild: "無法讀取構築檔案",
      badBuild: "這不是 Path of Building 的構築",
      badCode: "這不是構築代碼",
    },
    failed: (why) => `AI 執行失敗：${why}`,
  },
  "ko-KR": {
    open: "AI 빌드 분석",
    back: "뒤로",
    title: "AI 분석",
    answerIn: "Korean",
    agent: "분석 도구",
    noAgent: {
      title: "AI를 찾을 수 없습니다",
      body: "POBT는 컴퓨터에 설치된 AI(Claude Code 또는 Codex)를 사용합니다. 하나를 설치하고 터미널에서 한 번 로그인한 뒤 돌아오세요.",
      claude: "Claude Code 설치",
      codex: "Codex 설치",
      refresh: "다시 찾기",
    },
    source: { builds: "빌드", code: "빌드 코드" },
    noBuilds: "Path of Building 폴더에 빌드가 없습니다",
    pickFile: "파일 선택…",
    codeLabel: "빌드 코드",
    codeHint: "빌드 코드를 붙여 넣으세요(Path of Building의 내보내기)",
    question: "질문(선택)",
    questionHint: "예: 우버 보스를 잡을 수 있나요?",
    analyse: "분석",
    stop: "중지",
    empty: "빌드를 고르고 분석을 누르세요: AI가 피해, 방어, 회복, 상태 이상, 유틸리티, 장비를 평가합니다",
    steps: { reading: "빌드를 읽는 중…", thinking: "AI가 빌드를 분석하는 중…" },
    elapsed: (s) => `${s}초`,
    dimensions: { offence: "피해", defence: "방어", recovery: "회복", ailments: "상태 이상", utility: "유틸리티", gear: "장비" },
    overall: "엔드게임 준비도",
    priorities: "우선 개선",
    strengths: "강점",
    weaknesses: "약점",
    suggestions: "제안",
    copy: "복사",
    copied: "보고서를 복사했습니다",
    unparsed: "AI의 답이 보고서 형식이 아닙니다. 원문:",
    cancelled: "분석을 중지했습니다",
    errors: {
      noAgent: "AI 프로그램을 찾을 수 없습니다: 설치하거나 다시 찾으세요",
      noBuild: "빌드 파일을 읽을 수 없습니다",
      badBuild: "Path of Building 빌드가 아닙니다",
      badCode: "빌드 코드가 아닙니다",
    },
    failed: (why) => `AI 실행 실패: ${why}`,
  },
};

export function analysisStrings(language: string | null): AnalysisStrings {
  return STRINGS[language ?? "en"] ?? STRINGS.en;
}

/** Where to get each agent. */
export const AGENT_SITES = {
  claude: "https://claude.com/claude-code",
  codex: "https://github.com/openai/codex",
};

/** The words for an analysis' error code (`ai.rs`'s), or the error itself. */
export function aiErrorText(s: AnalysisStrings, error: string): string {
  if (error.startsWith("agentFailed: ")) return s.failed(error.slice("agentFailed: ".length));
  return s.errors[error] ?? error;
}

/** A report as text, to paste elsewhere. */
export function reportText(s: AnalysisStrings, r: Report): string {
  const lines: string[] = [];
  if (r.title) lines.push(`# ${r.title}`);
  if (r.score !== undefined) lines.push(`${s.overall}: ${r.score}/100`);
  if (r.summary) lines.push("", r.summary);
  if (r.priorities?.length) lines.push("", `## ${s.priorities}`, ...r.priorities.map((p, i) => `${i + 1}. ${p}`));
  for (const d of r.dimensions) {
    lines.push("", `## ${s.dimensions[d.key] ?? d.key} ${d.score}/10`, d.verdict);
    if (d.metrics?.length) lines.push(d.metrics.map((m) => `${m.label}: ${m.value}`).join(" · "));
    for (const [label, list] of [
      [s.strengths, d.strengths],
      [s.weaknesses, d.weaknesses],
      [s.suggestions, d.suggestions],
    ] as const) {
      if (list?.length) lines.push(`${label}:`, ...list.map((x) => `- ${x}`));
    }
  }
  return lines.join("\n");
}
